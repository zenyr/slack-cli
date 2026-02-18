import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken } from "../slack/types";
import { isRecord, isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "attachment.get";
const USAGE_HINT = "Usage: slack attachment get <file-id> [--json]";

type SlackAttachmentMetadata = {
  id: string;
  name: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
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

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const getAttachmentMetadata =
        isRecord(client) && typeof client.getAttachmentMetadata === "function"
          ? client.getAttachmentMetadata
          : undefined;

      if (getAttachmentMetadata === undefined) {
        return createError(
          "INTERNAL_ERROR",
          "attachment get client contract is unavailable.",
          "Update to a build that includes attachment metadata client support.",
          COMMAND_ID,
        );
      }

      const metadata = await getAttachmentMetadata(fileId);

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Attachment metadata loaded for ${metadata.id}.`,
        data: {
          file: metadata,
        },
        textLines: buildTextLines(metadata),
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const attachmentGetHandler = createAttachmentGetHandler();
