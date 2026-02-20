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

const COMMAND_ID = "channels.search";
const USAGE_HINT =
  "Usage: slack channels search <query(required,non-empty)> [--type <public|private|im|mpim>] [--json]";

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

  for (const token of tokens) {
    if (!isSlackChannelType(token)) {
      throw new Error(`invalid type value: ${typeValue}`);
    }
    types.push(token);
  }

  return types;
};

const compileChannelFilterRegexp = (query: string): RegExp | string => {
  try {
    return new RegExp(query, "i");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return `Invalid query regex: ${errorMsg}`;
  }
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
    "Failed to search channels due to unexpected runtime error.",
    "Retry with --json and inspect logs.",
    COMMAND_ID,
  );
};

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type ChannelsSearchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultChannelsSearchDeps: ChannelsSearchHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

export const createChannelsSearchHandler = (
  depsOverrides: Partial<ChannelsSearchHandlerDeps> = {},
) => {
  const deps: ChannelsSearchHandlerDeps = {
    ...defaultChannelsSearchDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    try {
      const query = request.positionals.join(" ").trim();
      if (query.length === 0) {
        return createError(
          "INVALID_ARGUMENT",
          "channels search requires a <query> argument.",
          USAGE_HINT,
          COMMAND_ID,
        );
      }

      const types = parseChannelTypes(request.options);

      const regexOrError = compileChannelFilterRegexp(query);
      if (typeof regexOrError === "string") {
        return createError("INVALID_ARGUMENT", regexOrError, undefined, COMMAND_ID);
      }

      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const result = await client.listChannels({ types, limit: 999 });

      const matchedChannels = result.channels.filter((ch) => regexOrError.test(ch.name));

      const textLines = [`Found ${matchedChannels.length} channels matching "${query}".`];
      for (const channel of matchedChannels) {
        textLines.push(toChannelLine(channel));
      }

      return {
        ok: true,
        command: COMMAND_ID,
        data: {
          channels: matchedChannels,
          count: matchedChannels.length,
          query,
        },
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

export const channelsSearchHandler = createChannelsSearchHandler();
