import { resolveTokenForContext } from "./messages-shared";
import { createUsersListHandler, parseCursorOption, parseLimitOption } from "./users-list";
import { createError } from "../errors";
import type {
  ResolvedSlackToken,
  SlackUser,
  SlackUsersInfoWebApiClient,
  SlackWebApiClient,
} from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "users.search";
const USAGE_HINT =
  "Usage: slack users search <query(required,non-empty)> [--cursor=<cursor>] [--limit=<n>] [--json]";
const USER_ID_PATTERN = /^[UW][A-Z0-9]{2,}$/;

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsersSearchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient & SlackUsersInfoWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsersSearchHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const hasEdgeTokenPrefix = (token: string): boolean => {
  return token.startsWith("xoxc") || token.startsWith("xoxd");
};

const isCliErrorResult = (value: unknown): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const toUserLine = (user: SlackUser): string => {
  const displayName = user.displayName ?? user.realName;
  const identity =
    displayName === undefined ? `@${user.username}` : `${displayName} (@${user.username})`;
  const tags: string[] = [];

  if (user.isAdmin) {
    tags.push("admin");
  }
  if (user.isBot) {
    tags.push("bot");
  }
  if (user.isDeleted) {
    tags.push("deactivated");
  }

  const suffix = tags.length === 0 ? "" : ` [${tags.join(", ")}]`;
  return `- ${identity} (${user.id})${suffix}`;
};

const toDirectSearchResult = (query: string, users: SlackUser[]): CliResult => {
  const lines = [`Found ${users.length} users (filtered by: ${query}).`, ""];
  for (const user of users) {
    lines.push(toUserLine(user));
  }

  return {
    ok: true,
    command: COMMAND_ID,
    message: `Listed ${users.length} users (query: ${query})`,
    data: {
      users,
      count: users.length,
    },
    textLines: lines,
  };
};

const mapSlackErrorToCliResult = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected users.search failure",
      "Try again with --json for structured output.",
      COMMAND_ID,
    );
  }

  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

export const createUsersSearchHandler = (depsOverrides: Partial<UsersSearchHandlerDeps> = {}) => {
  const deps: UsersSearchHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const cursorOrError = parseCursorOption(request.options, "users search");
    if (isCliErrorResult(cursorOrError)) {
      return cursorOrError;
    }

    const limitOrError = parseLimitOption(request.options, "users search");
    if (isCliErrorResult(limitOrError)) {
      return limitOrError;
    }

    const query = request.positionals.join(" ").trim();
    if (query.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "users search requires a non-empty query. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      if (hasEdgeTokenPrefix(resolvedToken.token)) {
        return createError(
          "INVALID_ARGUMENT",
          "users search does not support edge API tokens (xoxc/xoxd).",
          "Use SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN. Edge API token path is not yet supported for users search.",
          COMMAND_ID,
        );
      }

      if (USER_ID_PATTERN.test(query)) {
        const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
        const result = await client.getUsersByIds([query]);
        return toDirectSearchResult(query, result.users);
      }

      const usersListHandler = createUsersListHandler({
        commandId: COMMAND_ID,
        commandLabel: "users search",
        createClient: () =>
          deps.createClient({
            token: resolvedToken.token,
            env: deps.env,
          }),
      });

      return await usersListHandler(request);
    } catch (error) {
      return mapSlackErrorToCliResult(error);
    }
  };
};

export const usersSearchHandler = createUsersSearchHandler();
