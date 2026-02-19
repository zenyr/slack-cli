import { createError } from "../errors";
import { parseSlackMessagePermalink } from "../messages/permalink";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackMessage,
  SlackUsersInfoWebApiClient,
  SlackWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";
import type { UserLookup } from "../users/resolve";
import { formatUser, resolveUserIds } from "../users/resolve";

const COMMAND_ID = "messages.context";
const USAGE_HINT =
  "Usage: slack messages context <message-url> [--before=<n>] [--after=<n>] [--resolve-users[=<bool>]] [--json]";
const BOOLEAN_OPTION_VALUES_HINT = "Use boolean value: true|false|1|0|yes|no|on|off.";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesContextClient = SlackWebApiClient & SlackUsersInfoWebApiClient;

type MessagesContextHandlerDeps = {
  createClient: (options?: CreateClientOptions) => MessagesContextClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesContextHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const isCliErrorResult = (value: unknown): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const toMessageLine = (message: SlackMessage, lookup?: UserLookup): string => {
  const user =
    lookup !== undefined ? formatUser(message.user, lookup) : (message.user ?? "unknown");
  return `${message.ts} ${user} ${message.text}`;
};

const parseCountOption = (
  options: CliOptions,
  key: "before" | "after",
  defaultValue: number,
): number | CliResult => {
  const value = options[key];

  if (value === undefined) {
    return defaultValue;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      `messages context --${key} requires a value. [MISSING_ARGUMENT]`,
      `Provide a positive integer: --${key}=<n>.`,
      COMMAND_ID,
    );
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `messages context --${key} requires a positive integer value. [MISSING_ARGUMENT]`,
      `Provide a positive integer: --${key}=<n>.`,
      COMMAND_ID,
    );
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    if (parsed > 0) {
      return parsed;
    }
    return createError(
      "INVALID_ARGUMENT",
      `messages context --${key} must be a positive integer. Received: ${trimmed}`,
      `Use --${key} with a positive integer, e.g. --${key}=5.`,
      COMMAND_ID,
    );
  }

  return createError(
    "INVALID_ARGUMENT",
    `messages context --${key} must be a positive integer. Received: ${trimmed}`,
    `Use --${key} with a positive integer, e.g. --${key}=5.`,
    COMMAND_ID,
  );
};

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
    `messages context --resolve-users must be boolean when provided with '=...'. Received: ${rawValue}`,
    `${BOOLEAN_OPTION_VALUES_HINT} ${USAGE_HINT}`,
    COMMAND_ID,
  );
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.context.",
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

const mergeAndSort = (a: SlackMessage[], b: SlackMessage[]): SlackMessage[] => {
  const seen = new Set<string>();
  const merged: SlackMessage[] = [];

  for (const msg of [...a, ...b]) {
    if (!seen.has(msg.ts)) {
      seen.add(msg.ts);
      merged.push(msg);
    }
  }

  return merged.sort((x, y) => {
    const xn = Number(x.ts);
    const yn = Number(y.ts);
    if (xn < yn) return -1;
    if (xn > yn) return 1;
    return 0;
  });
};

const buildTextLines = (
  channel: string,
  targetTs: string,
  before: number,
  after: number,
  messages: SlackMessage[],
  lookup?: UserLookup,
): string[] => {
  const lines: string[] = [
    `Context for message ${targetTs} in ${channel} (before: ${before}, after: ${after})`,
  ];

  for (const msg of messages) {
    const line = toMessageLine(msg, lookup);
    if (msg.ts === targetTs) {
      lines.push(`>>> ${line}`);
    } else {
      lines.push(line);
    }
  }

  if (messages.length === 0) {
    lines.push("No messages found.");
  }

  return lines;
};

export const createMessagesContextHandler = (
  depsOverrides: Partial<MessagesContextHandlerDeps> = {},
) => {
  const deps: MessagesContextHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawPermalink = request.positionals[0];
    if (rawPermalink === undefined || rawPermalink.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages context requires <message-url>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const permalink = parseSlackMessagePermalink(rawPermalink);
    if (permalink.kind === "not-permalink") {
      return createError(
        "INVALID_ARGUMENT",
        "messages context expects Slack canonical message URL.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (permalink.kind === "invalid") {
      return createError(
        "INVALID_ARGUMENT",
        `invalid messages context message-url: ${permalink.reason}`,
        `${permalink.hint} Input: ${rawPermalink}`,
        COMMAND_ID,
      );
    }

    const beforeOrError = parseCountOption(request.options, "before", 5);
    if (isCliErrorResult(beforeOrError)) {
      return beforeOrError;
    }

    const afterOrError = parseCountOption(request.options, "after", 5);
    if (isCliErrorResult(afterOrError)) {
      return afterOrError;
    }

    const resolveUsersOrError = readResolveUsersOption(request.options);
    if (isCliErrorResult(resolveUsersOrError)) {
      return resolveUsersOrError;
    }

    const { channel, ts: targetTs } = permalink;

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });

      // Fetch messages up to and including target (newest-first from API, but we need inclusive)
      const beforeResult = await client.fetchChannelHistory({
        channel,
        latest: targetTs,
        limit: beforeOrError,
        inclusive: true,
      });

      // Fetch messages strictly after target (oldest is exclusive by default)
      const afterResult = await client.fetchChannelHistory({
        channel,
        oldest: targetTs,
        limit: afterOrError,
      });

      const allMessages = mergeAndSort(beforeResult.messages, afterResult.messages);

      let lookup: UserLookup | undefined;
      let resolvedUsers: Record<string, { username: string; displayName?: string }> | undefined;
      if (resolveUsersOrError) {
        const resolved = await resolveUserIds(client, allMessages);
        lookup = resolved.lookup;
        resolvedUsers = resolved.resolvedUsers;
      }

      return {
        ok: true,
        command: COMMAND_ID,
        data: {
          channel,
          target_ts: targetTs,
          messages: allMessages,
          ...(resolvedUsers !== undefined ? { resolvedUsers } : {}),
        },
        textLines: buildTextLines(
          channel,
          targetTs,
          beforeOrError,
          afterOrError,
          allMessages,
          lookup,
        ),
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesContextHandler = createMessagesContextHandler();
