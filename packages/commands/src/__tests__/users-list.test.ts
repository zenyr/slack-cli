import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsersListHandler } from "../handlers/users-list";
import { createSlackClientError } from "../slack";

describe("users list command", () => {
  test("returns users list result for users list --json", async () => {
    const originalFetch = globalThis.fetch;
    const originalUserToken = process.env.SLACK_MCP_XOXP_TOKEN;
    const originalBotToken = process.env.SLACK_MCP_XOXB_TOKEN;

    process.env.SLACK_MCP_XOXP_TOKEN = "xoxp-test-token";
    delete process.env.SLACK_MCP_XOXB_TOKEN;

    const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
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
              name: "buildbot",
              deleted: true,
              is_bot: true,
              is_admin: false,
              profile: {
                real_name: "Build Bot",
              },
            },
          ],
          response_metadata: {
            next_cursor: "cursor-123",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    };

    globalThis.fetch = mockFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "list", "--json"]);

    if (originalUserToken === undefined) {
      delete process.env.SLACK_MCP_XOXP_TOKEN;
    } else {
      process.env.SLACK_MCP_XOXP_TOKEN = originalUserToken;
    }

    if (originalBotToken === undefined) {
      delete process.env.SLACK_MCP_XOXB_TOKEN;
    } else {
      process.env.SLACK_MCP_XOXB_TOKEN = originalBotToken;
    }

    globalThis.fetch = originalFetch;

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("users.list");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(2);
    expect(parsed.data.nextCursor).toBe("cursor-123");
    expect(Array.isArray(parsed.data.users)).toBe(true);

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    expect(parsed.textLines[0]).toBe("Found 2 users.");
    expect(parsed.textLines).toContain("- Alice (@alice) (U001) [admin]");
    expect(parsed.textLines).toContain("- Build Bot (@buildbot) (U002) [bot, deactivated]");
    expect(parsed.textLines).toContain("Next cursor available: cursor-123");
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
        hint: "Pass a valid cursor from users list response.",
        details: "invalid_cursor",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Pass a valid cursor from users list response.",
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
        const handler = createUsersListHandler({
          createClient: () => {
            throw createSlackClientError(clientErrorArgs);
          },
        });

        const result = await handler({
          commandPath: ["users", "list"],
          positionals: [],
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

  test("passes --cursor and --limit options to users.list client call", async () => {
    const originalFetch = globalThis.fetch;
    const originalUserToken = process.env.SLACK_MCP_XOXP_TOKEN;
    const originalBotToken = process.env.SLACK_MCP_XOXB_TOKEN;

    process.env.SLACK_MCP_XOXP_TOKEN = "xoxp-test-token";
    delete process.env.SLACK_MCP_XOXB_TOKEN;

    const mockFetch = async (input: string | URL | Request) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      expect(requestUrl).toContain("/users.list");
      expect(requestUrl).toContain("cursor=cursor-999");
      expect(requestUrl).toContain("limit=25");

      return new Response(
        JSON.stringify({
          ok: true,
          members: [],
          response_metadata: {
            next_cursor: "",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    };

    globalThis.fetch = mockFetch as typeof fetch;

    const result = await runCliWithBuffer([
      "users",
      "list",
      "--cursor=cursor-999",
      "--limit=25",
      "--json",
    ]);

    if (originalUserToken === undefined) {
      delete process.env.SLACK_MCP_XOXP_TOKEN;
    } else {
      process.env.SLACK_MCP_XOXP_TOKEN = originalUserToken;
    }

    if (originalBotToken === undefined) {
      delete process.env.SLACK_MCP_XOXB_TOKEN;
    } else {
      process.env.SLACK_MCP_XOXB_TOKEN = originalBotToken;
    }

    globalThis.fetch = originalFetch;

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);
  });

  test("returns INVALID_ARGUMENT when --cursor is missing value", async () => {
    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: [],
      options: {
        cursor: true,
      },
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
    expect(result.error.message).toBe("users list --cursor requires a value. [MISSING_ARGUMENT]");
    expect(result.error.hint).toBe("Pass --cursor=<cursor>.");
  });

  test("returns INVALID_ARGUMENT when --limit is non-positive", async () => {
    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: [],
      options: {
        limit: "0",
      },
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
    expect(result.error.message).toBe("users list --limit must be a positive integer. Received: 0");
    expect(result.error.hint).toBe("Use --limit with a positive integer, e.g. --limit=25.");
  });

  test("filters users by username with case-insensitive query", async () => {
    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({
          users: [
            {
              id: "U001",
              username: "alice",
              displayName: "Alice",
              realName: "Alice Kim",
              email: "alice@example.com",
              isBot: false,
              isDeleted: false,
              isAdmin: true,
            },
            {
              id: "U002",
              username: "bob",
              displayName: "Bob",
              realName: "Bob Smith",
              email: "bob@example.com",
              isBot: false,
              isDeleted: false,
              isAdmin: false,
            },
          ],
        }),
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: ["ALICE"],
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    if (!isRecord(result.data)) {
      return;
    }

    expect(Array.isArray(result.data.users)).toBe(true);
    expect(result.data.count).toBe(1);

    const users = result.data.users;
    if (Array.isArray(users) && users.length > 0) {
      const user = users[0];
      if (isRecord(user)) {
        expect(user.username).toBe("alice");
      }
    }
  });

  test("filters users by email", async () => {
    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({
          users: [
            {
              id: "U001",
              username: "alice",
              displayName: "Alice",
              realName: "Alice Kim",
              email: "alice@example.com",
              isBot: false,
              isDeleted: false,
              isAdmin: true,
            },
            {
              id: "U002",
              username: "bob",
              displayName: "Bob",
              realName: "Bob Smith",
              email: "bob@example.com",
              isBot: false,
              isDeleted: false,
              isAdmin: false,
            },
          ],
        }),
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: ["@example.com"],
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.count).toBe(2);
  });

  test("auto-paginates in query mode without explicit cursor", async () => {
    const listUsersCalls: Array<{ cursor?: string; limit?: number }> = [];

    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async (options = {}) => {
          listUsersCalls.push(options);

          if (options.cursor === undefined) {
            return {
              users: [
                {
                  id: "U001",
                  username: "bob",
                  displayName: "Bob",
                  realName: "Bob Smith",
                  email: "bob@example.com",
                  isBot: false,
                  isDeleted: false,
                  isAdmin: false,
                },
              ],
              nextCursor: "cursor-2",
            };
          }

          if (options.cursor === "cursor-2") {
            return {
              users: [
                {
                  id: "U002",
                  username: "alice",
                  displayName: "Alice",
                  realName: "Alice Kim",
                  email: "alice@example.com",
                  isBot: false,
                  isDeleted: false,
                  isAdmin: false,
                },
              ],
            };
          }

          return {
            users: [],
          };
        },
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(listUsersCalls.length).toBe(2);
    expect(listUsersCalls[0]?.cursor).toBeUndefined();
    expect(listUsersCalls[1]?.cursor).toBe("cursor-2");

    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.count).toBe(1);
    expect(result.data.nextCursor).toBeUndefined();
    expect(Array.isArray(result.data.users)).toBe(true);

    const users = result.data.users;
    if (Array.isArray(users) && users.length > 0) {
      const firstUser = users[0];
      if (isRecord(firstUser)) {
        expect(firstUser.username).toBe("alice");
      }
    }
  });

  test("does not auto-paginate when explicit --cursor is provided", async () => {
    let listUsersCallCount = 0;

    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => {
          listUsersCallCount += 1;

          return {
            users: [
              {
                id: "U010",
                username: "alice",
                displayName: "Alice",
                realName: "Alice Kim",
                email: "alice@example.com",
                isBot: false,
                isDeleted: false,
                isAdmin: false,
              },
            ],
            nextCursor: "cursor-next",
          };
        },
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: ["alice"],
      options: {
        cursor: "cursor-start",
      },
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(listUsersCallCount).toBe(1);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.count).toBe(1);
    expect(result.data.nextCursor).toBe("cursor-next");
  });

  test("caps query auto-pagination with deterministic nextCursor", async () => {
    const listUsersCalls: Array<{ cursor?: string; limit?: number }> = [];

    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async (options = {}) => {
          listUsersCalls.push(options);
          const page = listUsersCalls.length;

          return {
            users: [
              {
                id: `U-${page}`,
                username: `user-${page}`,
                displayName: `User ${page}`,
                realName: `User ${page}`,
                email: `user-${page}@example.com`,
                isBot: false,
                isDeleted: false,
                isAdmin: false,
              },
            ],
            nextCursor: `cursor-${page}`,
          };
        },
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: ["user"],
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(listUsersCalls.length).toBe(5);
    expect(listUsersCalls[0]?.cursor).toBeUndefined();
    expect(listUsersCalls[4]?.cursor).toBe("cursor-4");

    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.count).toBe(5);
    expect(result.data.nextCursor).toBe("cursor-5");
  });

  test("returns invalid argument for invalid regex query", async () => {
    const handler = createUsersListHandler({
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({
          users: [
            {
              id: "U001",
              username: "alice",
              displayName: "Alice",
              realName: "Alice Kim",
              email: "alice@example.com",
              isBot: false,
              isDeleted: false,
              isAdmin: true,
            },
          ],
        }),
        searchMessages: async () => ({
          query: "",
          total: 0,
          messages: [],
        }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["users", "list"],
      positionals: ["[invalid(regex"],
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
    expect(result.error.message).toContain("Invalid query regex");
  });
});
