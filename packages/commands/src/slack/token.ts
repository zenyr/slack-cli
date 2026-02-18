import { createAuthService } from "@zenyr/slack-cli-auth";

import type { ResolvedSlackToken, SlackClientErrorCode } from "./types";
import { createSlackClientError, isRecord, readString } from "./utils";

const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";

const readNonEmptyEnv = (
  env: Record<string, string | undefined>,
  key: string,
): string | undefined => {
  const value = env[key];
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const ensureTokenPrefix = (token: string, envKey: string, expectedPrefix: string): void => {
  if (token.startsWith(expectedPrefix)) {
    return;
  }

  throw createSlackClientError({
    code: "SLACK_CONFIG_ERROR",
    message: `${envKey} must start with ${expectedPrefix}.`,
    hint: `Set ${envKey} to a token that starts with ${expectedPrefix}.`,
  });
};

const mapAuthErrorCode = (code: string): SlackClientErrorCode => {
  if (code === "AUTH_STORE_ERROR") {
    return "SLACK_CONFIG_ERROR";
  }

  if (code === "AUTH_NETWORK_ERROR" || code === "AUTH_HTTP_ERROR") {
    return "SLACK_HTTP_ERROR";
  }

  if (code === "AUTH_RESPONSE_ERROR") {
    return "SLACK_RESPONSE_ERROR";
  }

  if (code === "AUTH_SLACK_API_ERROR") {
    return "SLACK_API_ERROR";
  }

  if (code === "AUTH_SLACK_AUTH_ERROR") {
    return "SLACK_AUTH_ERROR";
  }

  return "SLACK_CONFIG_ERROR";
};

type AuthLayerError = {
  code: string;
  message: string;
  hint?: string;
  status?: number;
  details?: string;
};

const isAuthError = (value: unknown): value is AuthLayerError => {
  if (!isRecord(value)) {
    return false;
  }

  const code = readString(value, "code");
  return code?.startsWith("AUTH_") === true;
};

export const resolveSlackToken = async (
  env: Record<string, string | undefined> = process.env,
): Promise<ResolvedSlackToken> => {
  const service = createAuthService({ env });

  try {
    const resolved = await service.resolveToken();
    return {
      token: resolved.token,
      source: resolved.source,
      tokenType: resolved.type,
    };
  } catch (error) {
    if (!isAuthError(error)) {
      throw error;
    }

    const details = readString(error, "details");
    throw createSlackClientError({
      code: mapAuthErrorCode(error.code),
      message: `Slack token resolution failed: ${error.message}`,
      hint: error.hint,
      details,
      status: error.status,
    });
  }
};

export const resolveSlackTokenFromEnv = (
  env: Record<string, string | undefined> = process.env,
): ResolvedSlackToken => {
  const userToken = readNonEmptyEnv(env, XOXP_ENV_KEY);
  if (userToken !== undefined) {
    ensureTokenPrefix(userToken, XOXP_ENV_KEY, "xoxp");
    return {
      token: userToken,
      source: XOXP_ENV_KEY,
      tokenType: "xoxp",
    };
  }

  const botToken = readNonEmptyEnv(env, XOXB_ENV_KEY);
  if (botToken !== undefined) {
    ensureTokenPrefix(botToken, XOXB_ENV_KEY, "xoxb");
    return {
      token: botToken,
      source: XOXB_ENV_KEY,
      tokenType: "xoxb",
    };
  }

  throw createSlackClientError({
    code: "SLACK_CONFIG_ERROR",
    message: "Slack token is not configured.",
    hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
  });
};
