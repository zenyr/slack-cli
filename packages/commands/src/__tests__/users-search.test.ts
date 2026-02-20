import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsersSearchHandler } from "../handlers/users-search";
import { createSlackClientError } from "../slack";

describe("users search command", () => {
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

  test("routes to users.search command id and applies query filtering", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockedFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      expect(requestUrl).toContain("/users.list");
      expect(requestUrl).toContain("limit=200");

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

      return new Response(
        JSON.stringify({
          ok: true,
          members: [
            {
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
            {
              id: "U002",
              name: "bob",
              deleted: false,
              is_bot: false,
              is_admin: false,
              profile: {
                real_name: "Bob",
                email: "bob@company.com",
              },
            },
          ],
          response_metadata: {
            next_cursor: "",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    globalThis.fetch = mockedFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "search", "alice", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("users.search");

    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(1);

    const users = Array.isArray(parsed.data.users) ? parsed.data.users : [];
    expect(users.length).toBe(1);

    const firstUser = users[0];
    if (isRecord(firstUser)) {
      expect(firstUser.id).toBe("U001");
      expect(firstUser.username).toBe("alice");
    }

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (Array.isArray(parsed.textLines)) {
      expect(parsed.textLines[0]).toBe("Found 1 users (filtered by: alice).");
    }
  });

  test("auto-paginates in query mode without explicit cursor", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const cursors: Array<string | undefined> = [];
    const mockedFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      expect(requestUrl).toContain("/users.list");

      const parsedUrl = new URL(requestUrl);
      const cursor = parsedUrl.searchParams.get("cursor") ?? undefined;
      cursors.push(cursor);

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

      if (cursor === undefined) {
        return new Response(
          JSON.stringify({
            ok: true,
            members: [
              {
                id: "U001",
                name: "bob",
                deleted: false,
                is_bot: false,
                is_admin: false,
                profile: {
                  display_name: "Bob",
                  real_name: "Bob",
                },
              },
            ],
            response_metadata: {
              next_cursor: "cursor-2",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      expect(cursor).toBe("cursor-2");
      return new Response(
        JSON.stringify({
          ok: true,
          members: [
            {
              id: "U002",
              name: "alice",
              deleted: false,
              is_bot: false,
              is_admin: false,
              profile: {
                display_name: "Alice",
                real_name: "Alice",
              },
            },
          ],
          response_metadata: {
            next_cursor: "",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    globalThis.fetch = mockedFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "search", "alice", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);
    expect(cursors).toEqual([undefined, "cursor-2"]);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.command).toBe("users.search");
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(1);
    expect(parsed.data.nextCursor).toBeUndefined();
  });

  test("caps query auto-pagination with deterministic nextCursor", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const cursors: Array<string | undefined> = [];
    const mockedFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      expect(requestUrl).toContain("/users.list");

      const parsedUrl = new URL(requestUrl);
      const cursor = parsedUrl.searchParams.get("cursor") ?? undefined;
      cursors.push(cursor);

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

      const page = cursor === undefined ? 1 : Number(cursor.replace("cursor-", "")) + 1;
      return new Response(
        JSON.stringify({
          ok: true,
          members: [
            {
              id: `U00${page}`,
              name: `user-${page}`,
              deleted: false,
              is_bot: false,
              is_admin: false,
              profile: {
                display_name: `User ${page}`,
                real_name: `User ${page}`,
              },
            },
          ],
          response_metadata: {
            next_cursor: `cursor-${page}`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    globalThis.fetch = mockedFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "search", "no-match", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);
    expect(cursors).toEqual([undefined, "cursor-1", "cursor-2", "cursor-3", "cursor-4"]);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.command).toBe("users.search");
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(0);
    expect(parsed.data.nextCursor).toBe("cursor-5");
  });

  test("reports users search label when --cursor is missing value", async () => {
    const result = await runCliWithBuffer(["users", "search", "--cursor", "--json"]);

    expect(result.exitCode).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    if (parsed.ok !== false || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toBe("users search --cursor requires a value. [MISSING_ARGUMENT]");
    expect(parsed.error.hint).toBe("Pass --cursor=<cursor>.");
  });

  test("reports users search label when --limit is invalid", async () => {
    const result = await runCliWithBuffer(["users", "search", "--limit=0", "--json"]);

    expect(result.exitCode).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    if (parsed.ok !== false || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toBe(
      "users search --limit must be a positive integer. Received: 0",
    );
    expect(parsed.error.hint).toBe("Use --limit with a positive integer, e.g. --limit=25.");
  });

  const deterministicSlackErrorCases: Array<{
    title: string;
    clientErrorArgs: Parameters<typeof createSlackClientError>[0];
    expectedCliCode: "INVALID_ARGUMENT" | "INTERNAL_ERROR";
    expectedHint?: string;
    expectedDetail?: string;
  }> = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_CONFIG_ERROR",
        message: "Slack token is not configured.",
        hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_AUTH_ERROR",
        message: "Slack authentication failed.",
        hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint:
        "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT without marker and detail suffix",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Slack API request failed.",
        hint: "Pass a valid cursor from users search response.",
        details: "invalid_cursor",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Pass a valid cursor from users search response.",
      expectedDetail: "invalid_cursor",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Slack HTTP transport failed with status 503.",
        hint: "Check network path and retry.",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Check network path and retry.",
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack response payload missing users metadata.",
        hint: "Capture raw response and validate schema assumptions.",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Capture raw response and validate schema assumptions.",
    },
  ];

  deterministicSlackErrorCases.forEach(
    ({ title, clientErrorArgs, expectedCliCode, expectedHint, expectedDetail }) => {
      test(title, async () => {
        const handler = createUsersSearchHandler({
          env: {},
          resolveToken: () => ({
            token: "xoxp-test-token",
            source: "store:active",
          }),
          createClient: () => {
            throw createSlackClientError(clientErrorArgs);
          },
        });

        const result = await handler({
          commandPath: ["users", "search"],
          positionals: ["alice"],
          options: {},
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

        expect(result.error.code).toBe(expectedCliCode);
        expect(result.error.message).toBe(clientErrorArgs.message);
        expect(result.error.hint).toBe(expectedHint);
        expect(result.error.message).not.toContain("[AUTH_ERROR]");
        expect(result.error.message).not.toContain("[SLACK_API_ERROR]");

        if (expectedDetail !== undefined) {
          expect(result.error.message).not.toContain(expectedDetail);
        }
      });
    },
  );

  test("returns invalid argument for xoxc edge token before users API call", async () => {
    const handler = createUsersSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxc-edge-test",
        source: "store:active",
      }),
      createClient: () => {
        throw new Error("createClient should not be called for xoxc token");
      },
    });

    const result = await handler({
      commandPath: ["users", "search"],
      positionals: ["alice"],
      options: {},
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

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("edge API tokens");
    expect(result.error.hint).toContain("not yet supported");
  });

  test("returns invalid argument for xoxd edge token before users API call", async () => {
    const handler = createUsersSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxd-edge-test",
        source: "store:fallback",
      }),
      createClient: () => {
        throw new Error("createClient should not be called for xoxd token");
      },
    });

    const result = await handler({
      commandPath: ["users", "search"],
      positionals: ["alice"],
      options: {},
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

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("edge API tokens");
    expect(result.error.hint).toContain("not yet supported");
  });

  test("preserves xoxb users search behavior", async () => {
    delete process.env[XOXP_ENV_KEY];
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";

    const mockedFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      expect(requestUrl).toContain("/users.list");
      expect(requestUrl).toContain("limit=200");

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer xoxb-test-token");

      return new Response(
        JSON.stringify({
          ok: true,
          members: [
            {
              id: "U123",
              name: "carol",
              deleted: false,
              is_bot: false,
              is_admin: false,
              profile: {
                display_name: "Carol",
                real_name: "Carol Park",
              },
            },
          ],
          response_metadata: {
            next_cursor: "",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    globalThis.fetch = mockedFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "search", "carol", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("users.search");
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(1);
  });
});
