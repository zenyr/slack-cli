import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import type { SlackClientError, SlackUsergroupsUpdateWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.update";
const USAGE_HINT = "Usage: slack usergroups update <usergroup-id> <name> <handle> [--json]";

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

type UsergroupsUpdateHandlerDeps = {
  createClient: () => SlackUsergroupsUpdateWebApiClient;
};

const defaultDeps: UsergroupsUpdateHandlerDeps = {
  createClient: createSlackWebApiClient,
};

export const createUsergroupsUpdateHandler = (
  depsOverrides: Partial<UsergroupsUpdateHandlerDeps> = {},
) => {
  const deps: UsergroupsUpdateHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawId = request.positionals[0];
    if (rawId === undefined || rawId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update requires <usergroup-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawName = request.positionals[1];
    if (rawName === undefined || rawName.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update requires <name>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawHandle = request.positionals[2];
    if (rawHandle === undefined || rawHandle.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update requires <handle>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (request.positionals.length > 3) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update accepts exactly 3 positional arguments.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const id = rawId.trim();
    const name = rawName.trim();
    const handle = rawHandle.trim();

    try {
      const client = deps.createClient();
      const result = await client.updateUsergroup({ id, name, handle });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Updated user group @${result.usergroup.handle}.`,
        data: {
          usergroup: result.usergroup,
        },
        textLines: [
          `Updated user group ${result.usergroup.id}.`,
          `- @${result.usergroup.handle} ${result.usergroup.name}`,
        ],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.update failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsUpdateHandler = createUsergroupsUpdateHandler();
