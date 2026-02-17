import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import type {
  SlackClientError,
  SlackUserGroup,
  SlackUsergroupsMeWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.me.list";
const USAGE_HINT = "Usage: slack usergroups me list [--json]";

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

const toGroupLine = (group: SlackUserGroup): string => {
  const description = group.description === undefined ? "" : ` - ${group.description}`;
  return `- @${group.handle} (${group.id}) ${group.name}${description}`;
};

type UsergroupsMeListHandlerDeps = {
  createClient: () => SlackUsergroupsMeWebApiClient;
};

const defaultDeps: UsergroupsMeListHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsergroupsMeHandler = (
  depsOverrides: Partial<UsergroupsMeListHandlerDeps> = {},
) => {
  const deps: UsergroupsMeListHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    if (request.positionals.length > 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups me list does not accept positional arguments.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    try {
      const client = deps.createClient();
      const userId = await client.getCurrentUserId();
      const usergroupsResult = await client.listUsergroups();
      const groupUsers = await Promise.all(
        usergroupsResult.usergroups.map(async (group) => {
          const usersResult = await client.listUsergroupUsers({ usergroupId: group.id });
          return {
            group,
            hasCurrentUser: usersResult.userIds.includes(userId),
          };
        }),
      );

      const matchedUsergroups = groupUsers
        .filter((item) => item.hasCurrentUser)
        .map((item) => item.group);

      const textLines: string[] = [
        `Found ${matchedUsergroups.length} user groups for ${userId}.`,
        "",
      ];
      for (const group of matchedUsergroups) {
        textLines.push(toGroupLine(group));
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Listed ${matchedUsergroups.length} user groups for ${userId}`,
        data: {
          userId,
          usergroups: matchedUsergroups,
          count: matchedUsergroups.length,
        },
        textLines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.me.list failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsMeHandler = createUsergroupsMeHandler();
