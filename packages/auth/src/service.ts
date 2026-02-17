import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { createAuthError, isRecord, readBoolean, readString } from "./errors";
import type {
  AuthIdentity,
  AuthService,
  AuthServiceOptions,
  AuthTokenType,
  LoginInput,
  ResolvedAuthToken,
} from "./types";

const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
const AUTH_FILE_ENV_KEY = "SLACK_CLI_AUTH_FILE";
const AUTH_TEST_URL = "https://slack.com/api/auth.test";

type StoreShape = {
  active?: AuthTokenType;
  tokens: {
    xoxp?: string;
    xoxb?: string;
  };
};

type TokenResolutionContext = {
  env: Record<string, string | undefined>;
  store: StoreShape;
};

type TokenResolutionStrategy = (context: TokenResolutionContext) => ResolvedAuthToken | undefined;

const readTrimmed = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const isAuthTokenType = (value: string): value is AuthTokenType => {
  return value === "xoxp" || value === "xoxb";
};

const ensureAuthFilePath = (options: AuthServiceOptions): string => {
  if (options.authFilePath !== undefined && options.authFilePath.trim().length > 0) {
    return options.authFilePath.trim();
  }

  const env = options.env ?? process.env;
  const envPath = readTrimmed(env[AUTH_FILE_ENV_KEY]);

  if (envPath !== undefined) {
    return envPath;
  }

  const homeDir = readTrimmed(options.homeDir ?? env.HOME);
  if (homeDir === undefined) {
    throw createAuthError({
      code: "AUTH_CONFIG_ERROR",
      message: "Auth store path is not configured.",
      hint: "Set HOME or SLACK_CLI_AUTH_FILE.",
    });
  }

  return `${homeDir}/.config/slack-cli/auth.json`;
};

const parseStore = (raw: unknown): StoreShape => {
  if (!isRecord(raw)) {
    return { tokens: {} };
  }

  const activeValue = readString(raw, "active");
  const active = activeValue === "xoxp" || activeValue === "xoxb" ? activeValue : undefined;
  const tokensRecord = raw.tokens;

  if (!isRecord(tokensRecord)) {
    return {
      active,
      tokens: {},
    };
  }

  return {
    active,
    tokens: {
      xoxp: readTrimmed(readString(tokensRecord, "xoxp")),
      xoxb: readTrimmed(readString(tokensRecord, "xoxb")),
    },
  };
};

const readStore = async (authFilePath: string): Promise<StoreShape> => {
  const file = Bun.file(authFilePath);
  if (!(await file.exists())) {
    return { tokens: {} };
  }

  let text = "";
  try {
    text = await file.text();
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown file read error";
    throw createAuthError({
      code: "AUTH_STORE_ERROR",
      message: "Failed to read auth store.",
      hint: "Check file permissions for auth store path.",
      details,
    });
  }

  if (text.trim().length === 0) {
    return { tokens: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Invalid JSON";
    throw createAuthError({
      code: "AUTH_STORE_ERROR",
      message: "Auth store JSON is invalid.",
      hint: "Delete or fix auth store file content.",
      details,
    });
  }

  return parseStore(parsed);
};

const writeStore = async (authFilePath: string, store: StoreShape): Promise<void> => {
  const payload = {
    active: store.active,
    tokens: {
      xoxp: store.tokens.xoxp,
      xoxb: store.tokens.xoxb,
    },
  };

  try {
    await mkdir(dirname(authFilePath), { recursive: true });
    await Bun.write(authFilePath, `${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown file write error";
    throw createAuthError({
      code: "AUTH_STORE_ERROR",
      message: "Failed to write auth store.",
      hint: "Check file permissions and parent directory existence.",
      details,
    });
  }
};

const resolveFromXoxpEnv: TokenResolutionStrategy = (context) => {
  const token = readTrimmed(context.env[XOXP_ENV_KEY]);
  if (token === undefined) {
    return undefined;
  }

  return {
    token,
    type: "xoxp",
    source: `env:${XOXP_ENV_KEY}`,
  };
};

const resolveFromXoxbEnv: TokenResolutionStrategy = (context) => {
  const token = readTrimmed(context.env[XOXB_ENV_KEY]);
  if (token === undefined) {
    return undefined;
  }

  return {
    token,
    type: "xoxb",
    source: `env:${XOXB_ENV_KEY}`,
  };
};

const resolveFromStoreActive: TokenResolutionStrategy = (context) => {
  if (context.store.active === undefined) {
    return undefined;
  }

  const token = context.store.tokens[context.store.active];
  if (token === undefined) {
    return undefined;
  }

  return {
    token,
    type: context.store.active,
    source: "store:active",
  };
};

const resolveFromStoreFallback: TokenResolutionStrategy = (context) => {
  const xoxpToken = context.store.tokens.xoxp;
  if (xoxpToken !== undefined) {
    return {
      token: xoxpToken,
      type: "xoxp",
      source: "store:fallback",
    };
  }

  const xoxbToken = context.store.tokens.xoxb;
  if (xoxbToken === undefined) {
    return undefined;
  }

  return {
    token: xoxbToken,
    type: "xoxb",
    source: "store:fallback",
  };
};

const resolutionStrategies: TokenResolutionStrategy[] = [
  resolveFromXoxpEnv,
  resolveFromXoxbEnv,
  resolveFromStoreActive,
  resolveFromStoreFallback,
];

const mapAuthTestResponse = (payload: unknown, tokenType: AuthTokenType): AuthIdentity => {
  if (!isRecord(payload)) {
    throw createAuthError({
      code: "AUTH_RESPONSE_ERROR",
      message: "Slack auth.test response has invalid shape.",
      hint: "Check Slack API compatibility and token scope.",
    });
  }

  const ok = readBoolean(payload, "ok");
  if (ok !== true) {
    const slackError = readString(payload, "error") ?? "unknown_error";

    if (
      slackError === "invalid_auth" ||
      slackError === "not_authed" ||
      slackError === "account_inactive" ||
      slackError === "token_revoked"
    ) {
      throw createAuthError({
        code: "AUTH_SLACK_AUTH_ERROR",
        message: "Slack token is invalid or inactive.",
        hint: "Run login with a valid token and required scopes.",
        details: slackError,
      });
    }

    throw createAuthError({
      code: "AUTH_SLACK_API_ERROR",
      message: "Slack auth.test returned an API error.",
      hint: "Retry later or inspect Slack API status.",
      details: slackError,
    });
  }

  const userId = readString(payload, "user_id");
  const userName = readString(payload, "user");
  const teamId = readString(payload, "team_id");
  const teamName = readString(payload, "team");

  if (
    userId === undefined ||
    userName === undefined ||
    teamId === undefined ||
    teamName === undefined
  ) {
    throw createAuthError({
      code: "AUTH_RESPONSE_ERROR",
      message: "Slack auth.test is missing required identity fields.",
      hint: "Check token permissions and workspace availability.",
    });
  }

  return {
    userId,
    userName,
    teamId,
    teamName,
    teamUrl: readString(payload, "url"),
    botId: readString(payload, "bot_id"),
    isEnterpriseInstall: readBoolean(payload, "is_enterprise_install"),
    tokenType,
  };
};

const runAuthTest = async (
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  resolvedToken: ResolvedAuthToken,
): Promise<AuthIdentity> => {
  let response: Response;
  try {
    response = await fetchImpl(AUTH_TEST_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${resolvedToken.token}`,
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown network failure";
    throw createAuthError({
      code: "AUTH_NETWORK_ERROR",
      message: "Slack auth.test request failed.",
      hint: "Check network connectivity and retry.",
      details,
    });
  }

  if (!response.ok) {
    throw createAuthError({
      code: "AUTH_HTTP_ERROR",
      message: "Slack auth.test returned a non-success HTTP status.",
      hint: "Check Slack API availability and token validity.",
      status: response.status,
      details: response.statusText,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const details = error instanceof Error ? error.message : "Invalid JSON response";
    throw createAuthError({
      code: "AUTH_RESPONSE_ERROR",
      message: "Slack auth.test returned non-JSON payload.",
      hint: "Check upstream API gateway and retry.",
      details,
    });
  }

  return mapAuthTestResponse(payload, resolvedToken.type);
};

export const createAuthService = (options: AuthServiceOptions = {}): AuthService => {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const authFilePath = ensureAuthFilePath(options);

  const resolveToken = async (): Promise<ResolvedAuthToken> => {
    const store = await readStore(authFilePath);
    const context = { env, store };

    for (const strategy of resolutionStrategies) {
      const resolved = strategy(context);
      if (resolved !== undefined) {
        return resolved;
      }
    }

    throw createAuthError({
      code: "AUTH_CONFIG_ERROR",
      message: "Slack token is not configured.",
      hint: "Set env token or run login to store token.",
    });
  };

  const login = async (input: LoginInput): Promise<ResolvedAuthToken> => {
    if (!isAuthTokenType(input.type)) {
      throw createAuthError({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token type is invalid.",
        hint: "Use token type xoxp or xoxb.",
      });
    }

    const token = readTrimmed(input.token);
    if (token === undefined) {
      throw createAuthError({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token must not be empty.",
        hint: "Provide xoxp or xoxb token string.",
      });
    }

    const store = await readStore(authFilePath);
    const nextStore: StoreShape = {
      active: input.type,
      tokens: {
        xoxp: store.tokens.xoxp,
        xoxb: store.tokens.xoxb,
      },
    };

    if (input.type === "xoxp") {
      nextStore.tokens.xoxp = token;
    } else {
      nextStore.tokens.xoxb = token;
    }

    await writeStore(authFilePath, nextStore);

    return {
      token,
      type: input.type,
      source: "store:active",
    };
  };

  const logout = async (): Promise<void> => {
    await writeStore(authFilePath, { tokens: {} });
  };

  const useTokenType = async (type: AuthTokenType): Promise<void> => {
    const store = await readStore(authFilePath);
    const token = store.tokens[type];
    if (token === undefined) {
      throw createAuthError({
        code: "AUTH_CONFIG_ERROR",
        message: `No stored ${type} token found.`,
        hint: `Run login with ${type} token first.`,
      });
    }

    await writeStore(authFilePath, {
      active: type,
      tokens: {
        xoxp: store.tokens.xoxp,
        xoxb: store.tokens.xoxb,
      },
    });
  };

  const check = async (): Promise<AuthIdentity> => {
    const resolvedToken = await resolveToken();
    return runAuthTest(fetchImpl, resolvedToken);
  };

  const whoami = async (): Promise<AuthIdentity> => {
    return check();
  };

  return {
    resolveToken,
    login,
    logout,
    useTokenType,
    check,
    whoami,
  };
};
