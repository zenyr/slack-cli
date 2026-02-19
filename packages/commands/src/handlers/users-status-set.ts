import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackUserProfileWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "users.status.set";
const USAGE_HINT =
  "Usage: slack users status set <emoji> <text> [--expiration=<30m|1h|2h|4h|today|unix-ts>] [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsersStatusSetHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUserProfileWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
  nowSeconds: () => number;
};

const defaultDeps: UsersStatusSetHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
  nowSeconds: () => Math.floor(Date.now() / 1000),
};

const normalizeEmoji = (raw: string): string => {
  const trimmed = raw.trim();
  // Strip surrounding colons if present, e.g. :wave: -> wave
  if (trimmed.startsWith(":") && trimmed.endsWith(":") && trimmed.length > 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseExpiration = (
  raw: string | undefined,
  nowSeconds: () => number,
): { expiration: number } | { error: string } => {
  if (raw === undefined || raw.trim().length === 0) {
    return { expiration: 0 };
  }

  const trimmed = raw.trim();

  if (trimmed === "30m") {
    return { expiration: nowSeconds() + 30 * 60 };
  }
  if (trimmed === "1h") {
    return { expiration: nowSeconds() + 60 * 60 };
  }
  if (trimmed === "2h") {
    return { expiration: nowSeconds() + 2 * 60 * 60 };
  }
  if (trimmed === "4h") {
    return { expiration: nowSeconds() + 4 * 60 * 60 };
  }
  if (trimmed === "today") {
    const now = new Date();
    const endOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59),
    );
    return { expiration: Math.floor(endOfDay.getTime() / 1000) };
  }

  const parsed = Number(trimmed);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
    return { expiration: Math.floor(parsed) };
  }

  return {
    error: `Invalid --expiration value: "${trimmed}". Use 30m, 1h, 2h, 4h, today, or a unix timestamp.`,
  };
};

const formatExpiration = (expiration: number): string => {
  if (expiration === 0) {
    return "no expiration";
  }
  return new Date(expiration * 1000).toISOString();
};

export const createUsersStatusSetHandler = (
  depsOverrides: Partial<UsersStatusSetHandlerDeps> = {},
) => {
  const deps: UsersStatusSetHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawEmoji = request.positionals[0];
    if (rawEmoji === undefined || rawEmoji.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "users status set requires <emoji>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawText = request.positionals[1];
    if (rawText === undefined || rawText.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "users status set requires <text>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const emoji = normalizeEmoji(rawEmoji);
    const text = rawText.trim();

    const rawExpiration =
      typeof request.options.expiration === "string" ? request.options.expiration : undefined;
    const expirationResult = parseExpiration(rawExpiration, deps.nowSeconds);
    if ("error" in expirationResult) {
      return createError("INVALID_ARGUMENT", expirationResult.error, USAGE_HINT, COMMAND_ID);
    }
    const { expiration } = expirationResult;

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));

      if (!resolvedToken.token.startsWith("xoxp")) {
        return createError(
          "INVALID_ARGUMENT",
          "users status set requires a user token (xoxp). Bot tokens (xoxb) are not supported. [TOKEN_TYPE_ERROR]",
          "Set SLACK_MCP_XOXP_TOKEN with a valid xoxp token.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      await client.setUserProfile({ emoji: `:${emoji}:`, text, expiration });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Status updated: :${emoji}: ${text} (expires: ${formatExpiration(expiration)})`,
        data: {
          emoji: `:${emoji}:`,
          text,
          expiration,
        },
        textLines: [
          `Status updated: :${emoji}: ${text} (expires: ${formatExpiration(expiration)})`,
        ],
      };
    } catch (error) {
      if (!isSlackClientError(error)) {
        return createError(
          "INTERNAL_ERROR",
          "Unexpected runtime failure for users.status.set.",
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

export const usersStatusSetHandler = createUsersStatusSetHandler();
