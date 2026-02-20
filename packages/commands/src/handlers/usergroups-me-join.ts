import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackAuthWebApiClient,
  SlackClientError,
  SlackUsergroupsUpdateWebApiClient,
  SlackUsergroupsUsersListWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.me.join";
const USAGE_HINT = "Usage: slack usergroups me join <usergroup-id(required,non-empty)> [--json]";

const buildUsersTextLine = (userIds: string[]): string => {
  if (userIds.length === 0) {
    return "Users (0): (none)";
  }

  return `Users (${userIds.length}): ${userIds.join(", ")}`;
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

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type SlackUsergroupsMeJoinWebApiClient = SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  Pick<SlackUsergroupsUpdateWebApiClient, "updateUsergroupUsers">;

type UsergroupsMeJoinHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUsergroupsMeJoinWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsergroupsMeJoinHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

export const createUsergroupsMeJoinHandler = (
  depsOverrides: Partial<UsergroupsMeJoinHandlerDeps> = {},
) => {
  const deps: UsergroupsMeJoinHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawUsergroupId = request.positionals[0];
    if (rawUsergroupId === undefined || rawUsergroupId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups me join requires <usergroup-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (request.positionals.length > 1) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups me join accepts only one <usergroup-id> positional argument.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const usergroupId = rawUsergroupId.trim();

    try {
      const resolvedToken = await resolveTokenForContext(request.context, deps.env, deps.resolveToken);
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const userId = await client.getCurrentUserId();
      const usersResult = await client.listUsergroupUsers({ usergroupId });

      if (usersResult.userIds.includes(userId)) {
        return {
          ok: true,
          command: COMMAND_ID,
          message: `User ${userId} is already in user group ${usergroupId}.`,
          data: {
            usergroupId,
            userId,
            users: usersResult.userIds,
            count: usersResult.userIds.length,
            changed: false,
          },
          textLines: [
            "Result: no-op (already a member)",
            `User group: ${usergroupId}`,
            `User: ${userId}`,
            buildUsersTextLine(usersResult.userIds),
          ],
        };
      }

      const nextUserIds = [...usersResult.userIds, userId];
      const updateResult = await client.updateUsergroupUsers({ usergroupId, userIds: nextUserIds });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Joined user group ${updateResult.usergroupId} as ${userId}.`,
        data: {
          usergroupId: updateResult.usergroupId,
          userId,
          users: updateResult.userIds,
          count: updateResult.userIds.length,
          changed: true,
        },
        textLines: [
          "Result: joined",
          `User group: ${updateResult.usergroupId}`,
          `User: ${userId}`,
          buildUsersTextLine(updateResult.userIds),
        ],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.me.join failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsMeJoinHandler = createUsergroupsMeJoinHandler();
