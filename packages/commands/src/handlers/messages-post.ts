import { createError } from "../errors";
import { buildBlocksFromMarkdown } from "../messages-post/block-builder";
import { convertMarkdownToSlackMrkdwn } from "../messages-post/markdown";
import { evaluatePostChannelPolicy } from "../messages-post/policy";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken, withTokenFallback } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.post";
const USAGE_HINT =
  "Usage: slack messages post <channel-id> <text> [--thread-ts=<ts>] [--blocks[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]";
const BOOLEAN_OPTION_VALUES_HINT = "Use boolean value: true|false|1|0|yes|no|on|off.";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesPostHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackPostWebApiClient;
  env: Record<string, string | undefined>;
  resolveToken: (
    env: Record<string, string | undefined>,
  ) => Promise<ResolvedSlackToken> | ResolvedSlackToken;
};

const defaultDeps: MessagesPostHandlerDeps = {
  createClient: createSlackWebApiClient,
  env: process.env,
  resolveToken: resolveSlackToken,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.post.",
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
      "messages post --thread-ts requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (typeof rawThreadTs !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "messages post --thread-ts requires a string timestamp value.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const threadTs = rawThreadTs.trim();
  if (threadTs.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages post --thread-ts value cannot be empty. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (!isValidSlackTimestamp(threadTs)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages post --thread-ts must match Slack timestamp format seconds.fraction. Received: ${threadTs}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return threadTs;
};

const readOptionalBooleanOption = (
  options: CliOptions,
  optionName: "unfurl-links" | "unfurl-media" | "reply-broadcast" | "blocks",
): boolean | undefined | CliResult => {
  const rawValue = options[optionName];
  if (rawValue === undefined) {
    return undefined;
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
    `messages post --${optionName} must be boolean when provided with '=...'. Received: ${rawValue}`,
    `${BOOLEAN_OPTION_VALUES_HINT} ${USAGE_HINT}`,
    COMMAND_ID,
  );
};

export const createMessagesPostHandler = (depsOverrides: Partial<MessagesPostHandlerDeps> = {}) => {
  const deps: MessagesPostHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const channelId = rawChannel.trim();

    const text = request.positionals.slice(1).join(" ");
    if (text.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post requires non-empty <text>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const threadTsOrError = readThreadTsOption(request.options);
    if (isCliErrorResult(threadTsOrError)) {
      return threadTsOrError;
    }

    const unfurlLinksOrError = readOptionalBooleanOption(request.options, "unfurl-links");
    if (isCliErrorResult(unfurlLinksOrError)) {
      return unfurlLinksOrError;
    }

    const unfurlMediaOrError = readOptionalBooleanOption(request.options, "unfurl-media");
    if (isCliErrorResult(unfurlMediaOrError)) {
      return unfurlMediaOrError;
    }

    const replyBroadcastOrError = readOptionalBooleanOption(request.options, "reply-broadcast");
    if (isCliErrorResult(replyBroadcastOrError)) {
      return replyBroadcastOrError;
    }

    const blocksOrError = readOptionalBooleanOption(request.options, "blocks");
    if (isCliErrorResult(blocksOrError)) {
      return blocksOrError;
    }

    const postPolicy = evaluatePostChannelPolicy(channelId, deps.env);
    if (postPolicy.allowed === false) {
      return createError(
        "INVALID_ARGUMENT",
        `messages post blocked by channel policy: ${postPolicy.reason}. [POST_CHANNEL_POLICY]`,
        "Review SLACK_MCP_POST_CHANNEL_ALLOWLIST and SLACK_MCP_POST_CHANNEL_DENYLIST.",
        COMMAND_ID,
      );
    }

    const mrkdwnText = convertMarkdownToSlackMrkdwn(text);
    const shouldBuildBlocks = blocksOrError === true;
    const blockPayload = shouldBuildBlocks ? buildBlocksFromMarkdown(text) : undefined;

    try {
      return await withTokenFallback(
        "xoxb",
        deps.env,
        async (resolvedToken) => {
          const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
          const postMessagePayload = {
            channel: channelId,
            text: mrkdwnText,
            threadTs: threadTsOrError,
            blocks: blockPayload?.blocks,
            attachments: blockPayload?.attachments,
            unfurlLinks: unfurlLinksOrError,
            unfurlMedia: unfurlMediaOrError,
            replyBroadcast: replyBroadcastOrError,
          };
          const data = await client.postMessage(postMessagePayload);

          return {
            ok: true,
            command: COMMAND_ID,
            message: `Message posted to ${data.channel}.`,
            data: {
              channel: data.channel,
              ts: data.ts,
              message: data.message,
            },
            textLines: [`Posted message to ${data.channel} at ${data.ts}.`],
          };
        },
        deps.resolveToken,
      );
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesPostHandler = createMessagesPostHandler();
