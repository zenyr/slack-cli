import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackUserProfileWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "users.status.clear";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsersStatusClearHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUserProfileWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsersStatusClearHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

export const createUsersStatusClearHandler = (
  depsOverrides: Partial<UsersStatusClearHandlerDeps> = {},
) => {
  const deps: UsersStatusClearHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (_request: CommandRequest): Promise<CliResult> => {
    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));

      if (!resolvedToken.token.startsWith("xoxp")) {
        return createError(
          "INVALID_ARGUMENT",
          "users status clear requires a user token (xoxp). Bot tokens (xoxb) are not supported. [TOKEN_TYPE_ERROR]",
          "Set SLACK_MCP_XOXP_TOKEN with a valid xoxp token.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      await client.setUserProfile({ emoji: "", text: "", expiration: 0 });

      return {
        ok: true,
        command: COMMAND_ID,
        message: "Status cleared.",
        data: {},
        textLines: ["Status cleared."],
      };
    } catch (error) {
      if (!isSlackClientError(error)) {
        return createError(
          "INTERNAL_ERROR",
          "Unexpected runtime failure for users.status.clear.",
          "Retry with --json for structured output.",
          COMMAND_ID,
        );
      }

      switch (error.code) {
        case "SLACK_CONFIG_ERROR":
          return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
        case "SLACK_AUTH_ERROR":
          return createError(
            "INVALID_ARGUMENT",
            `${error.message} [AUTH_ERROR]`,
            error.hint,
            COMMAND_ID,
          );
        case "SLACK_API_ERROR": {
          const reason =
            error.details === undefined ? error.message : `${error.message} ${error.details}`;
          return createError(
            "INVALID_ARGUMENT",
            `${reason} [SLACK_API_ERROR]`,
            error.hint,
            COMMAND_ID,
          );
        }
        case "SLACK_HTTP_ERROR":
        case "SLACK_RESPONSE_ERROR":
          return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
      }
    }
  };
};

export const usersStatusClearHandler = createUsersStatusClearHandler();
