import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import type { SlackClientError, SlackUsergroupsUpdateWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.users.update";
const USAGE_HINT =
  "Usage: slack usergroups users update <usergroup-id> <user-id> [user-id ...] --yes [--json]";
const MEMBERS_PREVIEW_LIMIT = 10;

const isTruthyOption = (value: string | boolean | undefined): boolean => {
  if (value === true) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "on"
  );
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

const createMembershipPreviewLines = (userIds: string[]): string[] => {
  const previewUserIds = userIds.slice(0, MEMBERS_PREVIEW_LIMIT);
  const hiddenCount = userIds.length - previewUserIds.length;

  const lines = [`Membership preview (${previewUserIds.length}/${userIds.length}):`];
  previewUserIds.forEach((userId) => {
    lines.push(`- ${userId}`);
  });

  if (hiddenCount > 0) {
    lines.push(`- ... and ${hiddenCount} more`);
  }

  return lines;
};

type UsergroupsUsersUpdateHandlerDeps = {
  createClient: () => SlackUsergroupsUpdateWebApiClient;
};

const defaultDeps: UsergroupsUsersUpdateHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsergroupsUsersUpdateHandler = (
  depsOverrides: Partial<UsergroupsUsersUpdateHandlerDeps> = {},
) => {
  const deps: UsergroupsUsersUpdateHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawUsergroupId = request.positionals[0];
    if (rawUsergroupId === undefined || rawUsergroupId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups users update requires <usergroup-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawUserIds = request.positionals.slice(1);
    if (rawUserIds.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups users update requires at least one <user-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const usergroupId = rawUsergroupId.trim();
    const userIds = rawUserIds.map((value) => value.trim()).filter((value) => value.length > 0);
    if (userIds.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups users update requires non-empty <user-id> values. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (isTruthyOption(request.options.yes) === false) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups users update is destructive and requires --yes confirmation.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    try {
      const client = deps.createClient();
      const result = await client.updateUsergroupUsers({ usergroupId, userIds });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Replaced user group ${result.usergroupId} membership with ${result.userIds.length} users.`,
        data: {
          usergroupId: result.usergroupId,
          users: result.userIds,
          count: result.userIds.length,
        },
        textLines: [
          `Replaced user group ${result.usergroupId} membership.`,
          `Total users after replacement: ${result.userIds.length}.`,
          ...createMembershipPreviewLines(result.userIds),
        ],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.users.update failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsUsersUpdateHandler = createUsergroupsUsersUpdateHandler();
