import {
  type CreateClientOptions,
  isCliErrorResult,
  mapSlackClientError,
  readBlocksOption,
  readThreadTsOption,
} from "./messages-shared";
import { createError } from "../errors";
import { convertMarkdownToSlackMrkdwn } from "../messages-post/markdown";
import { evaluatePostChannelPolicy } from "../messages-post/policy";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken, withTokenFallback } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.post";
const USAGE_HINT =
  "Usage: slack messages post <channel-id> <text> [--thread-ts=<ts>] [--blocks[=<json|bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]";
const BOOLEAN_OPTION_VALUES_HINT = "Use boolean value: true|false|1|0|yes|no|on|off.";

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

const readOptionalBooleanOption = (
  options: CliOptions,
  optionName: "unfurl-links" | "unfurl-media" | "reply-broadcast",
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

    const threadTsOrError = readThreadTsOption(
      request.options,
      "messages post",
      USAGE_HINT,
      COMMAND_ID,
    );
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

    const blocksPayloadOrError = readBlocksOption(
      request.options,
      text,
      "messages post",
      USAGE_HINT,
      COMMAND_ID,
    );
    if (isCliErrorResult(blocksPayloadOrError)) {
      return blocksPayloadOrError;
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
    const blockPayload = blocksPayloadOrError;

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
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const messagesPostHandler = createMessagesPostHandler();
