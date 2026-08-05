import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import type {
  ResolvedSlackToken,
  SlackChannel,
  SlackChannelType,
  SlackClientError,
  SlackWebApiClient,
} from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "channels.me";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 999;
const DEFAULT_TYPES: SlackChannelType[] = ["public", "private"];

const isSlackChannelType = (value: string): value is SlackChannelType => {
  return ["public", "private", "im", "mpim"].includes(value);
};

const parseTypes = (options: CliOptions): SlackChannelType[] => {
  const raw = options.type;
  if (raw === undefined) {
    return DEFAULT_TYPES;
  }
  if (typeof raw !== "string") {
    throw new Error("type requires a comma-separated value");
  }

  const types: SlackChannelType[] = [];
  for (const value of raw.split(",").map((item) => item.trim())) {
    if (!isSlackChannelType(value)) {
      throw new Error(`invalid type value: ${raw}`);
    }
    types.push(value);
  }
  return types;
};

const parseLimit = (options: CliOptions): number => {
  const raw = options.limit;
  if (raw === undefined) {
    return DEFAULT_LIMIT;
  }
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new Error("limit must be a positive integer");
  }

  return Math.min(Number.parseInt(raw, 10), MAX_LIMIT);
};

const parseCursor = (options: CliOptions): string | undefined => {
  const raw = options.cursor;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("cursor must be a non-empty string");
  }
  return raw;
};

const toChannelLine = (channel: SlackChannel): string => {
  const visibility = channel.isPrivate ? "private" : "public";
  const memberCount =
    channel.memberCount === undefined ? "members n/a" : `${channel.memberCount} members`;
  return `#${channel.name} (${channel.id}) - ${visibility}, ${memberCount}`;
};

const mapSlackError = (error: SlackClientError): CliResult => {
  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID, {
        needed: error.needed,
        provided: error.provided,
      });
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID, {
        needed: error.needed,
        provided: error.provided,
      });
  }
};

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type ChannelsMeHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: ChannelsMeHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

export const createChannelsMeHandler = (overrides: Partial<ChannelsMeHandlerDeps> = {}) => {
  const deps: ChannelsMeHandlerDeps = { ...defaultDeps, ...overrides };

  return async (request: CommandRequest): Promise<CliResult> => {
    let types: SlackChannelType[];
    let limit: number;
    let cursor: string | undefined;
    try {
      types = parseTypes(request.options);
      limit = parseLimit(request.options);
      cursor = parseCursor(request.options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid channels me options";
      return createError("INVALID_ARGUMENT", message, undefined, COMMAND_ID);
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const result = await client.listChannels({ types, limit, cursor, userOnly: true });
      const channels = result.channels.slice(0, limit);
      const textLines = [`Found ${channels.length} channels you belong to.`];
      for (const channel of channels) {
        textLines.push(toChannelLine(channel));
      }
      if (result.nextCursor !== undefined) {
        textLines.push(`Next cursor: ${result.nextCursor}`);
      }

      return {
        ok: true,
        command: COMMAND_ID,
        data: {
          channels,
          count: channels.length,
          next_cursor: result.nextCursor,
        },
        textLines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackError(error);
      }
      return createError(
        "INTERNAL_ERROR",
        "Failed to list channels you belong to.",
        "Retry with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const channelsMeHandler = createChannelsMeHandler();
