import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { parseSlackMessagePermalink } from "../messages/permalink";
import type { ResolvedSlackToken, SlackMessage } from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { SlackRepliesWebApiClient, SlackUsersInfoWebApiClient } from "../slack/types";
import type { CliOptions, CliResult, CommandRequest } from "../types";
import type { UserLookup } from "../users/resolve";
import { formatUser, resolveUserIds } from "../users/resolve";

const COMMAND_ID = "messages.replies";
const USAGE_HINT =
  "Usage: slack messages replies <channel-id(required,non-empty)> <thread-ts(required,non-empty)> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--resolve-users[=<bool>]] [--json]\n" +
  "       slack messages replies <thread-permalink(required,non-empty)> [--limit=<n>] [--oldest=<ts>] [--latest=<ts>] [--cursor=<cursor>] [--resolve-users[=<bool>]] [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesRepliesHandlerDeps = {
  createClient: (
    options?: CreateClientOptions,
  ) => SlackRepliesWebApiClient & SlackUsersInfoWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

type RepliesPage = {
  messages: SlackMessage[];
  nextCursor?: string;
};

type RepliesTarget = {
  channel: string;
  threadTs: string;
};

const defaultDeps: MessagesRepliesHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const toTextLine = (message: SlackMessage, lookup?: UserLookup): string => {
  const user =
    lookup !== undefined ? formatUser(message.user, lookup) : (message.user ?? "unknown");
  return `${message.ts} ${user} ${message.text}`;
};

const buildTextLines = (
  channel: string,
  threadTs: string,
  result: { messages: SlackMessage[]; nextCursor?: string },
  lookup?: UserLookup,
) => {
  const lines: string[] = [];

  for (const message of result.messages) {
    lines.push(toTextLine(message, lookup));
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

const resolveRepliesTarget = (positionals: string[]): RepliesTarget | CliResult => {
  const first = positionals[0];
  if (first === undefined || first.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages replies requires <channel-id> or <thread-permalink>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (first.startsWith("http://") || first.startsWith("https://")) {
    const permalink = parseSlackMessagePermalink(first.trim());
    if (permalink.kind === "not-permalink") {
      return createError(
        "INVALID_ARGUMENT",
        "messages replies expects Slack canonical message URL when URL input is provided.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (permalink.kind === "invalid") {
      return createError(
        "INVALID_ARGUMENT",
        `invalid messages replies message-url: ${permalink.reason}`,
        `${permalink.hint} Input: ${first}`,
        COMMAND_ID,
      );
    }

    return {
      channel: permalink.channel,
      threadTs: permalink.threadTs ?? permalink.ts,
    };
  }

  const channel = first.trim();
  const rawThreadTs = positionals[1];
  if (rawThreadTs === undefined || rawThreadTs.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages replies requires <thread-ts>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const threadTs = rawThreadTs.trim();
  if (threadTs.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages replies requires <thread-ts>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (!isValidSlackTimestamp(threadTs)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages replies <thread-ts> must match Slack timestamp format seconds.fraction. Received: ${threadTs}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return {
    channel,
    threadTs,
  };
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

  const trimmed = value.trim();
  if (!isValidSlackTimestamp(trimmed)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages replies --${key} must match Slack timestamp format seconds.fraction. Received: ${trimmed}`,
      `Pass --${key}=<seconds.fraction>.`,
      COMMAND_ID,
    );
  }

  return trimmed;
};

const isCliErrorResult = (
  value: number | string | boolean | undefined | CliResult | RepliesTarget,
): value is CliResult => {
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

// NOTE: Duplicated from messages-fetch to avoid circular dependency.
const readResolveUsersOption = (options: CliOptions): boolean | CliResult => {
  const rawValue = options["resolve-users"];
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
    `messages replies --resolve-users must be boolean when provided with '=...'. Received: ${rawValue}`,
    "Use boolean value: true|false|1|0|yes|no|on|off.",
    COMMAND_ID,
  );
};

const hasEdgeTokenPrefix = (token: string): boolean => {
  return token.startsWith("xoxc") || token.startsWith("xoxd");
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

const fetchRepliesWithAutoPagination = async (
  client: SlackRepliesWebApiClient,
  params: {
    channel: string;
    threadTs: string;
    oldest?: string;
    latest?: string;
    limit?: number;
    cursor?: string;
  },
): Promise<RepliesPage> => {
  const requestedLimit = params.limit;
  const hasExplicitCursor = params.cursor !== undefined;

  if (hasExplicitCursor) {
    return await client.fetchMessageReplies({
      channel: params.channel,
      ts: params.threadTs,
      limit: requestedLimit ?? 100,
      oldest: params.oldest,
      latest: params.latest,
      cursor: params.cursor,
    });
  }

  const pageSize = requestedLimit === undefined ? 200 : Math.min(200, requestedLimit);
  const mergedMessages: SlackMessage[] = [];
  let cursor: string | undefined;
  let nextCursor: string | undefined;

  while (true) {
    const page = await client.fetchMessageReplies({
      channel: params.channel,
      ts: params.threadTs,
      limit: pageSize,
      oldest: params.oldest,
      latest: params.latest,
      cursor,
    });

    mergedMessages.push(...page.messages);

    if (requestedLimit !== undefined && mergedMessages.length >= requestedLimit) {
      return {
        messages: mergedMessages.slice(0, requestedLimit),
        nextCursor: page.nextCursor,
      };
    }

    if (page.nextCursor === undefined || page.nextCursor.length === 0) {
      nextCursor = undefined;
      break;
    }

    nextCursor = page.nextCursor;
    cursor = page.nextCursor;
  }

  return {
    messages: mergedMessages,
    nextCursor,
  };
};

export const createMessagesRepliesHandler = (
  depsOverrides: Partial<MessagesRepliesHandlerDeps> = {},
) => {
  const deps: MessagesRepliesHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const targetOrError = resolveRepliesTarget(request.positionals);
    if (isCliErrorResult(targetOrError)) {
      return targetOrError;
    }

    const { channel, threadTs } = targetOrError;

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

    const resolveUsersOrError = readResolveUsersOption(request.options);
    if (isCliErrorResult(resolveUsersOrError)) {
      return resolveUsersOrError;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      if (hasEdgeTokenPrefix(resolvedToken.token)) {
        return createError(
          "INVALID_ARGUMENT",
          "messages replies does not support edge API tokens (xoxc/xoxd).",
          "Use SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN. Edge API token path is not yet supported for messages replies.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });

      const data = await fetchRepliesWithAutoPagination(client, {
        channel,
        threadTs,
        limit: limitOrError,
        oldest: oldestOrError,
        latest: latestOrError,
        cursor: cursorOrError,
      });

      let lookup: UserLookup | undefined;
      let resolvedUsers: Record<string, { username: string; displayName?: string }> | undefined;
      if (resolveUsersOrError) {
        const resolved = await resolveUserIds(client, data.messages);
        lookup = resolved.lookup;
        resolvedUsers = resolved.resolvedUsers;
      }

      return {
        ok: true,
        command: COMMAND_ID,
        data: {
          messages: data.messages,
          next_cursor: data.nextCursor,
          channel,
          thread_ts: threadTs,
          ...(resolvedUsers !== undefined ? { resolvedUsers } : {}),
        },
        textLines: buildTextLines(
          channel,
          threadTs,
          {
            messages: data.messages,
            nextCursor: data.nextCursor,
          },
          lookup,
        ),
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesRepliesHandler = createMessagesRepliesHandler();
