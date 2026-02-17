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

const createAuthError = (code: string, message: string): Error & { code: string } => {
  const error = new Error(message);

  return Object.assign(error, { code });
};

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
  });
});
