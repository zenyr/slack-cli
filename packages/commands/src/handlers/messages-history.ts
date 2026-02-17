import { createError } from "../errors";
import type { ResolvedSlackToken, SlackMessage, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.history";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesHistoryHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesHistoryHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const toTextLine = (message: SlackMessage): string => {
  const user = message.user === undefined ? "unknown" : message.user;
  return `${message.ts} ${user} ${message.text}`;
};

const buildTextLines = (
  channel: string,
  result: { messages: SlackMessage[]; nextCursor?: string },
) => {
  const lines: string[] = [];

  for (const message of result.messages) {
    lines.push(toTextLine(message));
  }

  if (result.nextCursor !== undefined) {
    lines.push(`More messages available. Next cursor: ${result.nextCursor}`);
  }

  if (lines.length === 0) {
    lines.push(`No messages found in ${channel}.`);
  }

  return lines;
};

const readStringOption = (options: CliOptions, key: string): string | undefined => {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
};

const TIME_EXPRESSION_TO_SECONDS: Record<string, number> = {
  "1d": 86400,
  "1w": 604800,
  "30d": 2592000,
  "90d": 7776000,
};

const parseLimitOption = (options: CliOptions): number | undefined | CliResult => {
  const value = options.limit;

  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      "messages history --limit requires a value. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      COMMAND_ID,
    );
  }

  const raw = readStringOption(options, "limit");
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages history --limit value cannot be empty. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      COMMAND_ID,
    );
  }

  // Try numeric first - verify it's all digits
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    if (parsed > 0) {
      return parsed;
    }
    // Numeric but invalid (<=0)
    return createError(
      "INVALID_ARGUMENT",
      `messages history --limit must be a positive integer. Received: ${trimmed}`,
      "Use --limit with a positive integer, e.g. --limit=25.",
      COMMAND_ID,
    );
  }

  return createError(
    "INVALID_ARGUMENT",
    `messages history --limit must be a positive integer. Received: ${trimmed}`,
    "Use --limit with a positive integer, e.g. --limit=25.",
    COMMAND_ID,
  );
};

const readRangeOption = (options: CliOptions, key: string): string | undefined | CliResult => {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      `messages history --${key} requires a value. [MISSING_ARGUMENT]`,
      `Pass --${key}=<seconds.fraction>.`,
      COMMAND_ID,
    );
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `messages history --${key} requires a timestamp value. [MISSING_ARGUMENT]`,
      `Pass --${key}=<seconds.fraction>.`,
      COMMAND_ID,
    );
  }

  const trimmed = value.trim();

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  const seconds = TIME_EXPRESSION_TO_SECONDS[trimmed];
  if (seconds === undefined) {
    return createError(
      "INVALID_ARGUMENT",
      `messages history --${key} value invalid: ${trimmed}. [INVALID_TIME_EXPRESSION]`,
      `Pass --${key}=<seconds.fraction> or one of: 1d, 1w, 30d, 90d.`,
      COMMAND_ID,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now - seconds).toString();
};

const isCliErrorResult = (value: unknown): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const readOptionalCursor = (options: CliOptions): string | undefined | CliResult => {
  const value = options.cursor;
  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      "messages history --cursor requires a value. [MISSING_ARGUMENT]",
      "Pass --cursor=<cursor>.",
      COMMAND_ID,
    );
  }

  const stringValue = readStringOption(options, "cursor");
  if (stringValue === undefined) {
    return undefined;
  }

  return stringValue.trim();
};

const parseIncludeActivityOption = (options: CliOptions): boolean | CliResult => {
  const value = options["include-activity"];
  if (value === undefined) {
    return false;
  }

  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return createError(
    "INVALID_ARGUMENT",
    `messages history --include-activity expects boolean value when provided with '=...'. Received: ${value}`,
    "Use --include-activity, --include-activity=true, or --include-activity=false.",
    COMMAND_ID,
  );
};

const isRawChannelId = (candidate: string): boolean => {
  return /^[CGD][A-Z0-9]+$/.test(candidate);
};

const resolveChannelIdentifier = async (
  identifier: string,
  client: SlackWebApiClient,
): Promise<string | CliResult> => {
  // If it's a raw ID, return as-is
  if (isRawChannelId(identifier)) {
    return identifier;
  }

  // If it starts with #, resolve the name
  if (identifier.startsWith("#")) {
    const channelName = identifier.slice(1);

    if (channelName.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "Channel name cannot be empty after #. [INVALID_CHANNEL_NAME]",
        "Provide a channel name: #channel-name, or raw ID: C..., G..., D...",
        COMMAND_ID,
      );
    }

    try {
      const result = await client.listChannels({
        types: ["public", "private", "im", "mpim"],
        limit: 999,
      });

      const found = result.channels.find((ch) => ch.name === channelName);
      if (found !== undefined) {
        return found.id;
      }

      return createError(
        "INVALID_ARGUMENT",
        `Channel not found: ${identifier}. [CHANNEL_NOT_FOUND]`,
        "Verify channel name exists and you have access.",
        COMMAND_ID,
      );
    } catch (error) {
      if (isCliErrorResult(error)) {
        return error;
      }
      return mapSlackClientError(error);
    }
  }

  // Doesn't match raw ID pattern or #prefix
  return createError(
    "INVALID_ARGUMENT",
    `Invalid channel identifier: ${identifier}. [INVALID_CHANNEL_IDENTIFIER]`,
    "Provide a channel name (#channel-name) or raw ID (C..., G..., D...).",
    COMMAND_ID,
  );
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.history.",
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

export const createMessagesHistoryHandler = (
  depsOverrides: Partial<MessagesHistoryHandlerDeps> = {},
) => {
  const deps: MessagesHistoryHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const channelIdentifier = request.positionals[0];
    if (channelIdentifier === undefined || channelIdentifier.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages history requires <channel-id or #channel-name>. [MISSING_ARGUMENT]",
        "Usage: slack messages history <channel-id or #channel-name> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--include-activity] [--json]",
        COMMAND_ID,
      );
    }

    const limitOrError = parseLimitOption(request.options);
    if (isCliErrorResult(limitOrError)) {
      return limitOrError;
    }

    const oldestOrError = readRangeOption(request.options, "oldest");
    if (isCliErrorResult(oldestOrError)) {
      return oldestOrError;
    }

    const latestOrError = readRangeOption(request.options, "latest");
    if (isCliErrorResult(latestOrError)) {
      return latestOrError;
    }

    const cursorOrError = readOptionalCursor(request.options);
    if (isCliErrorResult(cursorOrError)) {
      return cursorOrError;
    }

    const includeActivityOrError = parseIncludeActivityOption(request.options);
    if (isCliErrorResult(includeActivityOrError)) {
      return includeActivityOrError;
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });

      // Resolve channel identifier to raw ID
      const channelIdOrError = await resolveChannelIdentifier(channelIdentifier, client);
      if (isCliErrorResult(channelIdOrError)) {
        return channelIdOrError;
      }

      // Process limit
      let finalLimit = 100;
      const finalOldest = oldestOrError;

      if (typeof limitOrError === "number") {
        finalLimit = limitOrError;
      }

      const query = {
        channel: channelIdOrError,
        limit: finalLimit,
        oldest: finalOldest,
        latest: latestOrError,
        cursor: cursorOrError,
        includeActivity: includeActivityOrError,
      };

      const data = await client.fetchChannelHistory(query);

      return {
        ok: true,
        command: COMMAND_ID,
        data: {
          messages: data.messages,
          next_cursor: data.nextCursor,
          channel: data.channel,
        },
        textLines: buildTextLines(channelIdOrError, data),
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesHistoryHandler = createMessagesHistoryHandler();
