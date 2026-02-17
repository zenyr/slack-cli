import type { ResolvedSlackToken } from "./types";
import { createSlackClientError } from "./utils";

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

export const resolveSlackTokenFromEnv = (
  env: Record<string, string | undefined> = process.env,
): ResolvedSlackToken => {
  // TODO(commands-owner): Replace env-first token lookup with @zenyr/slack-cli-auth active-session token resolver once auth package exports stable resolver API.
  const userToken = readNonEmptyEnv(env, XOXP_ENV_KEY);
  if (userToken !== undefined) {
    return {
      token: userToken,
      source: XOXP_ENV_KEY,
    };
  }

  const botToken = readNonEmptyEnv(env, XOXB_ENV_KEY);
  if (botToken !== undefined) {
    return {
      token: botToken,
      source: XOXB_ENV_KEY,
    };
  }

  throw createSlackClientError({
    code: "SLACK_CONFIG_ERROR",
    message: "Slack token is not configured.",
    hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
  });
};
