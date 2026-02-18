import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuthService } from "../service";

const createTempAuthFilePath = async (): Promise<{ rootDir: string; authFilePath: string }> => {
  const rootDir = await mkdtemp(join(tmpdir(), "slack-cli-auth-"));
  const authDir = join(rootDir, ".config", "slack-cli");
  await mkdir(authDir, { recursive: true });

  return {
    rootDir,
    authFilePath: join(authDir, "auth.json"),
  };
};

describe("auth service", () => {
  test("resolves env token with xoxp priority over xoxb", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      await Bun.write(
        authFilePath,
        JSON.stringify(
          {
            active: "xoxb",
            tokens: {
              xoxb: "xoxb-store-token",
            },
          },
          null,
          2,
        ),
      );

      const auth = createAuthService({
        env: {
          SLACK_MCP_XOXP_TOKEN: "xoxp-env-token",
          SLACK_MCP_XOXB_TOKEN: "xoxb-env-token",
        },
        authFilePath,
      });

      const resolved = await auth.resolveToken();
      expect(resolved).toEqual({
        token: "xoxp-env-token",
        type: "xoxp",
        source: "env:SLACK_MCP_XOXP_TOKEN",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("falls back to active store token when env tokens missing", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      await Bun.write(
        authFilePath,
        JSON.stringify(
          {
            active: "xoxb",
            tokens: {
              xoxp: "xoxp-store-token",
              xoxb: "xoxb-store-token",
            },
          },
          null,
          2,
        ),
      );

      const auth = createAuthService({ env: {}, authFilePath });
      const resolved = await auth.resolveToken();

      expect(resolved).toEqual({
        token: "xoxb-store-token",
        type: "xoxb",
        source: "store:active",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login saves token and resolve reads it", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      const loginResult = await auth.login({ type: "xoxb", token: "xoxb-login-token" });
      const resolved = await auth.resolveToken();

      expect(loginResult).toEqual({
        token: "xoxb-login-token",
        type: "xoxb",
        source: "store:active",
      });
      expect(resolved).toEqual({
        token: "xoxb-login-token",
        type: "xoxb",
        source: "store:active",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login trims home dir and creates parent directory", async () => {
    const { rootDir } = await createTempAuthFilePath();

    try {
      const homeDir = join(rootDir, "custom-home");
      const auth = createAuthService({
        env: {},
        homeDir: `  ${homeDir}  `,
      });

      await auth.login({ type: "xoxb", token: "xoxb-login-token" });

      const expectedAuthFilePath = join(homeDir, ".config", "slack-cli", "auth.json");
      expect(await Bun.file(expectedAuthFilePath).exists()).toBe(true);
      await expect(auth.resolveToken()).resolves.toEqual({
        token: "xoxb-login-token",
        type: "xoxb",
        source: "store:active",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login rejects xoxb token when declared type is xoxp", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await expect(auth.login({ type: "xoxp", token: "xoxb-login-token" })).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token prefix does not match declared token type.",
        hint: "Use matching token type and prefix (xoxp -> xoxp..., xoxb -> xoxb...).",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login rejects xoxp token when declared type is xoxb", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await expect(auth.login({ type: "xoxb", token: "xoxp-login-token" })).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token prefix does not match declared token type.",
        hint: "Use matching token type and prefix (xoxp -> xoxp..., xoxb -> xoxb...).",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login rejects xoxc token when declared type is xoxp", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await expect(auth.login({ type: "xoxp", token: "xoxc-login-token" })).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token prefix does not match declared token type.",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login rejects xoxd token when declared type is xoxb", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await expect(auth.login({ type: "xoxb", token: "xoxd-login-token" })).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token prefix does not match declared token type.",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("login rejects invalid runtime token type with typed error", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });
      const invalidInput = JSON.parse('{"type":"invalid","token":"x"}');

      await expect(auth.login(invalidInput)).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
        message: "Login token type is invalid.",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("logout clears stored auth", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await auth.login({ type: "xoxp", token: "xoxp-login-token" });
      await auth.logout();

      await expect(auth.resolveToken()).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("useTokenType switches active token", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await auth.login({ type: "xoxp", token: "xoxp-login-token" });
      await auth.login({ type: "xoxb", token: "xoxb-login-token" });
      await auth.useTokenType("xoxp");

      await expect(auth.resolveToken()).resolves.toEqual({
        token: "xoxp-login-token",
        type: "xoxp",
        source: "store:active",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("useTokenType returns typed config error when token missing", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({ env: {}, authFilePath });

      await expect(auth.useTokenType("xoxb")).rejects.toMatchObject({
        code: "AUTH_CONFIG_ERROR",
        message: "No stored xoxb token found.",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("whoami maps successful auth.test response", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({
        env: {},
        authFilePath,
        fetchImpl: async (_input, init) => {
          const headers = new Headers(init?.headers);
          expect(headers.get("Authorization")).toBe("Bearer xoxp-login-token");

          return new Response(
            JSON.stringify({
              ok: true,
              user_id: "U123",
              user: "alice",
              team_id: "T123",
              team: "Acme",
              url: "https://acme.slack.com/",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      });

      await auth.login({ type: "xoxp", token: "xoxp-login-token" });
      const identity = await auth.whoami();

      expect(identity).toEqual({
        userId: "U123",
        userName: "alice",
        teamId: "T123",
        teamName: "Acme",
        teamUrl: "https://acme.slack.com/",
        tokenType: "xoxp",
        botId: undefined,
        isEnterpriseInstall: undefined,
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("check maps auth.test invalid_auth to typed auth error", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({
        env: {},
        authFilePath,
        fetchImpl: async () => {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "invalid_auth",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      });

      await auth.login({ type: "xoxb", token: "xoxb-login-token" });

      await expect(auth.check()).rejects.toMatchObject({
        code: "AUTH_SLACK_AUTH_ERROR",
        message: "Slack token is invalid or inactive.",
        details: "invalid_auth",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("check maps non-auth Slack API errors to typed API error", async () => {
    const { rootDir, authFilePath } = await createTempAuthFilePath();

    try {
      const auth = createAuthService({
        env: {},
        authFilePath,
        fetchImpl: async () => {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "ratelimited",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      });

      await auth.login({ type: "xoxb", token: "xoxb-login-token" });

      await expect(auth.check()).rejects.toMatchObject({
        code: "AUTH_SLACK_API_ERROR",
        message: "Slack auth.test returned an API error.",
        details: "ratelimited",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
