import {
  type BlocksPayload,
  type CreateClientOptions,
  isCliErrorResult,
  mapSlackClientError,
  readBlocksOption,
  readBooleanOption,
  readCompositionPayload,
  readJsonObjectOption,
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
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.post-ephemeral";
const USAGE_HINT =
  "Usage: slack messages post-ephemeral <channel-id> <user-id> <text(required,non-empty)|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json]";

const PAYLOAD_KEYS = ["channel", "user", "text", "thread_ts", "blocks", "attachments"];

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

export const createMessagesPostEphemeralHandler = (
  depsOverrides: Partial<MessagesPostEphemeralHandlerDeps> = {},
) => {
  const deps: MessagesPostEphemeralHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const dryRunOrError = readBooleanOption(
      request.options,
      "dry-run",
      "messages post-ephemeral",
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
      "messages post-ephemeral",
      USAGE_HINT,
      COMMAND_ID,
      request.context.readStdin,
    );
    if (isCliErrorResult(payloadOrError)) {
      return payloadOrError;
    }

    let channel: string;
    let user: string;
    let rawText: string;
    let threadTsOrError: string | undefined | CliResult;
    let blocksPayloadOrError: BlocksPayload | undefined | CliResult;

    if (payloadOrError !== undefined) {
      if (request.positionals.length > 0) {
        return createError(
          "INVALID_ARGUMENT",
          "messages post-ephemeral cannot mix positional arguments with --payload.",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const payloadKeyError = validatePayloadKeys(
        payloadOrError,
        PAYLOAD_KEYS,
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (payloadKeyError !== undefined) {
        return payloadKeyError;
      }

      const channelOrError = readRequiredPayloadString(
        payloadOrError,
        "channel",
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(channelOrError)) {
        return channelOrError;
      }

      const userOrError = readRequiredPayloadString(
        payloadOrError,
        "user",
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(userOrError)) {
        return userOrError;
      }

      const textOrError = readRequiredPayloadString(
        payloadOrError,
        "text",
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(textOrError)) {
        return textOrError;
      }

      channel = channelOrError;
      user = userOrError;
      rawText = textOrError;
      threadTsOrError = readOptionalPayloadTimestamp(
        payloadOrError,
        "thread_ts",
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
      );
      const hasComposition =
        payloadOrError.blocks !== undefined || payloadOrError.attachments !== undefined;
      blocksPayloadOrError =
        hasComposition === true
          ? readCompositionPayload(
              {
                blocks: payloadOrError.blocks,
                attachments: payloadOrError.attachments,
              },
              "messages post-ephemeral",
              USAGE_HINT,
              COMMAND_ID,
            )
          : undefined;
    } else {
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

      rawText = request.positionals.slice(2).join(" ");
      if (rawText.trim().length === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "messages post-ephemeral requires non-empty <text>. [MISSING_ARGUMENT]",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      channel = rawChannel.trim();
      user = rawUser.trim();
      threadTsOrError = readThreadTsOption(
        request.options,
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
      );
      blocksPayloadOrError = undefined;
    }
    if (isCliErrorResult(threadTsOrError)) {
      return threadTsOrError;
    }

    const textOrError = await readTextWithStdinMarker(
      rawText,
      "messages post-ephemeral",
      USAGE_HINT,
      COMMAND_ID,
      request.context.readStdin,
    );
    if (isCliErrorResult(textOrError)) {
      return textOrError;
    }
    const text = textOrError;

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
    if (blocksPayloadOrError === undefined) {
      blocksPayloadOrError = await readBlocksOption(
        request.options,
        text,
        "messages post-ephemeral",
        USAGE_HINT,
        COMMAND_ID,
        request.context.readStdin,
      );
    }
    if (isCliErrorResult(blocksPayloadOrError)) {
      return blocksPayloadOrError;
    }

    if (dryRunOrError) {
      return {
        ok: true,
        command: COMMAND_ID,
        message: `Dry run: ephemeral post validated for ${channel}.`,
        data: {
          dryRun: true,
          request: {
            channel,
            user,
            text: mrkdwnText,
            thread_ts: threadTsOrError,
            blocks: blocksPayloadOrError?.blocks,
            attachments: blocksPayloadOrError?.attachments,
          },
        },
        textLines: [`Dry run: validated ephemeral post to ${channel} for ${user}.`],
      };
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.postEphemeral({
        channel,
        user,
        text: mrkdwnText,
        threadTs: threadTsOrError,
        blocks: blocksPayloadOrError?.blocks,
        attachments: blocksPayloadOrError?.attachments,
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
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const messagesPostEphemeralHandler = createMessagesPostEphemeralHandler();
