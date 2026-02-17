import type { AuthTokenType, LoginInput } from "@zenyr/slack-cli-auth";

import { type AuthLayer, getAuthLayer } from "../auth/layer";
import { createError } from "../errors";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const AUTH_CHECK_COMMAND = "auth.check";
const AUTH_WHOAMI_COMMAND = "auth.whoami";
const AUTH_LOGIN_COMMAND = "auth.login";
const AUTH_LOGOUT_COMMAND = "auth.logout";
const AUTH_USE_COMMAND = "auth.use";

type AuthHandlerDeps = {
  getAuthLayer: () => Promise<AuthLayer>;
  readTokenFromStdin: () => Promise<string | undefined>;
};

type AuthErrorShape = {
  code?: string;
  message?: string;
  hint?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

const toAuthErrorShape = (value: unknown): AuthErrorShape => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    code: readString(value, "code"),
    message: readString(value, "message"),
    hint: readString(value, "hint"),
  };
};

const isAuthTokenType = (value: string): value is AuthTokenType => {
  return value === "xoxp" || value === "xoxb";
};

const trimToken = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const readTokenFromStdin = async (): Promise<string | undefined> => {
  if (Bun.stdin === undefined || process.stdin.isTTY) {
    return undefined;
  }

  try {
    return trimToken(await Bun.stdin.text());
  } catch {
    throw new Error("Unable to read token from stdin.");
  }
};

const defaultDeps: AuthHandlerDeps = {
  getAuthLayer,
  readTokenFromStdin,
};

const mapAuthErrorToCliResult = (error: unknown, command: string): CliResult => {
  const authError = toAuthErrorShape(error);
  const message = authError.message ?? "Auth command failed due to unexpected runtime error.";

  switch (authError.code) {
    case "AUTH_CONFIG_ERROR":
    case "AUTH_SLACK_AUTH_ERROR":
      return createError("INVALID_ARGUMENT", message, authError.hint, command);
    case "AUTH_STORE_ERROR":
    case "AUTH_NETWORK_ERROR":
    case "AUTH_HTTP_ERROR":
    case "AUTH_RESPONSE_ERROR":
    case "AUTH_SLACK_API_ERROR":
      return createError("INTERNAL_ERROR", message, authError.hint, command);
    default:
      return createError(
        "INTERNAL_ERROR",
        message,
        authError.hint ?? "Retry with --json and inspect logs.",
        command,
      );
  }
};

const requireNoPositionals = (request: CommandRequest, command: string): CliResult | undefined => {
  if (request.positionals.length === 0) {
    return undefined;
  }

  return createError(
    "INVALID_ARGUMENT",
    `${command.replace(".", " ")} does not accept positional arguments.`,
    undefined,
    command,
  );
};

const readStringOption = (options: CliOptions, key: string): string | undefined => {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
};

const validateLoginInput = async (
  request: CommandRequest,
  readTokenFromStdinFn: () => Promise<string | undefined>,
): Promise<LoginInput | CliResult> => {
  if (request.positionals.length > 0) {
    return createError(
      "INVALID_ARGUMENT",
      "auth login does not accept positional arguments.",
      "Use auth login --type <xoxp|xoxb> --token <token>.",
      AUTH_LOGIN_COMMAND,
    );
  }

  const tokenType = readStringOption(request.options, "type");
  if (tokenType === undefined || !isAuthTokenType(tokenType)) {
    return createError(
      "INVALID_ARGUMENT",
      "auth login requires --type <xoxp|xoxb>.",
      undefined,
      AUTH_LOGIN_COMMAND,
    );
  }

  const token = trimToken(readStringOption(request.options, "token"));
  if (token !== undefined) {
    return {
      type: tokenType,
      token,
    };
  }

  let stdinToken: string | undefined;
  try {
    stdinToken = trimToken(await readTokenFromStdinFn());
  } catch {
    return createError(
      "INVALID_ARGUMENT",
      "Unable to read token from stdin.",
      "Use --token <token> or pipe token via stdin, for example: printf '<token>' | slack auth login --type <xoxp|xoxb>.",
      AUTH_LOGIN_COMMAND,
    );
  }
  if (stdinToken !== undefined) {
    return {
      type: tokenType,
      token: stdinToken,
    };
  }

  return createError(
    "INVALID_ARGUMENT",
    "auth login requires --token <token>.",
    "Use --token <token> or pipe token via stdin, for example: printf '<token>' | slack auth login --type <xoxp|xoxb>.",
    AUTH_LOGIN_COMMAND,
  );
};

const validateUseTarget = (request: CommandRequest): AuthTokenType | CliResult => {
  if (request.positionals.length !== 1) {
    return createError(
      "INVALID_ARGUMENT",
      "auth use requires exactly one target: <xoxp|xoxb>.",
      undefined,
      AUTH_USE_COMMAND,
    );
  }

  const target = request.positionals[0];
  if (target === undefined || !isAuthTokenType(target)) {
    return createError(
      "INVALID_ARGUMENT",
      "auth use target must be one of: xoxp, xoxb.",
      undefined,
      AUTH_USE_COMMAND,
    );
  }

  return target;
};

export const createAuthCheckHandler = (depsOverrides: Partial<AuthHandlerDeps> = {}) => {
  const deps: AuthHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const positionalError = requireNoPositionals(request, AUTH_CHECK_COMMAND);
    if (positionalError !== undefined) {
      return positionalError;
    }

    try {
      const auth = await deps.getAuthLayer();
      const data = await auth.check();

      return {
        ok: true,
        command: AUTH_CHECK_COMMAND,
        message: "Auth check succeeded",
        data,
        textLines: ["Auth check succeeded."],
      };
    } catch (error) {
      return mapAuthErrorToCliResult(error, AUTH_CHECK_COMMAND);
    }
  };
};

export const createAuthWhoamiHandler = (depsOverrides: Partial<AuthHandlerDeps> = {}) => {
  const deps: AuthHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const positionalError = requireNoPositionals(request, AUTH_WHOAMI_COMMAND);
    if (positionalError !== undefined) {
      return positionalError;
    }

    try {
      const auth = await deps.getAuthLayer();
      const data = await auth.whoami();

      return {
        ok: true,
        command: AUTH_WHOAMI_COMMAND,
        message: "Auth whoami succeeded",
        data,
        textLines: ["Authenticated identity loaded."],
      };
    } catch (error) {
      return mapAuthErrorToCliResult(error, AUTH_WHOAMI_COMMAND);
    }
  };
};

export const createAuthLoginHandler = (depsOverrides: Partial<AuthHandlerDeps> = {}) => {
  const deps: AuthHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const loginInput = await validateLoginInput(request, deps.readTokenFromStdin);
    if (!("type" in loginInput)) {
      return loginInput;
    }

    try {
      const auth = await deps.getAuthLayer();
      const data = await auth.login(loginInput);

      return {
        ok: true,
        command: AUTH_LOGIN_COMMAND,
        message: "Auth login succeeded",
        data,
        textLines: [`Token stored. Active token type: ${loginInput.type}.`],
      };
    } catch (error) {
      return mapAuthErrorToCliResult(error, AUTH_LOGIN_COMMAND);
    }
  };
};

export const createAuthLogoutHandler = (depsOverrides: Partial<AuthHandlerDeps> = {}) => {
  const deps: AuthHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const positionalError = requireNoPositionals(request, AUTH_LOGOUT_COMMAND);
    if (positionalError !== undefined) {
      return positionalError;
    }

    try {
      const auth = await deps.getAuthLayer();
      await auth.logout();

      return {
        ok: true,
        command: AUTH_LOGOUT_COMMAND,
        message: "Auth logout succeeded",
        textLines: ["Auth session cleared."],
      };
    } catch (error) {
      return mapAuthErrorToCliResult(error, AUTH_LOGOUT_COMMAND);
    }
  };
};

export const createAuthUseHandler = (depsOverrides: Partial<AuthHandlerDeps> = {}) => {
  const deps: AuthHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const target = validateUseTarget(request);
    if (target !== "xoxp" && target !== "xoxb") {
      return target;
    }

    try {
      const auth = await deps.getAuthLayer();
      await auth.use(target);

      return {
        ok: true,
        command: AUTH_USE_COMMAND,
        message: "Auth use succeeded",
        data: {
          active: target,
        },
        textLines: [`Active token type set to ${target}.`],
      };
    } catch (error) {
      return mapAuthErrorToCliResult(error, AUTH_USE_COMMAND);
    }
  };
};

export const authCheckHandler = createAuthCheckHandler();
export const authWhoamiHandler = createAuthWhoamiHandler();
export const authLoginHandler = createAuthLoginHandler();
export const authLogoutHandler = createAuthLogoutHandler();
export const authUseHandler = createAuthUseHandler();
