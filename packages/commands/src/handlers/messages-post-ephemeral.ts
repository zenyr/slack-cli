import { createError } from "../errors";
import { convertMarkdownToSlackMrkdwn } from "../messages-post/markdown";
import { evaluatePostChannelPolicy } from "../messages-post/policy";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.post-ephemeral";
const USAGE_HINT =
  "Usage: slack messages post-ephemeral <channel-id> <user-id> <text> [--thread-ts=<ts>] [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesPostEphemeralHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackPostWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesPostEphemeralHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const isCliErrorResult = (value: unknown): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const isValidSlackTimestamp = (value: string): boolean => {
  return /^\d+\.\d+$/.test(value);
};

const readThreadTsOption = (options: CliOptions): string | undefined | CliResult => {
  const rawThreadTs = options["thread-ts"];
  if (rawThreadTs === undefined) {
    return undefined;
  }

  if (rawThreadTs === true) {
    return createError(
      "INVALID_ARGUMENT",
      "messages post-ephemeral --thread-ts requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (typeof rawThreadTs !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "messages post-ephemeral --thread-ts requires a string timestamp value.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const threadTs = rawThreadTs.trim();
  if (threadTs.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages post-ephemeral --thread-ts value cannot be empty. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (!isValidSlackTimestamp(threadTs)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages post-ephemeral --thread-ts must match Slack timestamp format seconds.fraction. Received: ${threadTs}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return threadTs;
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.post-ephemeral.",
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

export const createMessagesPostEphemeralHandler = (
  depsOverrides: Partial<MessagesPostEphemeralHandlerDeps> = {},
) => {
  const deps: MessagesPostEphemeralHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post-ephemeral requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawUser = request.positionals[1];
    if (rawUser === undefined || rawUser.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post-ephemeral requires <user-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const text = request.positionals.slice(2).join(" ");
    if (text.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post-ephemeral requires non-empty <text>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const channel = rawChannel.trim();
    const user = rawUser.trim();

    const threadTsOrError = readThreadTsOption(request.options);
    if (isCliErrorResult(threadTsOrError)) {
      return threadTsOrError;
    }

    const postPolicy = evaluatePostChannelPolicy(channel, deps.env);
    if (postPolicy.allowed === false) {
      return createError(
        "INVALID_ARGUMENT",
        `messages post-ephemeral blocked by channel policy: ${postPolicy.reason}. [POST_CHANNEL_POLICY]`,
        "Review SLACK_MCP_POST_CHANNEL_ALLOWLIST and SLACK_MCP_POST_CHANNEL_DENYLIST.",
        COMMAND_ID,
      );
    }

    const mrkdwnText = convertMarkdownToSlackMrkdwn(text);

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.postEphemeral({
        channel,
        user,
        text: mrkdwnText,
        threadTs: threadTsOrError,
      });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Ephemeral message posted to ${data.channel} for ${user}.`,
        data: {
          channel: data.channel,
          user,
          message_ts: data.messageTs,
        },
        textLines: [
          `Posted ephemeral message to ${data.channel} for ${user} at ${data.messageTs}.`,
        ],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesPostEphemeralHandler = createMessagesPostEphemeralHandler();
