import { describe, expect, test } from "bun:test";

import type { AuthLayer } from "../auth/layer";
import {
  createAuthCheckHandler,
  createAuthLoginHandler,
  createAuthUseHandler,
  createAuthWhoamiHandler,
} from "../handlers/auth";
import type { CommandRequest } from "../types";

const createRequest = (
  commandPath: string[],
  positionals: string[] = [],
  options: Record<string, string | boolean> = {},
): CommandRequest => {
  return {
    commandPath,
    positionals,
    options,
    flags: {
      json: true,
      help: false,
      version: false,
      xoxp: false,
      xoxb: false,
    },
    context: {
      version: "1.2.3",
    },
  };
};

const createMockLayer = (
  onLogin?: (input: { token: string; type: "xoxp" | "xoxb" }) => void,
): AuthLayer => {
  return {
    check: async () => {
      return {
        userId: "U123",
      };
    },
    whoami: async () => {
      return {
        userId: "U123",
      };
    },
    login: async (input) => {
      onLogin?.(input);
      return {
        token: input.token,
        type: input.type,
      };
    },
    logout: async () => {},
    use: async () => {},
  };
};

const createAuthError = (
  code: string,
  message: string,
  hint?: string,
): Error & { code: string; hint?: string } => {
  const error = new Error(message);

  return Object.assign(error, { code, hint });
};

const DEFAULT_AUTH_RUNTIME_MESSAGE = "Auth command failed due to unexpected runtime error.";

describe("auth handlers", () => {
  test("validates auth login required options", async () => {
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => createMockLayer(),
    });

    const result = await handler(createRequest(["auth", "login"], [], { token: "xoxp-123" }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("auth login requires --type <xoxp|xoxb>.");
  });

  test("reads auth token from stdin when --token is missing", async () => {
    let loginInput: { token: string; type: "xoxp" | "xoxb" } | undefined;
    const handler = createAuthLoginHandler({
      getAuthLayer: async () =>
        createMockLayer((input) => {
          loginInput = input;
        }),
      readTokenFromStdin: async () => "  xoxp-stdin-123  ",
    });

    const result = await handler(createRequest(["auth", "login"], [], { type: "xoxp" }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(loginInput).toEqual({
      type: "xoxp",
      token: "xoxp-stdin-123",
    });
    expect(result.data).toEqual({
      type: "xoxp",
      token: "xoxp-stdin-123",
    });
  });

  test("falls back to stdin when --token is blank", async () => {
    const handler = createAuthLoginHandler({
      getAuthLayer: async () =>
        createMockLayer((input) => {
          expect(input.token).toBe("xoxb-stdin-blank");
          expect(input.type).toBe("xoxb");
        }),
      readTokenFromStdin: async () => "  xoxb-stdin-blank  ",
    });

    const result = await handler(
      createRequest(["auth", "login"], [], { type: "xoxb", token: "   " }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
  });

  test("uses --token when provided, ignores stdin", async () => {
    let loginInput: { token: string; type: "xoxp" | "xoxb" } | undefined;
    const handler = createAuthLoginHandler({
      getAuthLayer: async () =>
        createMockLayer((input) => {
          loginInput = input;
        }),
      readTokenFromStdin: async () => "xoxp-stdin-ignored",
    });

    const result = await handler(
      createRequest(["auth", "login"], [], { type: "xoxp", token: "  xoxp-cli-flag  " }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(loginInput).toEqual({
      type: "xoxp",
      token: "xoxp-cli-flag",
    });
  });

  test("returns invalid argument if token is missing and no stdin token", async () => {
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => createMockLayer(),
      readTokenFromStdin: async () => undefined,
    });

    const result = await handler(createRequest(["auth", "login"], [], { type: "xoxb" }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("auth login requires --token <token>.");
    expect(result.error.hint).toContain("pipe");
  });

  test("returns invalid argument when stdin token is empty", async () => {
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => createMockLayer(),
      readTokenFromStdin: async () => "   ",
    });

    const result = await handler(createRequest(["auth", "login"], [], { type: "xoxb" }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("auth login requires --token <token>.");
    expect(result.error.hint).toContain("printf '<token>' | slack auth login");
  });

  test("returns invalid argument when stdin read fails", async () => {
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => createMockLayer(),
      readTokenFromStdin: async () => {
        throw new Error("stdin read failed");
      },
    });

    const result = await handler(createRequest(["auth", "login"], [], { type: "xoxp" }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("Unable to read token from stdin.");
    expect(result.error.hint).toBe(
      "Use --token <token> or pipe token via stdin, for example: printf '<token>' | slack auth login --type <xoxp|xoxb>.",
    );
  });

  test("maps auth login prefix mismatch config error to invalid argument with hint", async () => {
    const message = "Login token prefix does not match declared token type.";
    const hint = "Use matching token type and prefix (xoxp -> xoxp..., xoxb -> xoxb...).";
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          login: async () => {
            throw createAuthError("AUTH_CONFIG_ERROR", message, hint);
          },
        };
      },
    });

    const result = await handler(
      createRequest(["auth", "login"], [], { type: "xoxp", token: "xoxb-token-mismatch" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(message);
    expect(result.error.hint).toBe(hint);
  });

  test("maps auth login token type mismatch config error to invalid argument with hint", async () => {
    const message = "Login token type is invalid.";
    const hint = "Use token type xoxp or xoxb.";
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          login: async () => {
            throw createAuthError("AUTH_CONFIG_ERROR", message, hint);
          },
        };
      },
    });

    const result = await handler(
      createRequest(["auth", "login"], [], { type: "xoxb", token: "xoxb-valid-prefix" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(message);
    expect(result.error.hint).toBe(hint);
  });

  test("maps auth use config error to invalid argument and preserves message/hint", async () => {
    const message = "auth use target must be one of: xoxp, xoxb.";
    const hint = "Use exactly one target argument: xoxp or xoxb.";
    const handler = createAuthUseHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          use: async () => {
            throw createAuthError("AUTH_CONFIG_ERROR", message, hint);
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "use"], ["xoxp"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.use");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(message);
    expect(result.error.hint).toBe(hint);
  });

  test("maps auth login config error without message to deterministic defaults", async () => {
    const handler = createAuthLoginHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          login: async () => {
            throw {
              code: "AUTH_CONFIG_ERROR",
            };
          },
        };
      },
    });

    const result = await handler(
      createRequest(["auth", "login"], [], { type: "xoxp", token: "xoxp-token" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.login");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(DEFAULT_AUTH_RUNTIME_MESSAGE);
    expect(result.error.hint).toBeUndefined();
  });

  test("validates auth use target argument", async () => {
    const handler = createAuthUseHandler({
      getAuthLayer: async () => createMockLayer(),
    });

    const result = await handler(createRequest(["auth", "use"], []));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.use");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("auth use requires exactly one target: <xoxp|xoxb>.");
  });

  test("returns success for auth check with mocked layer", async () => {
    const handler = createAuthCheckHandler({
      getAuthLayer: async () => createMockLayer(),
    });

    const result = await handler(createRequest(["auth", "check"]));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("auth.check");
    expect(result.message).toBe("Auth check succeeded");
  });

  test("prints identity details for auth whoami", async () => {
    const handler = createAuthWhoamiHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          whoami: async () => {
            return {
              userName: "alice",
              teamName: "Acme",
              tokenType: "xoxp",
            };
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "whoami"]));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.textLines).toEqual(["You are alice on Acme.", "Token type: xoxp"]);
  });

  test("maps auth store failure to internal error", async () => {
    const handler = createAuthCheckHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          check: async () => {
            throw createAuthError("AUTH_STORE_ERROR", "Failed to read auth store.");
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "check"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.check");
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toBe("Failed to read auth store.");
    expect(result.error.hint).toBeUndefined();
  });

  test("maps auth whoami store error to internal error and preserves hint", async () => {
    const message = "Failed to read auth store.";
    const hint = "Re-run login to restore local auth state.";
    const handler = createAuthWhoamiHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          whoami: async () => {
            throw createAuthError("AUTH_STORE_ERROR", message, hint);
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "whoami"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.whoami");
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toBe(message);
    expect(result.error.hint).toBe(hint);
  });

  test("maps auth store error without message to deterministic defaults", async () => {
    const handler = createAuthCheckHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          check: async () => {
            throw {
              code: "AUTH_STORE_ERROR",
            };
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "check"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.check");
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toBe(DEFAULT_AUTH_RUNTIME_MESSAGE);
    expect(result.error.hint).toBeUndefined();
  });

  test("maps slack auth invalid token to invalid argument", async () => {
    const handler = createAuthCheckHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          check: async () => {
            throw createAuthError("AUTH_SLACK_AUTH_ERROR", "Slack token is invalid or inactive.");
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "check"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.check");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("Slack token is invalid or inactive.");
    expect(result.error.hint).toBeUndefined();
  });

  test("maps slack auth error to invalid argument and preserves hint", async () => {
    const message = "Slack token is invalid or inactive.";
    const hint = "Run slack auth login with a fresh token.";
    const handler = createAuthCheckHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          check: async () => {
            throw createAuthError("AUTH_SLACK_AUTH_ERROR", message, hint);
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "check"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.check");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(message);
    expect(result.error.hint).toBe(hint);
  });

  test("maps slack auth error without message to deterministic defaults", async () => {
    const handler = createAuthWhoamiHandler({
      getAuthLayer: async () => {
        return {
          ...createMockLayer(),
          whoami: async () => {
            throw {
              code: "AUTH_SLACK_AUTH_ERROR",
            };
          },
        };
      },
    });

    const result = await handler(createRequest(["auth", "whoami"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.command).toBe("auth.whoami");
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(DEFAULT_AUTH_RUNTIME_MESSAGE);
    expect(result.error.hint).toBeUndefined();
  });
});
