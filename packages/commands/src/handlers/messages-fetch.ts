import { createError } from "../errors";
import { parseSlackMessagePermalink } from "../messages/permalink";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackMessage,
  SlackRepliesWebApiClient,
  SlackUsersInfoWebApiClient,
  SlackWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";
import type { UserLookup } from "../users/resolve";
import { formatUser, resolveUserIds } from "../users/resolve";

const COMMAND_ID = "messages.fetch";
const USAGE_HINT =
  "Usage: slack messages fetch <message-url> [--thread[=<bool>]] [--resolve-users[=<bool>]] [--json]";
const BOOLEAN_OPTION_VALUES_HINT = "Use boolean value: true|false|1|0|yes|no|on|off.";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesFetchClient = SlackWebApiClient &
  SlackRepliesWebApiClient &
  SlackUsersInfoWebApiClient;

type MessagesFetchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => MessagesFetchClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesFetchHandlerDeps = {
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

const readThreadOption = (options: CliOptions): boolean | CliResult => {
  const rawValue = options.thread;
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
    `messages fetch --thread must be boolean when provided with '=...'. Received: ${rawValue}`,
    `${BOOLEAN_OPTION_VALUES_HINT} ${USAGE_HINT}`,
    COMMAND_ID,
  );
};

export const readResolveUsersOption = (options: CliOptions): boolean | CliResult => {
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
    `messages fetch --resolve-users must be boolean when provided with '=...'. Received: ${rawValue}`,
    `${BOOLEAN_OPTION_VALUES_HINT} ${USAGE_HINT}`,
    COMMAND_ID,
  );
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.fetch.",
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

const buildTimestampBounds = (targetTs: string): { oldest: string; latest: string } => {
  const parsed = Number(targetTs);
  if (Number.isFinite(parsed)) {
    const oldest = Math.max(0, parsed - 1).toFixed(6);
    const latest = (parsed + 1).toFixed(6);
    return { oldest, latest };
  }

  return {
    oldest: targetTs,
    latest: targetTs,
  };
};

const resolveMessageFromPermalink = async (
  client: MessagesFetchClient,
  channel: string,
  ts: string,
): Promise<SlackMessage | CliResult> => {
  try {
    const bounds = buildTimestampBounds(ts);
    const history = await client.fetchChannelHistory({
      channel,
      oldest: bounds.oldest,
      latest: bounds.latest,
      limit: 20,
      includeActivity: true,
    });
    const message = history.messages.find((item) => item.ts === ts);

    if (message === undefined) {
      return createError(
        "INVALID_ARGUMENT",
        `messages fetch target not found in ${channel} at ${ts}.`,
        "Message may be deleted or inaccessible with current token scope.",
        COMMAND_ID,
      );
    }

    return message;
  } catch (error) {
    return mapSlackClientError(error);
  }
};

const buildSingleMessageLines = (
  channel: string,
  message: SlackMessage,
  lookup?: UserLookup,
): string[] => {
  const threadRoot = message.threadTs === undefined ? message.ts : message.threadTs;
  return [
    `Message ${message.ts} in ${channel}`,
    `Thread root: ${threadRoot}`,
    toMessageLine(message, lookup),
  ];
};

const buildThreadLines = (
  channel: string,
  threadTs: string,
  targetTs: string,
  messages: SlackMessage[],
  nextCursor?: string,
  lookup?: UserLookup,
): string[] => {
  const lines: string[] = [`Thread ${threadTs} in ${channel} (target ${targetTs})`];

  for (const message of messages) {
    lines.push(toMessageLine(message, lookup));
  }

  if (nextCursor !== undefined) {
    lines.push(`More replies available. Next cursor: ${nextCursor}`);
  }

  if (messages.length === 0) {
    lines.push("No messages in thread.");
  }

  return lines;
};

export const createMessagesFetchHandler = (
  depsOverrides: Partial<MessagesFetchHandlerDeps> = {},
) => {
  const deps: MessagesFetchHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawPermalink = request.positionals[0];
    if (rawPermalink === undefined || rawPermalink.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages fetch requires <message-url>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const permalink = parseSlackMessagePermalink(rawPermalink);
    if (permalink.kind === "not-permalink") {
      return createError(
        "INVALID_ARGUMENT",
        "messages fetch expects Slack canonical message URL.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (permalink.kind === "invalid") {
      return createError(
        "INVALID_ARGUMENT",
        `invalid messages fetch message-url: ${permalink.reason}`,
        `${permalink.hint} Input: ${rawPermalink}`,
        COMMAND_ID,
      );
    }

    const threadModeOrError = readThreadOption(request.options);
    if (isCliErrorResult(threadModeOrError)) {
      return threadModeOrError;
    }

    const resolveUsersOrError = readResolveUsersOption(request.options);
    if (isCliErrorResult(resolveUsersOrError)) {
      return resolveUsersOrError;
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });

      const messageOrError = await resolveMessageFromPermalink(
        client,
        permalink.channel,
        permalink.ts,
      );
      if (isCliErrorResult(messageOrError)) {
        return messageOrError;
      }

      if (!threadModeOrError) {
        let lookup: UserLookup | undefined;
        let resolvedUsers: Record<string, { username: string; displayName?: string }> | undefined;
        if (resolveUsersOrError) {
          const resolved = await resolveUserIds(client, [messageOrError]);
          lookup = resolved.lookup;
          resolvedUsers = resolved.resolvedUsers;
        }

        return {
          ok: true,
          command: COMMAND_ID,
          message: `Fetched message ${messageOrError.ts} in ${permalink.channel}.`,
          data: {
            channel: permalink.channel,
            ts: messageOrError.ts,
            message: messageOrError,
            ...(resolvedUsers !== undefined ? { resolvedUsers } : {}),
          },
          textLines: buildSingleMessageLines(permalink.channel, messageOrError, lookup),
        };
      }

      const threadTs =
        messageOrError.threadTs === undefined ? messageOrError.ts : messageOrError.threadTs;
      const replies = await client.fetchMessageReplies({
        channel: permalink.channel,
        ts: threadTs,
        limit: 200,
      });

      let lookup: UserLookup | undefined;
      let resolvedUsers: Record<string, { username: string; displayName?: string }> | undefined;
      if (resolveUsersOrError) {
        const resolved = await resolveUserIds(client, replies.messages);
        lookup = resolved.lookup;
        resolvedUsers = resolved.resolvedUsers;
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Fetched thread ${threadTs} in ${permalink.channel}.`,
        data: {
          channel: permalink.channel,
          target_ts: messageOrError.ts,
          thread_ts: threadTs,
          message: messageOrError,
          messages: replies.messages,
          next_cursor: replies.nextCursor,
          ...(resolvedUsers !== undefined ? { resolvedUsers } : {}),
        },
        textLines: buildThreadLines(
          permalink.channel,
          threadTs,
          messageOrError.ts,
          replies.messages,
          replies.nextCursor,
          lookup,
        ),
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesFetchHandler = createMessagesFetchHandler();
