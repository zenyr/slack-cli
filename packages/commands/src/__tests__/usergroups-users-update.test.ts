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
      line.includes("users update <usergroup-id> <user-id> [user-id ...] --yes [--json]"),
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
      "Usage: slack usergroups users update <usergroup-id> <user-id> [user-id ...] --yes [--json]",
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

  test("maps Slack auth errors to invalid argument", async () => {
    const handler = createUsergroupsUsersUpdateHandler({
      createClient: () =>
        createMockClient({
          updateUsergroupUsers: async () => {
            throw createSlackClientError({
              code: "SLACK_AUTH_ERROR",
              message: "Slack authentication failed: invalid_auth.",
              hint: "Use valid Slack token.",
            });
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "users", "update"],
      positionals: ["S001", "U001"],
      options: { yes: true },
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
    expect(result.error.message).toBe("Slack authentication failed: invalid_auth.");
  });
});
