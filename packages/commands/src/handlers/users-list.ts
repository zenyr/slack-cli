import { createError } from "../errors";
import type { SlackClientError, SlackUser, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const commandLabel = (path: string[]): string => {
  return path.join(".");
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

    try {
      const client = deps.createClient();
      const result = await client.listUsers();

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
        // TODO(commands-owner): Add cursor/page flags for users list and remove when handlers support explicit pagination controls.
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
