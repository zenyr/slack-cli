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
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.post-ephemeral";
const USAGE_HINT =
  "Usage: slack messages post-ephemeral <channel-id> <user-id> <text> [--thread-ts=<ts>] [--blocks[=<json|bool>]] [--json]";

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

    const threadTsOrError = readThreadTsOption(
      request.options,
      "messages post-ephemeral",
      USAGE_HINT,
      COMMAND_ID,
    );
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
    const blocksPayloadOrError = readBlocksOption(
      request.options,
      text,
      "messages post-ephemeral",
      USAGE_HINT,
      COMMAND_ID,
    );
    if (isCliErrorResult(blocksPayloadOrError)) {
      return blocksPayloadOrError;
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
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
