import { createError } from "../errors";
import type { SlackClientError, SlackUser, SlackUsersInfoWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "users.get";
const USAGE_HINT = "Usage: slack users get <user-id> [user-id ...] [--json]";
const USER_ID_PATTERN = /^[UW][A-Z0-9]+$/;
const MISSING_PREVIEW_LIMIT = 20;
const MAX_USER_IDS = 200;

type UsersGetHandlerDeps = {
  createClient: () => SlackUsersInfoWebApiClient;
};

const defaultDeps: UsersGetHandlerDeps = {
  createClient: createSlackWebApiClient,
};

const parseUserIds = (positionals: string[]): { userIds?: string[]; error?: CliResult } => {
  const parsedUserIds = positionals
    .flatMap((raw) => raw.split(","))
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0);

  if (parsedUserIds.length === 0) {
    return {
      error: createError(
        "INVALID_ARGUMENT",
        "users get requires at least one <user-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      ),
    };
  }

  const uniqueUserIds = Array.from(new Set(parsedUserIds));
  if (uniqueUserIds.length > MAX_USER_IDS) {
    return {
      error: createError(
        "INVALID_ARGUMENT",
        `users get accepts up to ${MAX_USER_IDS} unique user ids per request. Received: ${uniqueUserIds.length}`,
        "Split request into smaller batches (<= 200 IDs).",
        COMMAND_ID,
      ),
    };
  }

  const invalidUserId = uniqueUserIds.find((userId) => !USER_ID_PATTERN.test(userId));
  if (invalidUserId !== undefined) {
    return {
      error: createError(
        "INVALID_ARGUMENT",
        `users get received invalid user id: ${invalidUserId}`,
        "Use Slack user IDs like U12345678 or W12345678.",
        COMMAND_ID,
      ),
    };
  }

  return { userIds: uniqueUserIds };
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

const mapSlackErrorToCliResult = (error: SlackClientError): CliResult => {
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

const appendMissingUserLines = (lines: string[], missingUserIds: string[]): void => {
  if (missingUserIds.length === 0) {
    return;
  }

  lines.push("");
  lines.push(`Not found (${missingUserIds.length}):`);
  const preview = missingUserIds.slice(0, MISSING_PREVIEW_LIMIT);
  for (const userId of preview) {
    lines.push(`- ${userId}`);
  }

  const hiddenCount = missingUserIds.length - preview.length;
  if (hiddenCount > 0) {
    lines.push(`- ... and ${hiddenCount} more`);
  }
};

export const createUsersGetHandler = (depsOverrides: Partial<UsersGetHandlerDeps> = {}) => {
  const deps: UsersGetHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const parsed = parseUserIds(request.positionals);
    if (parsed.error !== undefined) {
      return parsed.error;
    }

    const userIds = parsed.userIds;
    if (userIds === undefined) {
      return createError(
        "INTERNAL_ERROR",
        "Unexpected users.get argument parsing failure.",
        "Retry with --json for structured output.",
        COMMAND_ID,
      );
    }

    try {
      const client = deps.createClient();
      const result = await client.getUsersByIds(userIds);

      const lines: string[] = [
        `Requested ${userIds.length} users, found ${result.users.length}.`,
        "",
      ];

      for (const user of result.users) {
        lines.push(toUserLine(user));
      }

      appendMissingUserLines(lines, result.missingUserIds);

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Fetched ${result.users.length}/${userIds.length} users.`,
        data: {
          requestedUserIds: userIds,
          users: result.users,
          foundCount: result.users.length,
          missingUserIds: result.missingUserIds,
        },
        textLines: lines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected users.get failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usersGetHandler = createUsersGetHandler();
