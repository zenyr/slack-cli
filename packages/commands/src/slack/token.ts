import { createAuthService } from "@zenyr/slack-cli-auth";

import type { ResolvedSlackToken, SlackClientErrorCode } from "./types";
import { createSlackClientError, isRecord, readString } from "./utils";

const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
const XOXC_ENV_KEY = "SLACK_MCP_XOXC_TOKEN";
const XOXD_ENV_KEY = "SLACK_MCP_XOXD_TOKEN";

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

// Resolve the alternate token type directly from env or store without mutating active type.
const resolveAlternateToken = async (
  alternateType: "xoxp" | "xoxb",
  env: Record<string, string | undefined>,
): Promise<ResolvedSlackToken | undefined> => {
  const envKey = alternateType === "xoxp" ? XOXP_ENV_KEY : XOXB_ENV_KEY;
  const envSource = alternateType === "xoxp" ? "SLACK_MCP_XOXP_TOKEN" : "SLACK_MCP_XOXB_TOKEN";
  const envToken = readNonEmptyEnv(env, envKey);
  if (envToken !== undefined) {
    return { token: envToken, source: envSource, tokenType: alternateType };
  }
  return undefined;
};

const isRetryableTokenError = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }
  const code = readString(error, "code");
  return code === "SLACK_AUTH_ERROR" || code === "SLACK_API_ERROR";
};

// Throws SLACK_CONFIG_ERROR if the token uses an unsupported edge prefix (xoxc/xoxd).
export const assertNoEdgeToken = (token: string, commandId: string): void => {
  if (token.startsWith("xoxc") || token.startsWith("xoxd")) {
    throw createSlackClientError({
      code: "SLACK_CONFIG_ERROR",
      message: `${commandId} does not support edge API tokens (xoxc/xoxd).`,
      hint: "Use SLACK_MCP_XOXP_TOKEN with a user token (xoxp). Edge API token path is not yet supported.",
    });
  }
};

// Try fn with the resolved token. On auth/scope failure, retry once with the
// alternate token type (xoxp <-> xoxb). Store is never mutated; no restore needed.
export const withTokenFallback = async <T>(
  preferredType: "xoxp" | "xoxb",
  env: Record<string, string | undefined>,
  fn: (token: ResolvedSlackToken) => Promise<T>,
  resolveToken: (
    env: Record<string, string | undefined>,
  ) => Promise<ResolvedSlackToken> | ResolvedSlackToken = resolveSlackToken,
): Promise<T> => {
  const primaryToken = await resolveToken(env);

  try {
    return await fn(primaryToken);
  } catch (primaryError) {
    if (!isRetryableTokenError(primaryError)) {
      throw primaryError;
    }

    // Primary failed with auth/scope error — try alternate type if different
    const alternateType = preferredType === "xoxp" ? "xoxb" : "xoxp";
    if (primaryToken.tokenType === alternateType) {
      throw primaryError;
    }

    const alternateToken = await resolveAlternateToken(alternateType, env);
    if (alternateToken === undefined) {
      throw primaryError;
    }

    // Retry with alternate token; throw alternate error if also fails
    return await fn(alternateToken);
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

  const hasUnsupportedEdgeToken =
    readNonEmptyEnv(env, XOXC_ENV_KEY) !== undefined ||
    readNonEmptyEnv(env, XOXD_ENV_KEY) !== undefined;
  if (hasUnsupportedEdgeToken) {
    throw createSlackClientError({
      code: "SLACK_CONFIG_ERROR",
      message: "Slack edge tokens are unsupported in this environment.",
      hint: `Unset ${XOXC_ENV_KEY}/${XOXD_ENV_KEY} and set ${XOXP_ENV_KEY} or ${XOXB_ENV_KEY}.`,
    });
  }

  throw createSlackClientError({
    code: "SLACK_CONFIG_ERROR",
    message: "Slack token is not configured.",
    hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
  });
};
