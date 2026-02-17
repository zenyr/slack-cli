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

  test("returns invalid argument when Slack token is missing", async () => {
    const handler = createUsersListHandler({
      createClient: () => {
        throw createSlackClientError({
          code: "SLACK_CONFIG_ERROR",
          message: "Slack token is not configured.",
          hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
        });
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
    expect(result.error.message).toBe("Slack token is not configured.");
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
        fetchMessageReplies: async () => ({
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
        fetchMessageReplies: async () => ({
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
        fetchMessageReplies: async () => ({
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
