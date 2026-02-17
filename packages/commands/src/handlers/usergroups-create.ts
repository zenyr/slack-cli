import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import type { SlackClientError, SlackUsergroupsWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.create";
const USAGE_HINT = "Usage: slack usergroups create <name> <handle> [--json]";

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

type UsergroupsCreateHandlerDeps = {
  createClient: () => SlackUsergroupsWebApiClient;
};

const defaultUsergroupsCreateDeps: UsergroupsCreateHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsergroupsCreateHandler = (
  depsOverrides: Partial<UsergroupsCreateHandlerDeps> = {},
) => {
  const deps: UsergroupsCreateHandlerDeps = {
    ...defaultUsergroupsCreateDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawName = request.positionals[0];
    if (rawName === undefined || rawName.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups create requires <name>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawHandle = request.positionals[1];
    if (rawHandle === undefined || rawHandle.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups create requires <handle>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (request.positionals.length > 2) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups create accepts exactly 2 positional arguments: <name> <handle>.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const name = rawName.trim();
    const handle = rawHandle.trim();

    try {
      const client = deps.createClient();
      const usergroup = await client.createUsergroup({ name, handle });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Created user group @${usergroup.handle}.`,
        data: {
          usergroup,
        },
        textLines: [`Created user group @${usergroup.handle} (${usergroup.id}) ${usergroup.name}.`],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.create failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsCreateHandler = createUsergroupsCreateHandler();
