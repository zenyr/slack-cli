import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import type { SlackClientError, SlackUserGroup, SlackUsergroupsWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.list";

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

type UsergroupsListHandlerDeps = {
  createClient: () => SlackUsergroupsWebApiClient;
};

const defaultUsergroupsListDeps: UsergroupsListHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsergroupsListHandler = (
  depsOverrides: Partial<UsergroupsListHandlerDeps> = {},
) => {
  const deps: UsergroupsListHandlerDeps = {
    ...defaultUsergroupsListDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    if (request.positionals.length > 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups list does not accept positional arguments.",
        "Use: slack usergroups list [--json]",
        COMMAND_ID,
      );
    }

    try {
      const client = deps.createClient();
      const result = await client.listUsergroups();

      const textLines: string[] = [`Found ${result.usergroups.length} user groups.`, ""];
      for (const group of result.usergroups) {
        textLines.push(toGroupLine(group));
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Listed ${result.usergroups.length} user groups`,
        data: {
          usergroups: result.usergroups,
          count: result.usergroups.length,
        },
        textLines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.list failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsListHandler = createUsergroupsListHandler();
