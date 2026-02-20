import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsUsersUpdateHandler } from "../handlers/usergroups-users-update";
import { createSlackClientError } from "../slack";
import type { SlackUsergroupsUpdateWebApiClient } from "../slack/types";

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

const createMockClient = (
  overrides: Partial<SlackUsergroupsUpdateWebApiClient> = {},
): SlackUsergroupsUpdateWebApiClient => {
  return {
    updateUsergroup: async () => ({
      usergroup: {
        id: "S001",
        handle: "eng-core",
        name: "Engineering Core",
      },
    }),
    updateUsergroupUsers: async () => ({
      usergroupId: "S001",
      userIds: ["U001", "U002"],
    }),
    ...overrides,
  };
};

describe("usergroups users update command", () => {
  test("help metadata exposes usergroups users update args", async () => {
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
    const updateLine = lines.find((line) =>
      line.includes("users update <usergroup-id(required,non-empty)> <user-id(required,non-empty)> [user-id ...] --yes [--json]"),
    );
    expect(updateLine).toBeDefined();
  });

  test("replaces usergroup members and returns updated users for --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/usergroups.users.update");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");
        expect(headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("usergroup")).toBe("S001");
        expect(params.get("users")).toBe("U001,U002");

        return new Response(
          JSON.stringify({
            ok: true,
            users: "U001,U002",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockFetch;

    const result = await runCliWithBuffer([
      "usergroups",
      "users",
      "update",
      "S001",
      "U001",
      "U002",
      "--yes",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("usergroups.users.update");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.usergroupId).toBe("S001");
    expect(parsed.data.count).toBe(2);
    expect(Array.isArray(parsed.data.users)).toBe(true);
    if (!Array.isArray(parsed.data.users)) {
      return;
    }

    expect(parsed.data.users).toEqual(["U001", "U002"]);
  });

  test("returns invalid argument with usage hint when required args are missing", async () => {
    const result = await runCliWithBuffer(["usergroups", "users", "update", "--json"]);

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
    expect(parsed.error.hint).toBe(
      "Usage: slack usergroups users update <usergroup-id(required,non-empty)> <user-id(required,non-empty)> [user-id ...] --yes [--json]",
    );
  });

  test("requires --yes for destructive member replacement", async () => {
    const result = await runCliWithBuffer([
      "usergroups",
      "users",
      "update",
      "S001",
      "U001",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("requires --yes confirmation");
  });

  test("returns deterministic destructive replacement preview for text output", async () => {
    const handler = createUsergroupsUsersUpdateHandler({
      createClient: () =>
        createMockClient({
          updateUsergroupUsers: async () => ({
            usergroupId: "S777",
            userIds: [
              "U001",
              "U002",
              "U003",
              "U004",
              "U005",
              "U006",
              "U007",
              "U008",
              "U009",
              "U010",
              "U011",
            ],
          }),
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "users", "update"],
      positionals: [
        "S777",
        "U001",
        "U002",
        "U003",
        "U004",
        "U005",
        "U006",
        "U007",
        "U008",
        "U009",
        "U010",
        "U011",
      ],
      options: { yes: true },
      flags: {
        json: false,
        help: false,
        version: false,
        xoxp: false,
        xoxb: false,
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.usergroupId).toBe("S777");
    expect(result.data.count).toBe(11);
    expect(result.message).toBe("Replaced user group S777 membership with 11 users.");
    expect(result.textLines).toEqual([
      "Replaced user group S777 membership.",
      "Total users after replacement: 11.",
      "Membership preview (10/11):",
      "- U001",
      "- U002",
      "- U003",
      "- U004",
      "- U005",
      "- U006",
      "- U007",
      "- U008",
      "- U009",
      "- U010",
      "- ... and 1 more",
    ]);
  });

  const deterministicSlackErrorCases: Array<{
    title: string;
    clientErrorArgs: Parameters<typeof createSlackClientError>[0];
    expectedCliCode: "INVALID_ARGUMENT" | "INTERNAL_ERROR";
  }> = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker/detail suffix",
      clientErrorArgs: {
        code: "SLACK_CONFIG_ERROR",
        message: "Invalid workspace configuration.",
        hint: "Check workspace setup.",
        details: "config-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT without marker/detail suffix",
      clientErrorArgs: {
        code: "SLACK_AUTH_ERROR",
        message: "Token expired or revoked.",
        hint: "Refresh your token with `slack auth login`.",
        details: "auth-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT without marker/detail suffix",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Invalid usergroup or users not found.",
        hint: "Verify usergroup ID and user IDs exist.",
        details: "api-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker/detail suffix",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Network connection failed.",
        hint: "Check internet connection and Slack API endpoint.",
        details: "http-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker/detail suffix",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Failed to parse Slack API response.",
        hint: "Slack API may be in maintenance mode.",
        details: "response-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
    },
  ];

  deterministicSlackErrorCases.forEach(({ title, clientErrorArgs, expectedCliCode }) => {
    test(title, async () => {
      const handler = createUsergroupsUsersUpdateHandler({
        createClient: () =>
          createMockClient({
            updateUsergroupUsers: async () => {
              throw createSlackClientError(clientErrorArgs);
            },
          }),
      });

      const result = await handler({
        commandPath: ["usergroups", "users", "update"],
        positionals: ["S001", "U001", "U002"],
        options: { yes: true },
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
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.command).toBe("usergroups.users.update");
      expect(result.error.code).toBe(expectedCliCode);
      expect(result.error.message).toBe(clientErrorArgs.message);
      expect(result.error.hint).toBe(clientErrorArgs.hint);
      expect(result.error.message).not.toContain("[AUTH_ERROR]");
      expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
      if (clientErrorArgs.details !== undefined) {
        expect(result.error.message).not.toContain(clientErrorArgs.details);
      }
    });
  });
});
