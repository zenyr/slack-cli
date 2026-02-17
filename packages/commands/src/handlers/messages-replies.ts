import { createError } from "../errors";
import type { ResolvedSlackToken, SlackMessage } from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { SlackRepliesWebApiClient } from "../slack/types";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.replies";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesRepliesHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackRepliesWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesRepliesHandlerDeps = {
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
  threadTs: string,
  result: { messages: SlackMessage[]; nextCursor?: string },
) => {
  const lines: string[] = [];

  for (const message of result.messages) {
    lines.push(toTextLine(message));
  }

  if (result.nextCursor !== undefined) {
    lines.push(`More replies available. Next cursor: ${result.nextCursor}`);
  }

  if (lines.length === 0) {
    lines.push(`No replies found in channel ${channel}, thread ${threadTs}.`);
  }

  return lines;
};

const readStringOption = (options: CliOptions, key: string): string | undefined => {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
};

const isValidSlackTimestamp = (value: string): boolean => {
  return /^\d+\.\d+$/.test(value);
};

const parseLimitOption = (options: CliOptions): number | undefined | CliResult => {
  const value = options.limit;

  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      "messages replies --limit requires a value. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      COMMAND_ID,
    );
  }

  if (typeof value !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "messages replies --limit requires an integer value.",
      "Use --limit with a positive integer, e.g. --limit=25.",
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
      "messages replies --limit value cannot be empty. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      COMMAND_ID,
    );
  }

  if (!/^[0-9]+$/.test(trimmed)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages replies --limit must be a positive integer. Received: ${trimmed}`,
      "Use --limit with a positive integer, e.g. --limit=25.",
      COMMAND_ID,
    );
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return createError(
      "INVALID_ARGUMENT",
      `messages replies --limit must be a positive integer. Received: ${trimmed}`,
      "Use --limit with a positive integer, e.g. --limit=25.",
      COMMAND_ID,
    );
  }

  return parsed;
};

const readRangeOption = (options: CliOptions, key: string): string | undefined | CliResult => {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      `messages replies --${key} requires a value. [MISSING_ARGUMENT]`,
      `Pass --${key}=<seconds.fraction>.`,
      COMMAND_ID,
    );
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `messages replies --${key} requires a timestamp value. [MISSING_ARGUMENT]`,
      `Pass --${key}=<seconds.fraction>.`,
      COMMAND_ID,
    );
  }

  return value.trim();
};

const isCliErrorResult = (value: number | string | undefined | CliResult): value is CliResult => {
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
      "messages replies --cursor requires a value. [MISSING_ARGUMENT]",
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

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.replies.",
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

export const createMessagesRepliesHandler = (
  depsOverrides: Partial<MessagesRepliesHandlerDeps> = {},
) => {
  const deps: MessagesRepliesHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const channel = request.positionals[0];
    if (channel === undefined || channel.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages replies requires <channel-id>. [MISSING_ARGUMENT]",
        "Usage: slack messages replies <channel-id> <thread-ts> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--json]",
        COMMAND_ID,
      );
    }

    const rawThreadTs = request.positionals[1];
    if (rawThreadTs === undefined || rawThreadTs.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages replies requires <thread-ts>. [MISSING_ARGUMENT]",
        "Usage: slack messages replies <channel-id> <thread-ts> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--json]",
        COMMAND_ID,
      );
    }

    const threadTs = rawThreadTs.trim();
    if (threadTs.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages replies requires <thread-ts>. [MISSING_ARGUMENT]",
        "Usage: slack messages replies <channel-id> <thread-ts> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--json]",
        COMMAND_ID,
      );
    }

    if (!isValidSlackTimestamp(threadTs)) {
      return createError(
        "INVALID_ARGUMENT",
        `messages replies <thread-ts> must match Slack timestamp format seconds.fraction. Received: ${threadTs}`,
        "Usage: slack messages replies <channel-id> <thread-ts> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--json]",
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

    const limit = limitOrError === undefined ? 100 : limitOrError;

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });

      const query = {
        channel,
        ts: threadTs,
        limit,
        oldest: oldestOrError,
        latest: latestOrError,
        cursor: cursorOrError,
      };

      const data = await client.fetchMessageReplies(query);

      return {
        ok: true,
        command: COMMAND_ID,
        data: {
          messages: data.messages,
          next_cursor: data.nextCursor,
          channel: data.channel,
          thread_ts: threadTs,
        },
        textLines: buildTextLines(channel, threadTs, {
          messages: data.messages,
          nextCursor: data.nextCursor,
        }),
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesRepliesHandler = createMessagesRepliesHandler();
