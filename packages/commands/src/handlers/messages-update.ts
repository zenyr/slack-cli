import {
  type CreateClientOptions,
  isValidSlackTimestamp,
  mapSlackClientError,
} from "./messages-shared";
import { createError } from "../errors";
import { parseSlackMessagePermalink } from "../messages/permalink";
import { convertMarkdownToSlackMrkdwn } from "../messages-post/markdown";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPostWebApiClient } from "../slack/types";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.update";
const USAGE_HINT =
  "Usage: slack messages update <channel-id> <timestamp> <text> [--json] or slack messages update <message-url> <text> [--json]";

type MessagesUpdateHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackPostWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesUpdateHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const resolveTargetAndText = (
  request: CommandRequest,
): { channel: string; ts: string; text: string } | CliResult => {
  const firstPositional = request.positionals[0];
  if (firstPositional === undefined || firstPositional.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages update requires <channel-id> or <message-url>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const permalinkResult = parseSlackMessagePermalink(firstPositional);
  if (permalinkResult.kind === "invalid") {
    return createError(
      "INVALID_ARGUMENT",
      `invalid messages update message-url: ${permalinkResult.reason}`,
      `${permalinkResult.hint} Input: ${firstPositional}`,
      COMMAND_ID,
    );
  }

  if (permalinkResult.kind === "ok") {
    const text = request.positionals.slice(1).join(" ").trim();
    if (text.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages update requires non-empty <text>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    return {
      channel: permalinkResult.channel,
      ts: permalinkResult.ts,
      text,
    };
  }

  const channel = firstPositional.trim();
  const rawTimestamp = request.positionals[1];
  if (rawTimestamp === undefined || rawTimestamp.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages update requires <timestamp> when <channel-id> is used. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const ts = rawTimestamp.trim();
  if (!isValidSlackTimestamp(ts)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages update <timestamp> must match Slack timestamp format seconds.fraction. Received: ${ts}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const text = request.positionals.slice(2).join(" ").trim();
  if (text.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages update requires non-empty <text>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return { channel, ts, text };
};

export const createMessagesUpdateHandler = (
  depsOverrides: Partial<MessagesUpdateHandlerDeps> = {},
) => {
  const deps: MessagesUpdateHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const targetOrError = resolveTargetAndText(request);
    if ("ok" in targetOrError) {
      return targetOrError;
    }

    const mrkdwnText = convertMarkdownToSlackMrkdwn(targetOrError.text);

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.updateMessage({
        channel: targetOrError.channel,
        ts: targetOrError.ts,
        text: mrkdwnText,
      });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Message updated in ${data.channel}.`,
        data: {
          channel: data.channel,
          ts: data.ts,
        },
        textLines: [`Updated message in ${data.channel} at ${data.ts}.`],
      };
    } catch (error) {
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const messagesUpdateHandler = createMessagesUpdateHandler();
