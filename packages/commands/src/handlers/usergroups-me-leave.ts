import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import type {
  SlackAuthWebApiClient,
  SlackClientError,
  SlackUsergroupsUpdateWebApiClient,
  SlackUsergroupsUsersListWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.me.leave";
const USAGE_HINT = "Usage: slack usergroups me leave <usergroup-id> [--json]";

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

type SlackUsergroupsMeLeaveWebApiClient = SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  Pick<SlackUsergroupsUpdateWebApiClient, "updateUsergroupUsers">;

type UsergroupsMeLeaveHandlerDeps = {
  createClient: () => SlackUsergroupsMeLeaveWebApiClient;
};

const defaultDeps: UsergroupsMeLeaveHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsergroupsMeLeaveHandler = (
  depsOverrides: Partial<UsergroupsMeLeaveHandlerDeps> = {},
) => {
  const deps: UsergroupsMeLeaveHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawUsergroupId = request.positionals[0];
    if (rawUsergroupId === undefined || rawUsergroupId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups me leave requires <usergroup-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (request.positionals.length > 1) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups me leave accepts only one <usergroup-id> positional argument.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const usergroupId = rawUsergroupId.trim();

    try {
      const client = deps.createClient();
      const userId = await client.getCurrentUserId();
      const usersResult = await client.listUsergroupUsers({ usergroupId });

      if (!usersResult.userIds.includes(userId)) {
        return {
          ok: true,
          command: COMMAND_ID,
          message: `User ${userId} is not in user group ${usergroupId}.`,
          data: {
            usergroupId,
            userId,
            users: usersResult.userIds,
            count: usersResult.userIds.length,
            changed: false,
          },
          textLines: [
            `No change. User ${userId} is not in user group ${usergroupId}.`,
            `Users (${usersResult.userIds.length}): ${usersResult.userIds.join(", ")}`,
          ],
        };
      }

      const nextUserIds = usersResult.userIds.filter((existingUserId) => existingUserId !== userId);
      const updateResult = await client.updateUsergroupUsers({ usergroupId, userIds: nextUserIds });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Left user group ${updateResult.usergroupId} as ${userId}.`,
        data: {
          usergroupId: updateResult.usergroupId,
          userId,
          users: updateResult.userIds,
          count: updateResult.userIds.length,
          changed: true,
        },
        textLines: [
          `Left user group ${updateResult.usergroupId} as ${userId}.`,
          `Users (${updateResult.userIds.length}): ${updateResult.userIds.join(", ")}`,
        ],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.me.leave failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsMeLeaveHandler = createUsergroupsMeLeaveHandler();
