import { describe, expect, test } from "bun:test";

import type { AuthLayer } from "../auth/layer";
import {
  createAuthCheckHandler,
  createAuthLoginHandler,
  createAuthUseHandler,
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

const createMockLayer = (): AuthLayer => {
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
