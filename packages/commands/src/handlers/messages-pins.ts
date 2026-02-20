import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPinnedItem, SlackPinsWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.pins";
const USAGE_HINT = "Usage: slack messages pins <channel-id(required,non-empty)> [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesPinsHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackPinsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesPinsHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.pins.",
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

const formatPinnedItem = (item: SlackPinnedItem): string => {
  const parts: string[] = [`[${item.type}]`];

  if (item.message !== undefined) {
    parts.push(item.message.ts);
    if (item.message.user !== undefined) {
      parts.push(item.message.user);
    }
    parts.push(item.message.text);
  }

  const meta: string[] = [];
  if (item.createdBy !== undefined) {
    meta.push(`pinned by ${item.createdBy}`);
  }
  if (item.created !== undefined) {
    meta.push(`at ${item.created}`);
  }
  if (meta.length > 0) {
    parts.push(`(${meta.join(" ")})`);
  }

  return parts.join(" ");
};

export const createMessagesPinsHandler = (depsOverrides: Partial<MessagesPinsHandlerDeps> = {}) => {
  const deps: MessagesPinsHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages pins requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const channel = rawChannel.trim();

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.listPins(channel);

      const textLines: string[] =
        data.items.length === 0
          ? [`No pinned items in ${channel}.`]
          : [
              `Pinned items in ${channel}: ${data.items.length} items`,
              ...data.items.map(formatPinnedItem),
            ];

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Found ${data.items.length} pinned items in ${channel}.`,
        data: {
          channel: data.channel,
          items: data.items,
        },
        textLines,
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesPinsHandler = createMessagesPinsHandler();
