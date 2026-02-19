import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.delete";
const USAGE_HINT = "Usage: slack messages delete <channel-id> <timestamp> [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesDeleteHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackPostWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesDeleteHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const isValidSlackTimestamp = (value: string): boolean => {
  return /^\d+\.\d+$/.test(value);
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.delete.",
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

export const createMessagesDeleteHandler = (
  depsOverrides: Partial<MessagesDeleteHandlerDeps> = {},
) => {
  const deps: MessagesDeleteHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages delete requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawTimestamp = request.positionals[1];
    if (rawTimestamp === undefined || rawTimestamp.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages delete requires <timestamp>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const channel = rawChannel.trim();
    const ts = rawTimestamp.trim();
    if (!isValidSlackTimestamp(ts)) {
      return createError(
        "INVALID_ARGUMENT",
        `messages delete <timestamp> must match Slack timestamp format seconds.fraction. Received: ${ts}`,
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.deleteMessage({ channel, ts });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Message deleted in ${data.channel}.`,
        data: {
          channel: data.channel,
          ts: data.ts,
        },
        textLines: [`Deleted message in ${data.channel} at ${data.ts}.`],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesDeleteHandler = createMessagesDeleteHandler();
