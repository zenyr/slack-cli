import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { parseSlackMessagePermalink } from "../messages/permalink";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.delete";
const USAGE_HINT =
  "Usage: slack messages delete <channel-id(required,non-empty)> <timestamp(required,non-empty)> [--json] or slack messages delete <message-url(required,non-empty)> [--json]";

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

const resolveTarget = (request: CommandRequest): { channel: string; ts: string } | CliResult => {
  const firstPositional = request.positionals[0];
  if (firstPositional === undefined || firstPositional.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages delete requires <channel-id> or <message-url>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const permalinkResult = parseSlackMessagePermalink(firstPositional);
  if (permalinkResult.kind === "invalid") {
    return createError(
      "INVALID_ARGUMENT",
      `invalid messages delete message-url: ${permalinkResult.reason}`,
      `${permalinkResult.hint} Input: ${firstPositional}`,
      COMMAND_ID,
    );
  }

  if (permalinkResult.kind === "ok") {
    return {
      channel: permalinkResult.channel,
      ts: permalinkResult.ts,
    };
  }

  const channel = firstPositional.trim();
  const rawTimestamp = request.positionals[1];
  if (rawTimestamp === undefined || rawTimestamp.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages delete requires <timestamp> when <channel-id> is used. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const ts = rawTimestamp.trim();
  if (!isValidSlackTimestamp(ts)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages delete <timestamp> must match Slack timestamp format seconds.fraction. Received: ${ts}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return { channel, ts };
};

export const createMessagesDeleteHandler = (
  depsOverrides: Partial<MessagesDeleteHandlerDeps> = {},
) => {
  const deps: MessagesDeleteHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const targetOrError = resolveTarget(request);
    if ("ok" in targetOrError) {
      return targetOrError;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.deleteMessage(targetOrError);

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
