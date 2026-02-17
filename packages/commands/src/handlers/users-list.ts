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
      const lines: string[] = [`Found ${result.users.length} users.`, ""];

      for (const user of result.users) {
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
        message: `Listed ${result.users.length} users`,
        data: {
          users: result.users,
          count: result.users.length,
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
