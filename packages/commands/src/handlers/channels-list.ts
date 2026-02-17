import { createError } from "../errors";
import type { SlackChannel, SlackChannelType, SlackClientError, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError } from "../slack";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "channels.list";

const formatVisibility = (isPrivate: boolean): string => {
  return isPrivate ? "private" : "public";
};

const formatArchived = (isArchived: boolean): string => {
  return isArchived ? "archived" : "active";
};

const toChannelLine = (channel: SlackChannel): string => {
  const memberCountLabel =
    channel.memberCount === undefined ? "members n/a" : `${channel.memberCount} members`;
  return `#${channel.name} (${channel.id}) - ${formatVisibility(channel.isPrivate)}, ${formatArchived(channel.isArchived)}, ${memberCountLabel}`;
};

const isSlackChannelType = (value: string): value is SlackChannelType => {
  return ["public", "private", "im", "mpim"].includes(value);
};

const parseChannelTypes = (options: CliOptions): SlackChannelType[] => {
  const typeValue = options.type;
  if (typeValue === undefined) {
    return ["public", "private"];
  }

  if (typeof typeValue !== "string") {
    throw new Error("type must be a string");
  }

  const normalizedValue = typeValue.trim();
  if (normalizedValue.length === 0) {
    return ["public", "private"];
  }

  const tokens = normalizedValue.split(",").map((t) => t.trim());
  const types: SlackChannelType[] = [];

  // Validate and collect all tokens
  for (const token of tokens) {
    if (!isSlackChannelType(token)) {
      throw new Error(`invalid type value: ${typeValue}`);
    }
    types.push(token);
  }

  return types;
};

const parseSort = (options: CliOptions): string | undefined => {
  const sortValue = options.sort;
  if (sortValue === undefined) {
    return undefined;
  }

  if (typeof sortValue !== "string") {
    throw new Error("sort must be a string");
  }

  const normalizedValue = sortValue.trim();
  if (normalizedValue.length === 0) {
    return undefined;
  }

  const validSortValues = new Set(["name", "popularity"]);
  if (!validSortValues.has(normalizedValue)) {
    throw new Error(`invalid sort value: ${sortValue}`);
  }

  return normalizedValue;
};

const parseLimit = (options: CliOptions): number => {
  const limitValue = options.limit;
  if (limitValue === undefined) {
    return 999;
  }

  if (typeof limitValue === "boolean") {
    if (limitValue) {
      throw new Error("limit must not be a boolean flag");
    }
    return 999;
  }

  if (typeof limitValue === "string") {
    // Reject partial numeric strings: validate string is canonical integer
    if (!/^[1-9]\d*$/.test(limitValue)) {
      throw new Error(`limit must be an integer > 0, got: ${limitValue}`);
    }
    const numValue = Number.parseInt(limitValue, 10);
    return numValue;
  }

  throw new Error("limit must be a string or boolean");
};

const decodeCursor = (cursorB64: string): string => {
  try {
    const buf = Buffer.from(cursorB64, "base64");
    return buf.toString("utf-8");
  } catch {
    throw new Error("cursor decode failed");
  }
};

const encodeCursor = (channelId: string): string => {
  return Buffer.from(channelId, "utf-8").toString("base64");
};

const mapSlackClientError = (error: SlackClientError): CliResult => {
  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_HTTP_ERROR": {
      const retryHint =
        error.retryAfterSeconds === undefined
          ? error.hint
          : `${error.hint ?? "Retry later."} Retry after ${error.retryAfterSeconds}s.`;
      return createError("INTERNAL_ERROR", error.message, retryHint, COMMAND_ID);
    }
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

const mapSlackErrorToCliResult = (error: unknown): CliResult => {
  if (isSlackClientError(error)) {
    return mapSlackClientError(error);
  }

  return createError(
    "INTERNAL_ERROR",
    "Failed to list channels due to unexpected runtime error.",
    "Retry with --json and inspect logs.",
    COMMAND_ID,
  );
};

type ChannelsListHandlerDeps = {
  createClient: () => SlackWebApiClient;
};

const defaultChannelsListDeps: ChannelsListHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createChannelsListHandler = (depsOverrides: Partial<ChannelsListHandlerDeps> = {}) => {
  const deps: ChannelsListHandlerDeps = {
    ...defaultChannelsListDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    try {
      const types = parseChannelTypes(request.options);
      const sort = parseSort(request.options);
      const limit = parseLimit(request.options);

      const cursorStr = request.options.cursor;
      let cursorChannelId: string | undefined;
      if (cursorStr !== undefined) {
        if (typeof cursorStr !== "string" || cursorStr.trim().length === 0) {
          throw new Error("cursor must be a non-empty string");
        }
        cursorChannelId = decodeCursor(cursorStr);
        if (!cursorChannelId) {
          throw new Error("cursor decode failed: empty result");
        }
      }

      const client = deps.createClient();
      const result = await client.listChannels({ types, limit: 999 });

      let channels = result.channels;

      if (sort === "popularity") {
        channels = [...channels].sort((a, b) => {
          const countA = a.memberCount ?? 0;
          const countB = b.memberCount ?? 0;
          if (countA !== countB) {
            return countB - countA;
          }
          return a.name.localeCompare(b.name);
        });
      }

      let startIdx = 0;
      if (cursorChannelId !== undefined) {
        const cursorIdx = channels.findIndex((ch) => ch.id === cursorChannelId);
        if (cursorIdx === -1) {
          return createError(
            "INVALID_ARGUMENT",
            "cursor references non-existent channel",
            "Cursor may be stale; re-run without cursor.",
            COMMAND_ID,
          );
        }
        startIdx = cursorIdx + 1;
      }

      const pagedChannels = channels.slice(startIdx, startIdx + limit);
      let nextCursorValue: string | undefined;
      if (startIdx + limit < channels.length && pagedChannels.length > 0) {
        const lastChannel = pagedChannels[pagedChannels.length - 1];
        if (lastChannel !== undefined) {
          nextCursorValue = encodeCursor(lastChannel.id);
        }
      }

      const textLines = [`Found ${pagedChannels.length} channels.`];
      for (const channel of pagedChannels) {
        textLines.push(toChannelLine(channel));
      }

      if (nextCursorValue !== undefined) {
        textLines.push(`Next cursor: ${nextCursorValue}`);
      }

      const data: Record<string, unknown> = {
        channels: pagedChannels,
      };

      if (nextCursorValue !== undefined) {
        data.next_cursor = nextCursorValue;
      }

      return {
        ok: true,
        command: COMMAND_ID,
        data,
        textLines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      const err = error instanceof Error ? error.message : "unknown error";
      return createError("INVALID_ARGUMENT", err, undefined, COMMAND_ID);
    }
  };
};

export const channelsListHandler = createChannelsListHandler();
