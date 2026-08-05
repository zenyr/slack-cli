import {
  type BlocksPayload,
  type CreateClientOptions,
  isCliErrorResult,
  mapSlackClientError,
  readBlocksOption,
  readBooleanOption,
  readCompositionPayload,
  readJsonObjectOptionWithFile,
  readOptionalPayloadBoolean,
  readOptionalPayloadTimestamp,
  readRequiredPayloadString,
  readTextWithStdinMarker,
  readThreadTsOption,
  resolveTokenForContext,
  validatePayloadKeys,
} from "./messages-shared";
import { isChannelId, resolveChannelReference } from "../channels/resolve";
import { createError } from "../errors";
import { convertMarkdownToSlackMrkdwn } from "../messages-post/markdown";
import { evaluatePostChannelPolicy } from "../messages-post/policy";
import { createSlackWebApiClient, truncateBlockFallbackText } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.post";
const USAGE_HINT =
  "Usage: slack messages post <channel-id|#name|name> <text(required,non-empty)|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|-|@file>] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]. In --payload, text may be omitted or empty only when blocks is a non-empty array.";

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
  resolveChannel: (reference: string, options: CreateClientOptions) => Promise<string>;
};

const defaultDeps: MessagesPostHandlerDeps = {
  createClient: createSlackWebApiClient,
  env: process.env,
  resolveToken: resolveSlackToken,
  resolveChannel: async (reference, options) => {
    return await resolveChannelReference(reference, createSlackWebApiClient(options));
  },
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

    const payloadReadOrError = await readJsonObjectOptionWithFile(
      request.options,
      "payload",
      "messages post",
      USAGE_HINT,
      COMMAND_ID,
      request.context.readStdin,
    );
    if (isCliErrorResult(payloadReadOrError)) {
      return payloadReadOrError;
    }
    const payloadOrError = payloadReadOrError.payload;
    const payloadFromFile = payloadReadOrError.fromFile;

    const payloadOut = request.options["payload-out"];
    if (payloadOut !== undefined && dryRunOrError === false) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post --payload-out requires --dry-run.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }
    if (
      payloadOut !== undefined &&
      (typeof payloadOut !== "string" || payloadOut.trim().length === 0)
    ) {
      return createError(
        "INVALID_ARGUMENT",
        "messages post --payload-out requires a file path.",
        USAGE_HINT,
        COMMAND_ID,
      );
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

      const rawText = payloadOrError.text;
      if (rawText !== undefined && typeof rawText !== "string") {
        return createError(
          "INVALID_ARGUMENT",
          "messages post --payload requires string field 'text' when provided.",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const text = typeof rawText === "string" ? rawText.trim() : "";
      if (text.length === 0 && (blocksPayloadOrError?.blocks.length ?? 0) === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "messages post --payload requires non-empty string field 'text' unless 'blocks' is a non-empty array.",
          USAGE_HINT,
          COMMAND_ID,
        );
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
        text,
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

    if (isChannelId(requestShape.channelId)) {
      const initialPolicy = evaluatePostChannelPolicy(requestShape.channelId, deps.env);
      if (initialPolicy.allowed === false) {
        return createError(
          "INVALID_ARGUMENT",
          `messages post blocked by channel policy: ${initialPolicy.reason}. [POST_CHANNEL_POLICY]`,
          "Review SLACK_MCP_POST_CHANNEL_ALLOWLIST and SLACK_MCP_POST_CHANNEL_DENYLIST.",
          COMMAND_ID,
        );
      }
    }

    let resolvedToken: ResolvedSlackToken | undefined;
    let resolvedChannelId = requestShape.channelId;
    try {
      if (!isChannelId(requestShape.channelId) || dryRunOrError === false) {
        resolvedToken = await resolveTokenForContext(request.context, deps.env, deps.resolveToken);
      }
      if (!isChannelId(requestShape.channelId)) {
        if (resolvedToken === undefined) {
          throw new Error("Token resolution invariant failed.");
        }
        resolvedChannelId = await deps.resolveChannel(requestShape.channelId, {
          token: resolvedToken.token,
          env: deps.env,
        });
      }
    } catch (error) {
      return mapSlackClientError(error, COMMAND_ID);
    }

    const postPolicy = evaluatePostChannelPolicy(resolvedChannelId, deps.env);
    if (postPolicy.allowed === false) {
      return createError(
        "INVALID_ARGUMENT",
        `messages post blocked by channel policy: ${postPolicy.reason}. [POST_CHANNEL_POLICY]`,
        "Review SLACK_MCP_POST_CHANNEL_ALLOWLIST and SLACK_MCP_POST_CHANNEL_DENYLIST.",
        COMMAND_ID,
      );
    }

    const convertedText = payloadFromFile
      ? requestShape.text
      : convertMarkdownToSlackMrkdwn(requestShape.text);
    const blockPayload = requestShape.blocksPayload;
    const mrkdwnText =
      (blockPayload?.blocks.length ?? 0) > 0 || (blockPayload?.attachments.length ?? 0) > 0
        ? truncateBlockFallbackText(convertedText)
        : convertedText;
    const resolvedRequest = {
      channel: resolvedChannelId,
      text: mrkdwnText,
      thread_ts: requestShape.threadTs,
      blocks: blockPayload?.blocks,
      attachments: blockPayload?.attachments,
      unfurl_links: requestShape.unfurlLinks,
      unfurl_media: requestShape.unfurlMedia,
      reply_broadcast: requestShape.replyBroadcast,
    };

    if (dryRunOrError) {
      let artifact: { path: string; bytes: number } | undefined;
      if (typeof payloadOut === "string") {
        const path = payloadOut.trim();
        const serialized = `${JSON.stringify(resolvedRequest, null, 2)}\n`;
        let created = false;
        let handle: Awaited<ReturnType<typeof open>> | undefined;
        try {
          handle = await open(path, "wx", 0o600);
          created = true;
          await handle.writeFile(serialized, "utf8");
        } catch (error) {
          if (created) {
            await rm(path, { force: true });
          }
          const exists = error instanceof Error && Reflect.get(error, "code") === "EEXIST";
          return createError(
            "INVALID_ARGUMENT",
            exists
              ? `messages post --payload-out refuses to overwrite existing file: ${path}.`
              : `messages post could not write payload artifact: ${path}.`,
            exists
              ? "Choose a new artifact path, then send it with --payload=@file."
              : "Confirm the parent directory exists and is writable.",
            COMMAND_ID,
          );
        } finally {
          await handle?.close();
        }
        artifact = { path, bytes: Buffer.byteLength(serialized) };
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Dry run: message post validated for ${resolvedChannelId}.`,
        data: {
          dryRun: true,
          request: resolvedRequest,
          artifact,
        },
        textLines: [
          `Dry run: validated message post to ${resolvedChannelId}.`,
          `thread_ts=${requestShape.threadTs ?? "(none)"}`,
        ],
      };
    }

    try {
      if (resolvedToken === undefined) {
        throw new Error("Token resolution invariant failed.");
      }
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const postMessagePayload = {
        channel: resolvedChannelId,
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
    } catch (error) {
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const messagesPostHandler = createMessagesPostHandler();

import { open, rm } from "node:fs/promises";
