import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsersGetHandler } from "../handlers/users-get";
import { createSlackClientError } from "../slack";

describe("users get command", () => {
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

  test("returns INVALID_ARGUMENT when user ids are missing", async () => {
    const handler = createUsersGetHandler();

    const result = await handler({
      commandPath: ["users", "get"],
      positionals: [],
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
    expect(result.error.message).toContain("requires at least one <user-id>");
  });

  test("returns INVALID_ARGUMENT for malformed user id", async () => {
    const handler = createUsersGetHandler();

    const result = await handler({
      commandPath: ["users", "get"],
      positionals: ["alice"],
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
    expect(result.error.message).toContain("invalid user id");
  });

  test("parses comma-separated ids and de-duplicates before lookup", async () => {
    const requestedIds: string[] = [];
    const handler = createUsersGetHandler({
      createClient: () => ({
        getUsersByIds: async (userIds: string[]) => {
          requestedIds.push(...userIds);
          return {
            users: [],
            missingUserIds: userIds,
          };
        },
      }),
    });

    const result = await handler({
      commandPath: ["users", "get"],
      positionals: ["U001,U001", "W002"],
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
    expect(requestedIds).toEqual(["U001", "W002"]);
  });

  test("maps Slack API errors to INVALID_ARGUMENT", async () => {
    const handler = createUsersGetHandler({
      createClient: () => ({
        getUsersByIds: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: missing_scope.",
            hint: "Confirm users:read scope.",
          });
        },
      }),
    });

    const result = await handler({
      commandPath: ["users", "get"],
      positionals: ["U001"],
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
    expect(result.error.message).toContain("missing_scope");
  });

  test("runs users.info per id and returns missing ids in output", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const requestedUsers: string[] = [];
    const mockedFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      const parsedUrl = new URL(requestUrl);
      expect(parsedUrl.pathname).toContain("/users.info");
      const requestedUser = parsedUrl.searchParams.get("user") ?? "";
      requestedUsers.push(requestedUser);

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

      if (requestedUser === "U001") {
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: "U001",
              name: "alice",
              deleted: false,
              is_bot: false,
              is_admin: true,
              profile: {
                display_name: "Alice",
                real_name: "Alice Kim",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ ok: false, error: "user_not_found" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    globalThis.fetch = mockedFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "get", "U001", "U404", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);
    expect(requestedUsers).toEqual(["U001", "U404"]);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("users.get");
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.foundCount).toBe(1);
    expect(Array.isArray(parsed.data.missingUserIds)).toBe(true);
    if (Array.isArray(parsed.data.missingUserIds)) {
      expect(parsed.data.missingUserIds).toEqual(["U404"]);
    }
  });
});
