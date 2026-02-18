import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsMeJoinHandler } from "../handlers/usergroups-me-join";
import { createSlackClientError } from "../slack";
import type {
  SlackAuthWebApiClient,
  SlackUsergroupsUpdateWebApiClient,
  SlackUsergroupsUsersListWebApiClient,
} from "../slack/types";

const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";

const originalFetch = globalThis.fetch;
const originalXoxpToken = process.env[XOXP_ENV_KEY];
const originalXoxbToken = process.env[XOXB_ENV_KEY];

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalXoxpToken === undefined) {
    delete process.env[XOXP_ENV_KEY];
  } else {
    process.env[XOXP_ENV_KEY] = originalXoxpToken;
  }

  if (originalXoxbToken === undefined) {
    delete process.env[XOXB_ENV_KEY];
  } else {
    process.env[XOXB_ENV_KEY] = originalXoxbToken;
  }
});

type SlackUsergroupsMeJoinWebApiClient = SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  Pick<SlackUsergroupsUpdateWebApiClient, "updateUsergroupUsers">;

const createMockClient = (
  overrides: Partial<SlackUsergroupsMeJoinWebApiClient> = {},
): SlackUsergroupsMeJoinWebApiClient => {
  return {
    getCurrentUserId: async () => "U001",
    listUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U100"] }),
    updateUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U100", "U001"] }),
    ...overrides,
  };
};

describe("usergroups me join command", () => {
  test("help metadata exposes usergroups me join args", async () => {
    const result = await runCliWithBuffer(["help", "usergroups", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    const lines = parsed.textLines.filter((line): line is string => typeof line === "string");
    const joinLine = lines.find((line) => line.includes("me join <usergroup-id> [--json]"));
    expect(joinLine).toBeDefined();
  });

  test("joins current user and updates membership", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        const parsedUrl = new URL(requestUrl);

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        if (parsedUrl.pathname.includes("/auth.test")) {
          return new Response(JSON.stringify({ ok: true, user_id: "U001" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (parsedUrl.pathname.includes("/usergroups.users.list")) {
          expect(parsedUrl.searchParams.get("usergroup")).toBe("S001");
          return new Response(JSON.stringify({ ok: true, users: ["U100"] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (parsedUrl.pathname.includes("/usergroups.users.update")) {
          expect(init?.method).toBe("POST");

          const postHeaders = new Headers(init?.headers);
          expect(postHeaders.get("Content-Type")).toContain("application/x-www-form-urlencoded");

          const params = new URLSearchParams(String(init?.body));
          expect(params.get("usergroup")).toBe("S001");
          expect(params.get("users")).toBe("U100,U001");

          return new Response(JSON.stringify({ ok: true, users: "U100,U001" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: false, error: "unknown_method" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockFetch;

    const result = await runCliWithBuffer(["usergroups", "me", "join", "S001", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("usergroups.me.join");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.usergroupId).toBe("S001");
    expect(parsed.data.userId).toBe("U001");
    expect(parsed.data.changed).toBe(true);
    expect(parsed.data.count).toBe(2);
    expect(parsed.data.users).toEqual(["U100", "U001"]);
  });

  test("already-member returns success no-op", async () => {
    let updateCalled = false;
    const handler = createUsergroupsMeJoinHandler({
      createClient: () =>
        createMockClient({
          listUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U001", "U100"] }),
          updateUsergroupUsers: async () => {
            updateCalled = true;
            return { usergroupId: "S001", userIds: ["U001", "U100"] };
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "join"],
      positionals: ["S001"],
      options: {},
      flags: {
        json: true,
        help: false,
        version: false,
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(true);
    expect(updateCalled).toBe(false);

    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("usergroups.me.join");
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.changed).toBe(false);
    expect(result.data.count).toBe(2);
    expect(result.textLines).toEqual([
      "Result: no-op (already a member)",
      "User group: S001",
      "User: U001",
      "Users (2): U001, U100",
    ]);
  });

  test("join success returns deterministic non-json text lines", async () => {
    const handler = createUsergroupsMeJoinHandler({
      createClient: () =>
        createMockClient({
          listUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U100"] }),
          updateUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U100", "U001"] }),
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "join"],
      positionals: ["S001"],
      options: {},
      flags: {
        json: false,
        help: false,
        version: false,
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.textLines).toEqual([
      "Result: joined",
      "User group: S001",
      "User: U001",
      "Users (2): U100, U001",
    ]);
  });

  test("returns invalid argument with usage hint when usergroup id is missing", async () => {
    const result = await runCliWithBuffer(["usergroups", "me", "join", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("MISSING_ARGUMENT");
    expect(parsed.error.hint).toBe("Usage: slack usergroups me join <usergroup-id> [--json]");
  });

  test("returns invalid argument when extra positional arguments are provided", async () => {
    const handler = createUsergroupsMeJoinHandler({
      createClient: () => createMockClient(),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "join"],
      positionals: ["S001", "extra"],
      options: {},
      flags: {
        json: true,
        help: false,
        version: false,
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("accepts only one <usergroup-id>");
  });

  const deterministicSlackErrorCases: Array<{
    title: string;
    clientErrorArgs: Parameters<typeof createSlackClientError>[0];
    expectedCliCode: "INVALID_ARGUMENT" | "INTERNAL_ERROR";
    expectedHint: string;
    expectedDetail: string;
  }> = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_CONFIG_ERROR",
        message: "Slack token is not configured.",
        hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
        details: "config-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      expectedDetail: "config-detail-must-not-appear",
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_AUTH_ERROR",
        message: "Slack authentication failed: invalid_auth.",
        hint: "Use valid Slack token.",
        details: "auth-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Use valid Slack token.",
      expectedDetail: "auth-detail-must-not-appear",
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT without marker and detail suffix",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Slack API request failed: permission_denied.",
        hint: "Confirm current user can join this user group.",
        details: "api-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Confirm current user can join this user group.",
      expectedDetail: "api-detail-must-not-appear",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Slack HTTP transport failed with status 503.",
        hint: "Check network path and retry usergroups me join.",
        details: "http-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Check network path and retry usergroups me join.",
      expectedDetail: "http-detail-must-not-appear",
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack response payload missing users list.",
        hint: "Capture raw response and validate schema assumptions.",
        details: "response-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Capture raw response and validate schema assumptions.",
      expectedDetail: "response-detail-must-not-appear",
    },
  ];

  deterministicSlackErrorCases.forEach(
    ({ title, clientErrorArgs, expectedCliCode, expectedHint, expectedDetail }) => {
      test(title, async () => {
        const handler = createUsergroupsMeJoinHandler({
          createClient: () =>
            createMockClient({
              getCurrentUserId: async () => {
                throw createSlackClientError(clientErrorArgs);
              },
            }),
        });

        const result = await handler({
          commandPath: ["usergroups", "me", "join"],
          positionals: ["S001"],
          options: {},
          flags: {
            json: true,
            help: false,
            version: false,
          },
          context: {
            version: "1.2.3",
          },
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
          return;
        }

        expect(result.error.code).toBe(expectedCliCode);
        expect(result.error.message).toBe(clientErrorArgs.message);
        expect(result.error.hint).toBe(expectedHint);
        expect(result.error.message).not.toContain("[AUTH_ERROR]");
        expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
        expect(result.error.message).not.toContain(expectedDetail);
      });
    },
  );
});
