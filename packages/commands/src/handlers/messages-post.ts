import {
  type BlocksPayload,
  type CreateClientOptions,
  isCliErrorResult,
  mapSlackClientError,
  readBlocksOption,
  readBooleanOption,
  readCompositionPayload,
  readJsonObjectOption,
  readOptionalPayloadBoolean,
  readOptionalPayloadTimestamp,
  readRequiredPayloadString,
  readTextWithStdinMarker,
  readThreadTsOption,
  resolveTokenForContext,
  validatePayloadKeys,
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
  "Usage: slack messages post <channel-id> <text(required,non-empty)|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]";

const PAYLOAD_KEYS = [
  "channel",
  "text",
  "thread_ts",
  "blocks",
  "attachments",
  "unfurl_links",
  "unfurl_media",
  "reply_broadcast",
];

type PostRequestShape = {
  channelId: string;
  text: string;
  threadTs: string | undefined;
  blocksPayload: BlocksPayload | undefined;
  unfurlLinks: boolean | undefined;
  unfurlMedia: boolean | undefined;
  replyBroadcast: boolean | undefined;
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

const readOptionalBooleanOption = (
  options: CliOptions,
  optionName: "unfurl-links" | "unfurl-media" | "reply-broadcast",
): boolean | undefined | CliResult => {
  const resolved = readBooleanOption(
    options,
    optionName,
    "messages post",
    USAGE_HINT,
    COMMAND_ID,
    false,
  );
  if (isCliErrorResult(resolved)) {
    return resolved;
  }

  if (options[optionName] === undefined) {
    return undefined;
  }

  return resolved;
};

export const createMessagesPostHandler = (depsOverrides: Partial<MessagesPostHandlerDeps> = {}) => {
  const deps: MessagesPostHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const dryRunOrError = readBooleanOption(
      request.options,
      "dry-run",
      "messages post",
      USAGE_HINT,
      COMMAND_ID,
      false,
    );
    if (isCliErrorResult(dryRunOrError)) {
      return dryRunOrError;
    }

    const payloadOrError = await readJsonObjectOption(
      request.options,
      "payload",
      "messages post",
      USAGE_HINT,
      COMMAND_ID,
      request.context.readStdin,
    );
    if (isCliErrorResult(payloadOrError)) {
      return payloadOrError;
    }

    let requestShape: PostRequestShape | CliResult;
    if (payloadOrError !== undefined) {
      if (request.positionals.length > 0) {
        return createError(
          "INVALID_ARGUMENT",
          "messages post cannot mix positional arguments with --payload.",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const payloadKeyError = validatePayloadKeys(
        payloadOrError,
        PAYLOAD_KEYS,
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (payloadKeyError !== undefined) {
        return payloadKeyError;
      }

      const channelIdOrError = readRequiredPayloadString(
        payloadOrError,
        "channel",
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(channelIdOrError)) {
        return channelIdOrError;
      }

      const textOrError = readRequiredPayloadString(
        payloadOrError,
        "text",
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(textOrError)) {
        return textOrError;
      }

      const threadTsOrError = readOptionalPayloadTimestamp(
        payloadOrError,
        "thread_ts",
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(threadTsOrError)) {
        return threadTsOrError;
      }

      const hasComposition =
        payloadOrError.blocks !== undefined || payloadOrError.attachments !== undefined;
      const blocksPayloadOrError =
        hasComposition === true
          ? readCompositionPayload(
              {
                blocks: payloadOrError.blocks,
                attachments: payloadOrError.attachments,
              },
              "messages post",
              USAGE_HINT,
              COMMAND_ID,
            )
          : undefined;
      if (isCliErrorResult(blocksPayloadOrError)) {
        return blocksPayloadOrError;
      }

      const unfurlLinksOrError = readOptionalPayloadBoolean(
        payloadOrError,
        "unfurl_links",
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(unfurlLinksOrError)) {
        return unfurlLinksOrError;
      }

      const unfurlMediaOrError = readOptionalPayloadBoolean(
        payloadOrError,
        "unfurl_media",
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(unfurlMediaOrError)) {
        return unfurlMediaOrError;
      }

      const replyBroadcastOrError = readOptionalPayloadBoolean(
        payloadOrError,
        "reply_broadcast",
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(replyBroadcastOrError)) {
        return replyBroadcastOrError;
      }

      requestShape = {
        channelId: channelIdOrError,
        text: textOrError,
        threadTs: threadTsOrError,
        blocksPayload: blocksPayloadOrError,
        unfurlLinks: unfurlLinksOrError,
        unfurlMedia: unfurlMediaOrError,
        replyBroadcast: replyBroadcastOrError,
      };
    } else {
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

      const rawText = request.positionals.slice(1).join(" ");
      if (rawText.trim().length === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "messages post requires non-empty <text>. [MISSING_ARGUMENT]",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const textOrError = await readTextWithStdinMarker(
        rawText,
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
        request.context.readStdin,
      );
      if (isCliErrorResult(textOrError)) {
        return textOrError;
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

      const blocksPayloadOrError = await readBlocksOption(
        request.options,
        textOrError,
        "messages post",
        USAGE_HINT,
        COMMAND_ID,
        request.context.readStdin,
      );
      if (isCliErrorResult(blocksPayloadOrError)) {
        return blocksPayloadOrError;
      }

      requestShape = {
        channelId,
        text: textOrError,
        threadTs: threadTsOrError,
        blocksPayload: blocksPayloadOrError,
        unfurlLinks: unfurlLinksOrError,
        unfurlMedia: unfurlMediaOrError,
        replyBroadcast: replyBroadcastOrError,
      };
    }

    if (isCliErrorResult(requestShape)) {
      return requestShape;
    }

    const postPolicy = evaluatePostChannelPolicy(requestShape.channelId, deps.env);
    if (postPolicy.allowed === false) {
      return createError(
        "INVALID_ARGUMENT",
        `messages post blocked by channel policy: ${postPolicy.reason}. [POST_CHANNEL_POLICY]`,
        "Review SLACK_MCP_POST_CHANNEL_ALLOWLIST and SLACK_MCP_POST_CHANNEL_DENYLIST.",
        COMMAND_ID,
      );
    }

    const mrkdwnText = convertMarkdownToSlackMrkdwn(requestShape.text);
    const blockPayload = requestShape.blocksPayload;

    if (dryRunOrError) {
      return {
        ok: true,
        command: COMMAND_ID,
        message: `Dry run: message post validated for ${requestShape.channelId}.`,
        data: {
          dryRun: true,
          request: {
            channel: requestShape.channelId,
            text: mrkdwnText,
            thread_ts: requestShape.threadTs,
            blocks: blockPayload?.blocks,
            attachments: blockPayload?.attachments,
            unfurl_links: requestShape.unfurlLinks,
            unfurl_media: requestShape.unfurlMedia,
            reply_broadcast: requestShape.replyBroadcast,
          },
        },
        textLines: [
          `Dry run: validated message post to ${requestShape.channelId}.`,
          `thread_ts=${requestShape.threadTs ?? "(none)"}`,
        ],
      };
    }

    const tokenOverride = request.context.tokenTypeOverride;
    const resolveForPost =
      tokenOverride !== undefined
        ? () => resolveTokenForContext(request.context, deps.env, deps.resolveToken)
        : deps.resolveToken;
    const preferredType = tokenOverride ?? "xoxb";

    try {
      return await withTokenFallback(
        preferredType,
        deps.env,
        async (resolvedToken) => {
          const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
          const postMessagePayload = {
            channel: requestShape.channelId,
            text: mrkdwnText,
            threadTs: requestShape.threadTs,
            blocks: blockPayload?.blocks,
            attachments: blockPayload?.attachments,
            unfurlLinks: requestShape.unfurlLinks,
            unfurlMedia: requestShape.unfurlMedia,
            replyBroadcast: requestShape.replyBroadcast,
          };
          const data = await client.postMessage(postMessagePayload);

          return {
            ok: true,
            command: COMMAND_ID,
            message: `Message posted to ${data.channel}.`,
            data: {
              channel: data.channel,
              ts: data.ts,
              thread_ts: requestShape.threadTs,
              message: data.message,
            },
            textLines: [`Posted message to ${data.channel} at ${data.ts}.`],
          };
        },
        resolveForPost,
      );
    } catch (error) {
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const messagesPostHandler = createMessagesPostHandler();
