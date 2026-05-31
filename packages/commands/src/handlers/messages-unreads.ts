import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type {
  ResolvedSlackToken,
  SlackChannel,
  SlackChannelInfoWebApiClient,
  SlackMessage,
  SlackWebApiClient,
} from "../slack/types";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.unreads";
const USAGE_HINT =
  "Usage: slack messages unreads [--include-messages[=<bool>]] [--channel-types=<all|dm|group_dm|partner|internal>] [--max-channels=<n>] [--max-messages-per-channel=<n>] [--mentions-only[=<bool>]] [--include-muted[=<bool>]] [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesUnreadsHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient & SlackChannelInfoWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

type UnreadChannel = {
  channelId: string;
  channelName: string;
  channelType: "dm" | "group_dm" | "partner" | "internal";
  unreadCount: number;
  lastRead?: string;
  latest?: string;
};

type UnreadMessage = SlackMessage & {
  channel: string;
  channelType: UnreadChannel["channelType"];
};

const defaultDeps: MessagesUnreadsHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const readBooleanOption = (
  options: CliOptions,
  key: string,
  defaultValue: boolean,
): boolean | CliResult => {
  const value = options[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return createError(
    "INVALID_ARGUMENT",
    `messages unreads --${key} expects boolean value. Received: ${value}`,
    USAGE_HINT,
    COMMAND_ID,
  );
};

const readIntegerOption = (
  options: CliOptions,
  key: string,
  defaultValue: number,
): number | CliResult => {
  const value = options[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string" || value.trim().length === 0 || !/^\d+$/.test(value)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages unreads --${key} requires a positive integer value.`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) {
    return createError(
      "INVALID_ARGUMENT",
      `messages unreads --${key} must be greater than 0. Received: ${value}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return parsed;
};

const readChannelType = (options: CliOptions): UnreadChannel["channelType"] | "all" | CliResult => {
  const value = options["channel-types"];
  if (value === undefined) {
    return "all";
  }
  if (typeof value !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "messages unreads --channel-types requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const normalized = value.trim();
  switch (normalized) {
    case "all":
    case "dm":
    case "group_dm":
    case "partner":
    case "internal":
      return normalized;
  }

  return createError(
    "INVALID_ARGUMENT",
    `messages unreads --channel-types value invalid: ${normalized}`,
    USAGE_HINT,
    COMMAND_ID,
  );
};

const isCliErrorResult = (
  value: boolean | number | string | undefined | CliResult,
): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const classifyChannel = (
  _channel: SlackChannel,
  fallbackType: "public" | "private" | "im" | "mpim",
  isExtShared?: boolean,
): UnreadChannel["channelType"] => {
  if (fallbackType === "im") {
    return "dm";
  }
  if (fallbackType === "mpim") {
    return "group_dm";
  }
  return isExtShared === true ? "partner" : "internal";
};

const displayName = (channel: SlackChannel, type: UnreadChannel["channelType"]): string => {
  if (type === "internal" || type === "partner") {
    return channel.name.startsWith("#") ? channel.name : `#${channel.name}`;
  }
  if (type === "dm" && !channel.name.startsWith("@")) {
    return `@${channel.name}`;
  }
  return channel.name;
};

const priority = (type: UnreadChannel["channelType"]): number => {
  switch (type) {
    case "dm":
      return 0;
    case "group_dm":
      return 1;
    case "partner":
      return 2;
    case "internal":
      return 3;
  }
};

const mapError = (error: unknown): CliResult => {
  if (isSlackClientError(error)) {
    switch (error.code) {
      case "SLACK_CONFIG_ERROR":
      case "SLACK_AUTH_ERROR":
      case "SLACK_API_ERROR":
        return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
      case "SLACK_HTTP_ERROR":
      case "SLACK_RESPONSE_ERROR":
        return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
    }
  }

  return createError(
    "INTERNAL_ERROR",
    "Unexpected messages.unreads failure.",
    "Try again with --json for structured output.",
    COMMAND_ID,
  );
};

export const createMessagesUnreadsHandler = (
  depsOverrides: Partial<MessagesUnreadsHandlerDeps> = {},
) => {
  const deps: MessagesUnreadsHandlerDeps = { ...defaultDeps, ...depsOverrides };

  return async (request: CommandRequest): Promise<CliResult> => {
    const includeMessages = readBooleanOption(request.options, "include-messages", true);
    const mentionsOnly = readBooleanOption(request.options, "mentions-only", false);
    const includeMuted = readBooleanOption(request.options, "include-muted", false);
    const maxChannels = readIntegerOption(request.options, "max-channels", 50);
    const maxMessagesPerChannel = readIntegerOption(
      request.options,
      "max-messages-per-channel",
      10,
    );
    const channelTypes = readChannelType(request.options);

    if (isCliErrorResult(includeMessages)) {
      return includeMessages;
    }
    if (isCliErrorResult(mentionsOnly)) {
      return mentionsOnly;
    }
    if (isCliErrorResult(includeMuted)) {
      return includeMuted;
    }
    if (isCliErrorResult(maxChannels)) {
      return maxChannels;
    }
    if (isCliErrorResult(maxMessagesPerChannel)) {
      return maxMessagesPerChannel;
    }
    if (isCliErrorResult(channelTypes)) {
      return channelTypes;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      if (resolvedToken.tokenType === "xoxb") {
        return createError(
          "INVALID_ARGUMENT",
          "messages unreads requires a user token. Bot tokens do not support unread tracking.",
          "Use an xoxp token for OAuth fallback coverage. Edge xoxc/xoxd support is not available in this CLI token resolver yet.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const scanTypes: ("public" | "private" | "im" | "mpim")[] = [
        "im",
        "mpim",
        "public",
        "private",
      ];
      const unreadChannels: UnreadChannel[] = [];
      const unreadMessages: UnreadMessage[] = [];

      for (const scanType of scanTypes) {
        if (unreadChannels.length >= maxChannels) {
          break;
        }

        const listed = await client.listChannels({
          types: [scanType],
          limit: maxChannels,
          userOnly: true,
        });

        for (const channel of listed.channels) {
          if (unreadChannels.length >= maxChannels) {
            break;
          }

          const info = await client.fetchChannelInfo(channel.id);
          const channelType = classifyChannel(channel, scanType, info.channel.isExtShared);
          if (channelTypes !== "all" && channelTypes !== channelType) {
            continue;
          }

          const lastRead = info.channel.lastRead;
          const unreadCountFromInfo = info.channel.unreadCount ?? 0;
          if (mentionsOnly && unreadCountFromInfo === 0) {
            continue;
          }
          if (lastRead === undefined || lastRead.length === 0) {
            continue;
          }

          const history = await client.fetchChannelHistory({
            channel: channel.id,
            oldest: lastRead,
            limit: maxMessagesPerChannel,
            inclusive: false,
          });
          if (history.messages.length === 0) {
            continue;
          }

          const unreadChannel: UnreadChannel = {
            channelId: channel.id,
            channelName: displayName(channel, channelType),
            channelType,
            unreadCount: history.messages.length,
            lastRead,
            latest: info.channel.latestTs,
          };
          unreadChannels.push(unreadChannel);

          if (includeMessages) {
            for (const message of history.messages) {
              unreadMessages.push({ ...message, channel: channel.id, channelType });
            }
          }
        }
      }

      unreadChannels.sort((a, b) => priority(a.channelType) - priority(b.channelType));
      const textLines = [`Found ${unreadChannels.length} channels with unread messages.`];
      for (const channel of unreadChannels) {
        textLines.push(
          `${channel.channelName} (${channel.channelId}) ${channel.channelType}: ${channel.unreadCount} unread`,
        );
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: "Unread messages loaded.",
        data: {
          channels: unreadChannels,
          messages: includeMessages ? unreadMessages : undefined,
          mode: "xoxp_fallback",
          muted_filter_available: false,
          include_muted_requested: includeMuted,
        },
        textLines,
      };
    } catch (error) {
      return mapError(error);
    }
  };
};

export const messagesUnreadsHandler = createMessagesUnreadsHandler();
