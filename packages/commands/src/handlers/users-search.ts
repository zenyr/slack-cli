import { createUsersListHandler } from "./users-list";
import { createError } from "../errors";
import type { ResolvedSlackToken, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "users.search";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsersSearchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsersSearchHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const hasEdgeTokenPrefix = (token: string): boolean => {
  return token.startsWith("xoxc") || token.startsWith("xoxd");
};

const mapSlackErrorToCliResult = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected users.search failure",
      "Try again with --json for structured output.",
      COMMAND_ID,
    );
  }

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

export const createUsersSearchHandler = (depsOverrides: Partial<UsersSearchHandlerDeps> = {}) => {
  const deps: UsersSearchHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      if (hasEdgeTokenPrefix(resolvedToken.token)) {
        return createError(
          "INVALID_ARGUMENT",
          "users search does not support edge API tokens (xoxc/xoxd).",
          "Use SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN. Edge API token path is not yet supported for users search.",
          COMMAND_ID,
        );
      }

      const usersListHandler = createUsersListHandler({
        commandId: COMMAND_ID,
        commandLabel: "users search",
        createClient: () =>
          deps.createClient({
            token: resolvedToken.token,
            env: deps.env,
          }),
      });

      return await usersListHandler(request);
    } catch (error) {
      return mapSlackErrorToCliResult(error);
    }
  };
};

export const usersSearchHandler = createUsersSearchHandler();
