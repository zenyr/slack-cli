import { createError } from "../errors";
import type { SlackClientError, SlackUser, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError } from "../slack";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const commandLabel = (path: string[]): string => {
  return path.join(".");
};

const readStringOption = (options: CliOptions, key: string): string | undefined => {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
};

const isCliErrorResult = (value: unknown): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const parseCursorOption = (
  options: CliOptions,
  command: string,
): string | undefined | CliResult => {
  const value = options.cursor;
  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      "users list --cursor requires a value. [MISSING_ARGUMENT]",
      "Pass --cursor=<cursor>.",
      command,
    );
  }

  const raw = readStringOption(options, "cursor");
  if (raw === undefined) {
    return createError(
      "INVALID_ARGUMENT",
      "users list --cursor requires a value. [MISSING_ARGUMENT]",
      "Pass --cursor=<cursor>.",
      command,
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "users list --cursor value cannot be empty. [MISSING_ARGUMENT]",
      "Pass --cursor=<cursor>.",
      command,
    );
  }

  return trimmed;
};

const parseLimitOption = (options: CliOptions, command: string): number | undefined | CliResult => {
  const value = options.limit;
  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return createError(
      "INVALID_ARGUMENT",
      "users list --limit requires a value. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      command,
    );
  }

  const raw = readStringOption(options, "limit");
  if (raw === undefined) {
    return createError(
      "INVALID_ARGUMENT",
      "users list --limit requires a value. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      command,
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "users list --limit value cannot be empty. [MISSING_ARGUMENT]",
      "Provide an integer: --limit=<n>.",
      command,
    );
  }

  if (!/^[1-9]\d*$/.test(trimmed)) {
    return createError(
      "INVALID_ARGUMENT",
      `users list --limit must be a positive integer. Received: ${trimmed}`,
      "Use --limit with a positive integer, e.g. --limit=25.",
      command,
    );
  }

  return Number.parseInt(trimmed, 10);
};

const mapSlackErrorToCliResult = (error: SlackClientError, command: string): CliResult => {
  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, command);
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, command);
  }
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

const compileUserFilterRegexp = (query: string): RegExp | string => {
  try {
    return new RegExp(query, "i");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return `Invalid query regex: ${errorMsg}`;
  }
};

const matchesUserFilter = (user: SlackUser, regexp: RegExp): boolean => {
  return (
    regexp.test(user.username) ||
    (user.realName !== undefined && regexp.test(user.realName)) ||
    (user.displayName !== undefined && regexp.test(user.displayName)) ||
    (user.email !== undefined && regexp.test(user.email))
  );
};

type UsersListHandlerDeps = {
  createClient: () => SlackWebApiClient;
};

const defaultUsersListDeps: UsersListHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsersListHandler = (depsOverrides: Partial<UsersListHandlerDeps> = {}) => {
  const deps: UsersListHandlerDeps = {
    ...defaultUsersListDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const command = commandLabel(request.commandPath);
    const cursorOrError = parseCursorOption(request.options, command);
    if (isCliErrorResult(cursorOrError)) {
      return cursorOrError;
    }

    const limitOrError = parseLimitOption(request.options, command);
    if (isCliErrorResult(limitOrError)) {
      return limitOrError;
    }

    try {
      const client = deps.createClient();
      const result = await client.listUsers({
        cursor: cursorOrError,
        limit: limitOrError,
      });

      const queryParts = request.positionals.join(" ").trim();
      let filteredUsers = result.users;
      let appliedQuery: string | undefined;

      if (queryParts.length > 0) {
        const regexOrError = compileUserFilterRegexp(queryParts);
        if (typeof regexOrError === "string") {
          return createError("INVALID_ARGUMENT", regexOrError, undefined, command);
        }

        appliedQuery = queryParts;
        filteredUsers = result.users.filter((user) => matchesUserFilter(user, regexOrError));
      }

      const lines: string[] = [];
      const headerMsg = appliedQuery
        ? `Found ${filteredUsers.length} users (filtered by: ${appliedQuery}).`
        : `Found ${filteredUsers.length} users.`;
      lines.push(headerMsg, "");

      for (const user of filteredUsers) {
        lines.push(toUserLine(user));
      }

      if (result.nextCursor !== undefined) {
        lines.push("");
        lines.push(`Next cursor available: ${result.nextCursor}`);
      }

      return {
        ok: true,
        command: "users.list",
        message: appliedQuery
          ? `Listed ${filteredUsers.length} users (query: ${appliedQuery})`
          : `Listed ${result.users.length} users`,
        data: {
          users: filteredUsers,
          count: filteredUsers.length,
          nextCursor: result.nextCursor,
        },
        textLines: lines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error, command);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected users.list failure",
        "Try again with --json for structured output.",
        command,
      );
    }
  };
};

export const usersListHandler = createUsersListHandler();
