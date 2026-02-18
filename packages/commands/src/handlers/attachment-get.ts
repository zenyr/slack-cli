import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken } from "../slack/types";
import { isRecord, isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "attachment.get";
const USAGE_HINT = "Usage: slack attachment get <file-id> [--json]";
const ATTACHMENT_TOOL_ENV_KEY = "SLACK_MCP_ATTACHMENT_TOOL";
const MAX_ATTACHMENT_TEXT_BYTES = 5 * 1024 * 1024;

type SlackAttachmentMetadata = {
  id: string;
  name: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
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
  ) => Promise<{ content: string; byteLength: number; contentType?: string }>;
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
  env: Record<string, string | undefined>;
};

const defaultDeps: AttachmentGetHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
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
    typeof value.fetchFileText === "function"
  );
};

const isAttachmentToolEnabled = (env: Record<string, string | undefined>): boolean => {
  const value = env[ATTACHMENT_TOOL_ENV_KEY];
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
};

const mapFileMetadata = (value: SlackFileInfoMetadata): SlackAttachmentMetadata => {
  return {
    id: value.id,
    name: value.name,
    mimetype: value.mimetype,
    filetype: value.filetype,
    size: value.size,
    url_private: value.urlPrivate,
  };
};

const buildTextLines = (metadata: SlackAttachmentMetadata): string[] => {
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

  if (metadata.url_private !== undefined && metadata.url_private.length > 0) {
    lines.push(`Private URL: ${metadata.url_private}`);
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

    if (!isAttachmentToolEnabled(deps.env)) {
      return createError(
        "INVALID_ARGUMENT",
        "attachment get text path is disabled. [ATTACHMENT_TOOL_DISABLED]",
        "Set SLACK_MCP_ATTACHMENT_TOOL=true to enable text content retrieval for attachment get.",
        COMMAND_ID,
      );
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      if (!hasAttachmentMetadataClient(client)) {
        return createError(
          "INTERNAL_ERROR",
          "attachment get client contract is unavailable.",
          "Update to a build that includes attachment metadata client support.",
          COMMAND_ID,
        );
      }

      const metadata = mapFileMetadata(await client.fetchFileInfo(fileId));
      if (metadata.size !== undefined && metadata.size > MAX_ATTACHMENT_TEXT_BYTES) {
        return createError(
          "INVALID_ARGUMENT",
          `attachment get text path supports up to ${MAX_ATTACHMENT_TEXT_BYTES} bytes. Received: ${metadata.size}. [ATTACHMENT_TEXT_TOO_LARGE]`,
          "Download a smaller text file or use another tool for larger/binary attachments.",
          COMMAND_ID,
        );
      }

      if (metadata.url_private === undefined || metadata.url_private.trim().length === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "Attachment metadata does not include a private download URL. [ATTACHMENT_TEXT_UNAVAILABLE]",
          "Ensure file is accessible and files.info includes url_private.",
          COMMAND_ID,
        );
      }

      const textPayload = await client.fetchFileText(
        metadata.url_private,
        MAX_ATTACHMENT_TEXT_BYTES,
      );
      const textContentLines =
        textPayload.content.length === 0 ? ["(empty)"] : textPayload.content.split("\n");

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Attachment metadata and text loaded for ${metadata.id}.`,
        data: {
          file: metadata,
          text: {
            content: textPayload.content,
            byte_length: textPayload.byteLength,
            content_type: textPayload.contentType,
          },
        },
        textLines: [...buildTextLines(metadata), "", "Text content:", ...textContentLines],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const attachmentGetHandler = createAttachmentGetHandler();
