import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createMessagesHistoryHandler } from "../handlers/messages-history";
import { createSlackClientError, createSlackWebApiClient } from "../slack";

describe("messages history command", () => {
  const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxpToken = process.env[XOXP_ENV_KEY];

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalXoxpToken === undefined) {
      delete process.env[XOXP_ENV_KEY];
    } else {
      process.env[XOXP_ENV_KEY] = originalXoxpToken;
    }
  });

  test("returns missing argument when channel id is absent", async () => {
    const result = await runCliWithBuffer(["messages", "history", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    expect(isRecord(parsed.error)).toBe(true);
    if (!isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("MISSING_ARGUMENT");
    expect(parsed.error.message).toContain("messages history requires");
    expect(parsed.error.message).toContain("channel-id");
    expect(parsed.error.message).toContain("channel-name");
  });

  const missingValueOptionsTestCases = [
    { option: "limit", args: ["messages", "history", "C123", "--limit", "--json"] },
    { option: "oldest", args: ["messages", "history", "C123", "--oldest", "--json"] },
    { option: "latest", args: ["messages", "history", "C123", "--latest", "--json"] },
    { option: "cursor", args: ["messages", "history", "C123", "--cursor", "--json"] },
  ];

  missingValueOptionsTestCases.forEach(({ option, args }) => {
    test(`returns error when --${option} passed without value`, async () => {
      const result = await runCliWithBuffer(args);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.length).toBe(0);

      const parsed = parseJsonOutput(result.stdout);
      expect(isRecord(parsed)).toBe(true);
      if (!isRecord(parsed)) {
        return;
      }

      expect(parsed.ok).toBe(false);
      expect(isRecord(parsed.error)).toBe(true);
      if (!isRecord(parsed.error)) {
        return;
      }

      expect(parsed.error.code).toBe("INVALID_ARGUMENT");
      expect(parsed.error.message).toContain("MISSING_ARGUMENT");
      expect(parsed.error.message).toContain(`--${option}`);
    });
  });

  test("returns messages history payload and cursor hint with --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/conversations.history");
        expect(requestUrl).toContain("channel=C123");
        expect(requestUrl).toContain("limit=50");
        expect(requestUrl).toContain("oldest=1");
        expect(requestUrl).toContain("latest=2");
        expect(requestUrl).toContain("cursor=cursor-99");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "deployed",
                ts: "1700000002.000100",
              },
              {
                type: "message",
                user: "U002",
                text: "all good",
                ts: "1700000001.000100",
              },
            ],
            response_metadata: {
              next_cursor: "next-cursor",
            },
          }),
          {
            status: 200,
          },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "history",
      "C123",
      "--limit",
      "50",
      "--oldest",
      "1",
      "--latest",
      "2",
      "--cursor",
      "cursor-99",
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
    expect(parsed.command).toBe("messages.history");
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.next_cursor).toBe("next-cursor");

    const messages = parsed.data.messages;
    expect(Array.isArray(messages)).toBe(true);
    if (!Array.isArray(messages)) {
      return;
    }

    expect(messages.length).toBe(2);

    const first = messages[0];
    expect(isRecord(first)).toBe(true);
    if (!isRecord(first)) {
      return;
    }

    expect(first.type).toBe("message");
    expect(first.user).toBe("U001");
    expect(first.text).toBe("deployed");
    expect(first.ts).toBe("1700000002.000100");

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    expect(parsed.textLines).toContain("More messages available. Next cursor: next-cursor");
    expect(parsed.textLines).toContain("1700000002.000100 U001 deployed");
  });

  test("maps SLACK_API_ERROR to invalid argument with marker", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: channel_not_found.",
            hint: "Verify channel id and scopes.",
            details: "channel_not_found",
          });
        },
        fetchMessageReplies: async () => ({
          channel: "",
          messages: [],
        }),
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C999"],
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
    expect(result.error.message).toContain("SLACK_API_ERROR");
    expect(result.error.message).toContain("channel_not_found");
    expect(result.error.hint).toBe("Verify channel id and scopes.");
  });

  test("maps SLACK_AUTH_ERROR to invalid argument with AUTH_ERROR marker", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => {
          throw createSlackClientError({
            code: "SLACK_AUTH_ERROR",
            message: "Slack authentication failed: invalid_auth.",
            hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
          });
        },
        fetchMessageReplies: async () => ({
          channel: "",
          messages: [],
        }),
      }),
      resolveToken: () => ({ token: "xoxp-bad", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C123"],
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
    expect(result.error.message).toContain("AUTH_ERROR");
  });
});

describe("--limit time-range tokens", () => {
  test("--limit=1d computes oldest and passes to history call", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => {
        const now = Math.floor(Date.now() / 1000);
        const expectedOldest = Math.floor(now - 86400).toString();

        return {
          listChannels: async () => ({
            channels: [{ id: "C123", name: "general", isPrivate: false, isArchived: false }],
          }),
          listUsers: async () => ({ users: [] }),
          searchMessages: async () => ({ query: "", total: 0, messages: [] }),
          fetchChannelHistory: async (params) => {
            expect(params.channel).toBe("C123");
            expect(params.oldest).toBe(expectedOldest);
            expect(params.latest).toBeUndefined();
            expect(params.limit).toBe(100);
            return {
              channel: "C123",
              messages: [],
              nextCursor: undefined,
            };
          },
        };
      },
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C123"],
      options: { limit: "1d" },
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
  });

  test("--limit=1w computes oldest and passes to history call", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => {
        const now = Math.floor(Date.now() / 1000);
        const expectedOldest = Math.floor(now - 604800).toString();

        return {
          listChannels: async () => ({ channels: [] }),
          listUsers: async () => ({ users: [] }),
          searchMessages: async () => ({ query: "", total: 0, messages: [] }),
          fetchChannelHistory: async (params) => {
            expect(params.channel).toBe("C456");
            expect(params.oldest).toBe(expectedOldest);
            expect(params.latest).toBeUndefined();
            return {
              channel: "C456",
              messages: [],
              nextCursor: undefined,
            };
          },
        };
      },
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C456"],
      options: { limit: "1w" },
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
  });

  test("invalid token (2d) returns INVALID_ARGUMENT with guidance", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({ channel: "", messages: [], nextCursor: undefined }),
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C123"],
      options: { limit: "2d" },
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
    expect(result.error.message).toContain("INVALID_RANGE_TOKEN");
    expect(result.error.hint).toContain("1d, 1w, 30d, 90d");
  });

  test("explicit --oldest wins over --limit time-range token", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async (params) => {
          expect(params.oldest).toBe("500");
          return {
            channel: "C123",
            messages: [],
            nextCursor: undefined,
          };
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C123"],
      options: { limit: "1d", oldest: "500" },
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
  });
});

describe("channel identifier resolution", () => {
  test("numeric limit unchanged with raw channel ID", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async (params) => {
          expect(params.channel).toBe("C789");
          expect(params.limit).toBe(50);
          return {
            channel: "C789",
            messages: [],
            nextCursor: undefined,
          };
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C789"],
      options: { limit: "50" },
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
  });

  test("positional #channel-name resolves to ID before history fetch", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({
          channels: [
            { id: "C123ABC", name: "announcements", isPrivate: false, isArchived: false },
            { id: "C456DEF", name: "general", isPrivate: false, isArchived: false },
          ],
        }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async (params) => {
          expect(params.channel).toBe("C123ABC");
          return {
            channel: "C123ABC",
            messages: [],
            nextCursor: undefined,
          };
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["#announcements"],
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

    expect(result.data.channel).toBe("C123ABC");
  });

  test("positional #missing returns INVALID_ARGUMENT with actionable error", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({
          channels: [{ id: "C123ABC", name: "general", isPrivate: false, isArchived: false }],
        }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
          nextCursor: undefined,
        }),
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["#nonexistent"],
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
    expect(result.error.message).toContain("Channel not found");
    expect(result.error.message).toContain("#nonexistent");
    expect(result.error.hint).toContain("Verify channel name");
  });

  test("empty channel name after # returns error with guidance", async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
          nextCursor: undefined,
        }),
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["#"],
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
    expect(result.error.message).toContain("Channel name cannot be empty");
  });

  test('--limit with empty string value (--limit="") returns INVALID_RANGE_TOKEN marker', async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
          nextCursor: undefined,
        }),
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C123"],
      options: { limit: "" },
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
    expect(result.error.message).toContain("INVALID_RANGE_TOKEN");
    expect(result.error.message).toContain("cannot be empty");
  });

  test('--limit with whitespace-only value (--limit="  ") returns INVALID_RANGE_TOKEN marker', async () => {
    const handler = createMessagesHistoryHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
          nextCursor: undefined,
        }),
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "history"],
      positionals: ["C123"],
      options: { limit: "   " },
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
    expect(result.error.message).toContain("INVALID_RANGE_TOKEN");
  });
});

describe("fetchChannelHistory client path", () => {
  const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxpToken = process.env[XOXP_ENV_KEY];

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalXoxpToken === undefined) {
      delete process.env[XOXP_ENV_KEY];
    } else {
      process.env[XOXP_ENV_KEY] = originalXoxpToken;
    }
  });

  test("requests conversations.history with cursor params", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/conversations.history");
        expect(requestUrl).toContain("channel=C456");
        expect(requestUrl).toContain("limit=2");
        expect(requestUrl).toContain("oldest=100");
        expect(requestUrl).toContain("latest=200");
        expect(requestUrl).toContain("cursor=page-1");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U100",
                text: "build started",
                ts: "1700000001.000001",
              },
            ],
            response_metadata: {
              next_cursor: "page-2",
            },
          }),
          {
            status: 200,
          },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const client = createSlackWebApiClient();
    const result = await client.fetchChannelHistory({
      channel: "C456",
      limit: 2,
      oldest: "100",
      latest: "200",
      cursor: "page-1",
    });

    expect(result.channel).toBe("C456");
    expect(result.nextCursor).toBe("page-2");
    expect(result.messages).toEqual([
      {
        type: "message",
        user: "U100",
        text: "build started",
        ts: "1700000001.000001",
        threadTs: undefined,
      },
    ]);
  });
});
