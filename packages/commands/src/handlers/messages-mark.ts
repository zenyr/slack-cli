import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type {
  ResolvedSlackToken,
  SlackConversationMarkWebApiClient,
  SlackWebApiClient,
} from "../slack/types";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.mark";
const USAGE_HINT =
  "Usage: slack messages mark <channel-id(required,non-empty)> [--ts=<timestamp>] [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesMarkHandlerDeps = {
  createClient: (
    options?: CreateClientOptions,
  ) => SlackWebApiClient & SlackConversationMarkWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesMarkHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const isEnabled = (value: string | undefined): boolean => {
  return value === "1" || value === "true" || value === "yes";
};

const readTimestampOption = (request: CommandRequest): string | undefined | CliResult => {
  const value = request.options.ts;
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages mark --ts requires a timestamp value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const timestamp = value.trim();
  if (!/^\d+\.\d+$/.test(timestamp)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages mark --ts must match Slack timestamp format seconds.fraction. Received: ${timestamp}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return timestamp;
};

const isCliErrorResult = (value: string | undefined | CliResult): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const mapError = (error: unknown): CliResult => {
  if (isSlackClientError(error)) {
    switch (error.code) {
      case "SLACK_CONFIG_ERROR":
      case "SLACK_AUTH_ERROR":
      case "SLACK_API_ERROR":
        return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
      case "SLACK_HTTP_ERROR":
      case "SLACK_RESPONSE_ERROR":
        return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
    }
  }

  return createError(
    "INTERNAL_ERROR",
    "Unexpected messages.mark failure.",
    "Try again with --json for structured output.",
    COMMAND_ID,
  );
};

export const createMessagesMarkHandler = (depsOverrides: Partial<MessagesMarkHandlerDeps> = {}) => {
  const deps: MessagesMarkHandlerDeps = { ...defaultDeps, ...depsOverrides };

  return async (request: CommandRequest): Promise<CliResult> => {
    if (!isEnabled(deps.env.SLACK_MCP_MARK_TOOL)) {
      return createError(
        "INVALID_ARGUMENT",
        "messages mark is disabled by default. [MARK_TOOL_DISABLED]",
        "Set SLACK_MCP_MARK_TOOL=true to enable marking conversations as read.",
        COMMAND_ID,
      );
    }

    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages mark requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const timestampOrError = readTimestampOption(request);
    if (isCliErrorResult(timestampOrError)) {
      return timestampOrError;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const channel = rawChannel.trim();
      const timestamp =
        timestampOrError ??
        (await client.fetchChannelHistory({ channel, limit: 1, includeActivity: true })).messages[0]
          ?.ts;

      if (timestamp === undefined) {
        return createError(
          "INVALID_ARGUMENT",
          `messages mark could not find latest message in ${channel}. [NO_MESSAGES]`,
          "Pass --ts=<timestamp> explicitly if the channel has readable history.",
          COMMAND_ID,
        );
      }

      const result = await client.markConversation({ channel, ts: timestamp });
      return {
        ok: true,
        command: COMMAND_ID,
        message: `Marked ${result.channel} as read up to ${result.ts}.`,
        data: result,
        textLines: [`Marked ${result.channel} as read up to ${result.ts}.`],
      };
    } catch (error) {
      return mapError(error);
    }
  };
};

export const messagesMarkHandler = createMessagesMarkHandler();
