import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackAuthWebApiClient,
  SlackUserProfileWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "users.status.get";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsersStatusGetHandlerDeps = {
  createClient: (
    options?: CreateClientOptions,
  ) => SlackUserProfileWebApiClient & SlackAuthWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsersStatusGetHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const formatExpiration = (expiration: number): string => {
  if (expiration === 0) {
    return "never";
  }
  return new Date(expiration * 1000).toISOString();
};

export const createUsersStatusGetHandler = (
  depsOverrides: Partial<UsersStatusGetHandlerDeps> = {},
) => {
  const deps: UsersStatusGetHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawUserId = request.positionals[0];
    const userId = rawUserId !== undefined ? rawUserId.trim() : undefined;

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });

      let targetUserId: string;
      if (userId === undefined || userId.length === 0) {
        targetUserId = await client.getCurrentUserId();
      } else {
        targetUserId = userId;
      }

      const result = await client.getUserProfile(targetUserId);
      const { status } = result.profile;
      const hasStatus = status.emoji.length > 0 || status.text.length > 0;

      const textLines: string[] = [`Status for (${targetUserId}):`];
      if (hasStatus) {
        textLines.push(`${status.emoji} ${status.text}`.trim());
        textLines.push(`Expires: ${formatExpiration(status.expiration)}`);
      } else {
        textLines.push("No status set.");
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: hasStatus
          ? `Status for ${targetUserId}: ${status.emoji} ${status.text}`
          : `No status set for ${targetUserId}.`,
        data: {
          userId: targetUserId,
          profile: result.profile,
        },
        textLines,
      };
    } catch (error) {
      if (!isSlackClientError(error)) {
        return createError(
          "INTERNAL_ERROR",
          "Unexpected runtime failure for users.status.get.",
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

export const usersStatusGetHandler = createUsersStatusGetHandler();
