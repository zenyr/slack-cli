import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken } from "../slack/types";
import { isRecord, isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "attachment.get";
const USAGE_HINT =
  "Usage: slack attachment get <file-id(required,non-empty)> [--save[=<bool>]] [--json]";
const BOOLEAN_OPTION_VALUES_HINT = "Use boolean value: true|false|1|0|yes|no|on|off.";
const MAX_ATTACHMENT_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const TEMP_DIR_PREFIX = "slack-attachment-";
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

type SlackAttachmentOutputMetadata = {
  id: string;
  name: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
};

type SlackFileInfoMetadata = {
  id: string;
  name: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  urlPrivate?: string;
};

type AttachmentMetadataClient = {
  fetchFileInfo: (fileId: string) => Promise<SlackFileInfoMetadata>;
  fetchFileBinary: (
    urlPrivate: string,
    maxBytes: number,
  ) => Promise<{
    contentBase64: string;
    byteLength: number;
    contentType?: string;
    encoding: "base64";
  }>;
};

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type AttachmentGetHandlerDeps = {
  createClient: (options?: CreateClientOptions) => unknown;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  createTempDirectory: () => Promise<string>;
  writeBinaryFile: (filePath: string, data: Uint8Array) => Promise<void>;
  setPathPermissions: (filePath: string, mode: number) => Promise<void>;
  generateUlid: () => string;
  env: Record<string, string | undefined>;
};

const defaultDeps: AttachmentGetHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  createTempDirectory: async () => {
    return await mkdtemp(join(tmpdir(), TEMP_DIR_PREFIX));
  },
  writeBinaryFile: async (filePath: string, data: Uint8Array) => {
    await writeFile(filePath, data);
  },
  setPathPermissions: async (filePath: string, mode: number) => {
    await chmod(filePath, mode);
  },
  generateUlid: () => {
    const time = BigInt(Date.now());
    const randomness = randomBytes(10);
    let randomValue = 0n;

    for (const byte of randomness) {
      randomValue = (randomValue << 8n) | BigInt(byte);
    }

    const encodeBase32 = (value: bigint, length: number): string => {
      let working = value;
      let encoded = "";

      for (let index = 0; index < length; index += 1) {
        const characterIndex = Number(working & 31n);
        const character = ULID_ALPHABET[characterIndex];
        if (character === undefined) {
          return "";
        }
        encoded = `${character}${encoded}`;
        working >>= 5n;
      }

      return encoded;
    };

    return `${encodeBase32(time, 10)}${encodeBase32(randomValue, 16)}`;
  },
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for attachment.get.",
      "Retry with --json for structured output.",
      COMMAND_ID,
    );
  }

  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_AUTH_ERROR":
      return createError(
        "INVALID_ARGUMENT",
        `${error.message} [AUTH_ERROR]`,
        error.hint,
        COMMAND_ID,
      );
    case "SLACK_API_ERROR": {
      const reason =
        error.details === undefined ? error.message : `${error.message} ${error.details}`;
      return createError("INVALID_ARGUMENT", `${reason} [SLACK_API_ERROR]`, error.hint, COMMAND_ID);
    }
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

const hasAttachmentMetadataClient = (value: unknown): value is AttachmentMetadataClient => {
  return (
    isRecord(value) &&
    typeof value.fetchFileInfo === "function" &&
    typeof value.fetchFileBinary === "function"
  );
};

const readSaveOption = (options: CliOptions): boolean | CliResult => {
  const rawValue = options.save;
  if (rawValue === undefined) {
    return false;
  }

  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return createError(
    "INVALID_ARGUMENT",
    `attachment get --save must be boolean when provided with '=...'. Received: ${rawValue}`,
    `${BOOLEAN_OPTION_VALUES_HINT} ${USAGE_HINT}`,
    COMMAND_ID,
  );
};

const mapFileMetadata = (value: SlackFileInfoMetadata): SlackAttachmentOutputMetadata => {
  return {
    id: value.id,
    name: value.name,
    mimetype: value.mimetype,
    filetype: value.filetype,
    size: value.size,
  };
};

const buildTextLines = (metadata: SlackAttachmentOutputMetadata): string[] => {
  const lines = [`Attachment ${metadata.id}: ${metadata.name}`];

  if (metadata.mimetype !== undefined && metadata.mimetype.length > 0) {
    lines.push(`MIME type: ${metadata.mimetype}`);
  }

  if (metadata.filetype !== undefined && metadata.filetype.length > 0) {
    lines.push(`File type: ${metadata.filetype}`);
  }

  if (metadata.size !== undefined) {
    lines.push(`Size: ${metadata.size}`);
  }

  return lines;
};

export const createAttachmentGetHandler = (
  depsOverrides: Partial<AttachmentGetHandlerDeps> = {},
) => {
  const deps: AttachmentGetHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawFileId = request.positionals[0];
    if (rawFileId === undefined || rawFileId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "attachment get requires <file-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const fileId = rawFileId.trim();
    const saveToFileOrError = readSaveOption(request.options);
    if (typeof saveToFileOrError !== "boolean") {
      return saveToFileOrError;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      if (!hasAttachmentMetadataClient(client)) {
        return createError(
          "INTERNAL_ERROR",
          "attachment get client contract is unavailable.",
          "Update to a build that includes attachment metadata client support.",
          COMMAND_ID,
        );
      }

      const fileMetadata = await client.fetchFileInfo(fileId);
      const outputMetadata = mapFileMetadata(fileMetadata);

      if (saveToFileOrError === false) {
        return {
          ok: true,
          command: COMMAND_ID,
          message: `Attachment metadata loaded for ${outputMetadata.id}.`,
          data: {
            file: outputMetadata,
            saved: false,
          },
          textLines: [
            ...buildTextLines(outputMetadata),
            "",
            "Use --save to download this attachment.",
          ],
        };
      }

      if (fileMetadata.urlPrivate === undefined || fileMetadata.urlPrivate.trim().length === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "Attachment metadata does not include a private download URL. [ATTACHMENT_DOWNLOAD_UNAVAILABLE]",
          "Ensure file is accessible and files.info includes url_private.",
          COMMAND_ID,
        );
      }

      const binaryPayload = await client.fetchFileBinary(
        fileMetadata.urlPrivate,
        MAX_ATTACHMENT_DOWNLOAD_BYTES,
      );
      const tempDirectoryPath = await deps.createTempDirectory();
      await deps.setPathPermissions(tempDirectoryPath, 0o700);

      const outputFilePath = join(tempDirectoryPath, deps.generateUlid());
      const binaryContent = Buffer.from(binaryPayload.contentBase64, "base64");

      await deps.writeBinaryFile(outputFilePath, binaryContent);
      await deps.setPathPermissions(outputFilePath, 0o600);

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Attachment metadata loaded and file saved for ${outputMetadata.id}.`,
        data: {
          file: outputMetadata,
          saved: true,
          saved_path: outputFilePath,
          saved_bytes: binaryPayload.byteLength,
          saved_content_type: binaryPayload.contentType,
        },
        textLines: [...buildTextLines(outputMetadata), "", `Saved to: ${outputFilePath}`],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const attachmentGetHandler = createAttachmentGetHandler();
