import {
  type BlocksPayload,
  type CreateClientOptions,
  isCliErrorResult,
  isValidSlackTimestamp,
  mapSlackClientError,
  readBlocksOption,
  readBooleanOption,
  readCompositionPayload,
  readJsonObjectOption,
  readRequiredPayloadString,
  readTextWithStdinMarker,
  resolveTokenForContext,
  validatePayloadKeys,
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
  "Usage: slack messages update <channel-id> <timestamp> <text(required,non-empty)|-> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json] or slack messages update <message-url> <text(required,non-empty)|-> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json]";

const PAYLOAD_KEYS = ["channel", "ts", "text", "blocks", "attachments"];

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
    const dryRunOrError = readBooleanOption(
      request.options,
      "dry-run",
      "messages update",
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
      "messages update",
      USAGE_HINT,
      COMMAND_ID,
      request.context.readStdin,
    );
    if (isCliErrorResult(payloadOrError)) {
      return payloadOrError;
    }

    let channel: string;
    let ts: string;
    let rawText: string;
    let blocksPayloadOrError: BlocksPayload | undefined | CliResult;

    if (payloadOrError !== undefined) {
      if (request.positionals.length > 0) {
        return createError(
          "INVALID_ARGUMENT",
          "messages update cannot mix positional arguments with --payload.",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const payloadKeyError = validatePayloadKeys(
        payloadOrError,
        PAYLOAD_KEYS,
        "messages update",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (payloadKeyError !== undefined) {
        return payloadKeyError;
      }

      const channelOrError = readRequiredPayloadString(
        payloadOrError,
        "channel",
        "messages update",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(channelOrError)) {
        return channelOrError;
      }

      const tsOrError = readRequiredPayloadString(
        payloadOrError,
        "ts",
        "messages update",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(tsOrError)) {
        return tsOrError;
      }

      if (!isValidSlackTimestamp(tsOrError)) {
        return createError(
          "INVALID_ARGUMENT",
          `messages update --payload field 'ts' must match Slack timestamp format seconds.fraction. Received: ${tsOrError}`,
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const textOrError = readRequiredPayloadString(
        payloadOrError,
        "text",
        "messages update",
        USAGE_HINT,
        COMMAND_ID,
      );
      if (isCliErrorResult(textOrError)) {
        return textOrError;
      }

      channel = channelOrError;
      ts = tsOrError;
      rawText = textOrError;
      const hasComposition =
        payloadOrError.blocks !== undefined || payloadOrError.attachments !== undefined;
      blocksPayloadOrError =
        hasComposition === true
          ? readCompositionPayload(
              {
                blocks: payloadOrError.blocks,
                attachments: payloadOrError.attachments,
              },
              "messages update",
              USAGE_HINT,
              COMMAND_ID,
            )
          : undefined;
    } else {
      const targetOrError = resolveTargetAndText(request);
      if ("ok" in targetOrError) {
        return targetOrError;
      }

      channel = targetOrError.channel;
      ts = targetOrError.ts;
      rawText = targetOrError.text;
      blocksPayloadOrError = undefined;
    }

    const textOrError = await readTextWithStdinMarker(
      rawText,
      "messages update",
      USAGE_HINT,
      COMMAND_ID,
      request.context.readStdin,
    );
    if (isCliErrorResult(textOrError)) {
      return textOrError;
    }

    const mrkdwnText = convertMarkdownToSlackMrkdwn(textOrError);
    if (blocksPayloadOrError === undefined) {
      blocksPayloadOrError = await readBlocksOption(
        request.options,
        textOrError,
        "messages update",
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
        message: `Dry run: message update validated for ${channel}.`,
        data: {
          dryRun: true,
          request: {
            channel,
            ts,
            text: mrkdwnText,
            blocks: blocksPayloadOrError?.blocks,
            attachments: blocksPayloadOrError?.attachments,
          },
        },
        textLines: [`Dry run: validated message update in ${channel} at ${ts}.`],
      };
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.updateMessage({
        channel,
        ts,
        text: mrkdwnText,
        blocks: blocksPayloadOrError?.blocks,
        attachments: blocksPayloadOrError?.attachments,
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
