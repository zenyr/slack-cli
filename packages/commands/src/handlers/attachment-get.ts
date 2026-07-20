import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import {
  isCliErrorResult,
  mapSlackClientError,
  readBooleanOption,
  resolveTokenForContext,
} from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken } from "../slack/types";
import { isRecord } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "attachment.get";
const USAGE_HINT =
  "Usage: slack attachment get <file-id(required,non-empty)> [--content[=<bool>]] [--save[=<bool>]] [--json]";
const MAX_ATTACHMENT_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const TEMP_DIR_PREFIX = "slack-attachment-";
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ATTACHMENT_TOOL_NAME = "attachment_get_data";
const TEXTUAL_APPLICATION_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/x-sh",
]);
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "text/html": ".html",
  "text/markdown": ".md",
  "text/plain": ".txt",
};

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
  fetchFileText: (
    urlPrivate: string,
    maxBytes: number,
  ) => Promise<{
    content: string;
    byteLength: number;
    contentType?: string;
  }>;
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

const hasAttachmentMetadataClient = (value: unknown): value is AttachmentMetadataClient => {
  return (
    isRecord(value) &&
    typeof value.fetchFileInfo === "function" &&
    typeof value.fetchFileText === "function" &&
    typeof value.fetchFileBinary === "function"
  );
};

const readSaveOption = (options: CliOptions): boolean | CliResult => {
  return readBooleanOption(options, "save", "attachment get", USAGE_HINT, COMMAND_ID, false);
};

const readContentOption = (options: CliOptions): boolean | CliResult => {
  return readBooleanOption(options, "content", "attachment get", USAGE_HINT, COMMAND_ID, false);
};

const isAttachmentToolEnabled = (env: Record<string, string | undefined>): boolean => {
  const attachmentToolValue = env.SLACK_MCP_ATTACHMENT_TOOL?.trim().toLowerCase();
  if (
    attachmentToolValue === "true" ||
    attachmentToolValue === "1" ||
    attachmentToolValue === "yes"
  ) {
    return true;
  }

  return (env.SLACK_MCP_ENABLED_TOOLS ?? "")
    .split(",")
    .some((toolName) => toolName.trim() === ATTACHMENT_TOOL_NAME);
};

const normalizeMimeType = (mimetype: string | undefined): string => {
  return (mimetype ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
};

const isTextualMimeType = (mimetype: string | undefined): boolean => {
  const normalized = normalizeMimeType(mimetype);
  return normalized.startsWith("text/") || TEXTUAL_APPLICATION_MIME_TYPES.has(normalized);
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

const resolveSavedFileExtension = (metadata: SlackFileInfoMetadata): string => {
  const nameExtension = extname(metadata.name).toLowerCase();
  if (/^\.[a-z0-9]{1,16}$/.test(nameExtension)) {
    return nameExtension;
  }

  if (metadata.mimetype !== undefined) {
    const [mimeType] = metadata.mimetype.toLowerCase().split(";");
    if (mimeType !== undefined) {
      const extension = MIME_TYPE_EXTENSIONS[mimeType.trim()];
      if (extension !== undefined) {
        return extension;
      }
    }
  }

  const filetype = metadata.filetype?.toLowerCase();
  if (filetype !== undefined && /^[a-z0-9]{1,16}$/.test(filetype)) {
    return `.${filetype === "jpeg" ? "jpg" : filetype}`;
  }

  return "";
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
    if (isCliErrorResult(saveToFileOrError)) {
      return saveToFileOrError;
    }

    const includeContentOrError = readContentOption(request.options);
    if (isCliErrorResult(includeContentOrError)) {
      return includeContentOrError;
    }

    if (saveToFileOrError && includeContentOrError) {
      return createError(
        "INVALID_ARGUMENT",
        "attachment get cannot use --content and --save together. [CONFLICTING_ARGUMENTS]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (!isAttachmentToolEnabled(deps.env)) {
      return createError(
        "INVALID_ARGUMENT",
        "attachment get is disabled. [ATTACHMENT_TOOL_DISABLED]",
        "Set SLACK_MCP_ATTACHMENT_TOOL=true or include attachment_get_data in SLACK_MCP_ENABLED_TOOLS.",
        COMMAND_ID,
      );
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

      if (saveToFileOrError === false && includeContentOrError === false) {
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

      if (fileMetadata.size !== undefined && fileMetadata.size > MAX_ATTACHMENT_DOWNLOAD_BYTES) {
        return createError(
          "INVALID_ARGUMENT",
          `Attachment exceeds max size: ${fileMetadata.size} bytes. [ATTACHMENT_TOO_LARGE]`,
          `Use a file at or below ${MAX_ATTACHMENT_DOWNLOAD_BYTES} bytes.`,
          COMMAND_ID,
        );
      }

      if (fileMetadata.urlPrivate === undefined || fileMetadata.urlPrivate.trim().length === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "Attachment metadata does not include a private download URL. [ATTACHMENT_DOWNLOAD_UNAVAILABLE]",
          "Ensure file is accessible and files.info includes url_private_download or url_private.",
          COMMAND_ID,
        );
      }

      if (includeContentOrError) {
        if (isTextualMimeType(fileMetadata.mimetype)) {
          const textPayload = await client.fetchFileText(
            fileMetadata.urlPrivate,
            MAX_ATTACHMENT_DOWNLOAD_BYTES,
          );
          return {
            ok: true,
            command: COMMAND_ID,
            message: `Attachment content loaded for ${outputMetadata.id}.`,
            data: {
              file_id: outputMetadata.id,
              filename: outputMetadata.name,
              mimetype: fileMetadata.mimetype ?? textPayload.contentType ?? "",
              size: textPayload.byteLength,
              encoding: "none",
              content: textPayload.content,
            },
            textLines: [textPayload.content],
          };
        }

        const binaryPayload = await client.fetchFileBinary(
          fileMetadata.urlPrivate,
          MAX_ATTACHMENT_DOWNLOAD_BYTES,
        );
        return {
          ok: true,
          command: COMMAND_ID,
          message: `Attachment content loaded for ${outputMetadata.id}.`,
          data: {
            file_id: outputMetadata.id,
            filename: outputMetadata.name,
            mimetype: fileMetadata.mimetype ?? binaryPayload.contentType ?? "",
            size: binaryPayload.byteLength,
            encoding: "base64",
            content: binaryPayload.contentBase64,
          },
          textLines: [binaryPayload.contentBase64],
        };
      }

      const binaryPayload = await client.fetchFileBinary(
        fileMetadata.urlPrivate,
        MAX_ATTACHMENT_DOWNLOAD_BYTES,
      );
      const tempDirectoryPath = await deps.createTempDirectory();
      await deps.setPathPermissions(tempDirectoryPath, 0o700);

      const outputFilePath = join(
        tempDirectoryPath,
        `${deps.generateUlid()}${resolveSavedFileExtension(fileMetadata)}`,
      );
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
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const attachmentGetHandler = createAttachmentGetHandler();
