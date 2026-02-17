import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createMessagesRepliesHandler } from "../handlers/messages-replies";
import { createSlackClientError, createSlackWebApiClient } from "../slack";

describe("messages replies command", () => {
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
    const result = await runCliWithBuffer(["messages", "replies", "--json"]);

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
    expect(parsed.error.message).toContain("messages replies requires <channel-id>");
  });

  test("returns missing argument when thread-ts is absent", async () => {
    const result = await runCliWithBuffer(["messages", "replies", "C123", "--json"]);

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
    expect(parsed.error.message).toContain("messages replies requires <thread-ts>");
  });

  const missingValueOptionsTestCases = [
    {
      option: "limit",
      args: ["messages", "replies", "C123", "1700000000.000000", "--limit", "--json"],
    },
    {
      option: "oldest",
      args: ["messages", "replies", "C123", "1700000000.000000", "--oldest", "--json"],
    },
    {
      option: "latest",
      args: ["messages", "replies", "C123", "1700000000.000000", "--latest", "--json"],
    },
    {
      option: "cursor",
      args: ["messages", "replies", "C123", "1700000000.000000", "--cursor", "--json"],
    },
    {
      option: "sort",
      args: ["messages", "replies", "C123", "1700000000.000000", "--sort", "--json"],
    },
    {
      option: "filter-text",
      args: ["messages", "replies", "C123", "1700000000.000000", "--filter-text", "--json"],
    },
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

  const invalidLimitValueTestCases = [
    {
      value: "abc",
      description: "non-numeric value",
    },
    {
      value: "0",
      description: "zero (non-positive)",
    },
    {
      value: "-1",
      description: "negative integer",
    },
    {
      value: "-100",
      description: "large negative integer",
    },
  ];

  invalidLimitValueTestCases.forEach(({ value, description }) => {
    test(`returns error when --limit has ${description} (${value})`, async () => {
      const result = await runCliWithBuffer([
        "messages",
        "replies",
        "C123",
        "1700000000.000000",
        `--limit=${value}`,
        "--json",
      ]);

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
      expect(parsed.error.message).toContain("positive integer");
      expect(parsed.error.message).toContain(value);
      expect(parsed.error.hint).toContain("--limit");
    });
  });

  test("returns error when --sort has invalid value", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "replies",
      "C123",
      "1700000000.000000",
      "--sort=invalid",
      "--json",
    ]);

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
    expect(parsed.error.message).toContain("oldest");
    expect(parsed.error.message).toContain("newest");
    expect(parsed.error.message).toContain("invalid");
  });

  test("applies sort=oldest ascending order by ts", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "third reply",
                ts: "1700000003.000100",
              },
              {
                type: "message",
                user: "U002",
                text: "first reply",
                ts: "1700000001.000100",
              },
              {
                type: "message",
                user: "U003",
                text: "second reply",
                ts: "1700000002.000100",
              },
            ],
            response_metadata: {
              next_cursor: "",
            },
          }),
          { status: 200 },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "replies",
      "C123",
      "1700000000.000000",
      "--sort=oldest",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    const messages = parsed.data.messages;
    expect(Array.isArray(messages)).toBe(true);
    if (!Array.isArray(messages)) {
      return;
    }

    expect(messages.length).toBe(3);
    expect(messages[0].ts).toBe("1700000001.000100");
    expect(messages[1].ts).toBe("1700000002.000100");
    expect(messages[2].ts).toBe("1700000003.000100");
  });

  test("applies sort=newest descending order by ts", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "first reply",
                ts: "1700000001.000100",
              },
              {
                type: "message",
                user: "U002",
                text: "third reply",
                ts: "1700000003.000100",
              },
              {
                type: "message",
                user: "U003",
                text: "second reply",
                ts: "1700000002.000100",
              },
            ],
            response_metadata: {
              next_cursor: "",
            },
          }),
          { status: 200 },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "replies",
      "C123",
      "1700000000.000000",
      "--sort=newest",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    const messages = parsed.data.messages;
    expect(Array.isArray(messages)).toBe(true);
    if (!Array.isArray(messages)) {
      return;
    }

    expect(messages.length).toBe(3);
    expect(messages[0].ts).toBe("1700000003.000100");
    expect(messages[1].ts).toBe("1700000002.000100");
    expect(messages[2].ts).toBe("1700000001.000100");
  });

  test("applies filter-text case-insensitive match", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "Bug fix needed",
                ts: "1700000001.000100",
              },
              {
                type: "message",
                user: "U002",
                text: "Feature request approved",
                ts: "1700000002.000100",
              },
              {
                type: "message",
                user: "U003",
                text: "BUG: Critical issue",
                ts: "1700000003.000100",
              },
            ],
            response_metadata: {
              next_cursor: "",
            },
          }),
          { status: 200 },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "replies",
      "C123",
      "1700000000.000000",
      "--filter-text=bug",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    const messages = parsed.data.messages;
    expect(Array.isArray(messages)).toBe(true);
    if (!Array.isArray(messages)) {
      return;
    }

    expect(messages.length).toBe(2);
    expect(messages[0].text).toBe("Bug fix needed");
    expect(messages[1].text).toBe("BUG: Critical issue");
  });

  test("combines filter-text and sort=oldest", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "third BUG report",
                ts: "1700000003.000100",
              },
              {
                type: "message",
                user: "U002",
                text: "Feature approved",
                ts: "1700000002.000100",
              },
              {
                type: "message",
                user: "U003",
                text: "first bug found",
                ts: "1700000001.000100",
              },
            ],
            response_metadata: {
              next_cursor: "",
            },
          }),
          { status: 200 },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "replies",
      "C123",
      "1700000000.000000",
      "--filter-text=bug",
      "--sort=oldest",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    const messages = parsed.data.messages;
    expect(Array.isArray(messages)).toBe(true);
    if (!Array.isArray(messages)) {
      return;
    }

    expect(messages.length).toBe(2);
    expect(messages[0].text).toBe("first bug found");
    expect(messages[0].ts).toBe("1700000001.000100");
    expect(messages[1].text).toBe("third BUG report");
    expect(messages[1].ts).toBe("1700000003.000100");
  });

  test("success response includes expected data fields with filter/sort", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "hello world",
                ts: "1700000001.000100",
              },
            ],
            response_metadata: {
              next_cursor: "cursor-abc",
            },
          }),
          { status: 200 },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "replies",
      "C456",
      "1700000000.000000",
      "--sort=newest",
      "--filter-text=world",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("messages.replies");
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C456");
    expect(parsed.data.thread_ts).toBe("1700000000.000000");
    expect(parsed.data.next_cursor).toBe("cursor-abc");
    expect(Array.isArray(parsed.data.messages)).toBe(true);
  });

  test("returns message replies payload and cursor hint with --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/conversations.replies");
        expect(requestUrl).toContain("channel=C123");
        expect(requestUrl).toContain("ts=1700000000.000000");
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
                text: "that sounds good",
                ts: "1700000002.000100",
              },
              {
                type: "message",
                user: "U002",
                text: "agreed",
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
      "replies",
      "C123",
      "1700000000.000000",
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
    expect(parsed.command).toBe("messages.replies");
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.thread_ts).toBe("1700000000.000000");
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
    expect(first.text).toBe("that sounds good");
    expect(first.ts).toBe("1700000002.000100");

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    expect(parsed.textLines).toContain("More replies available. Next cursor: next-cursor");
    expect(parsed.textLines).toContain("1700000002.000100 U001 that sounds good");
  });

  test("maps SLACK_API_ERROR to invalid argument with marker", async () => {
    const handler = createMessagesRepliesHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
        fetchMessageReplies: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: channel_not_found.",
            hint: "Verify channel id and scopes.",
            details: "channel_not_found",
          });
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "replies"],
      positionals: ["C999", "1700000000.000000"],
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
    const handler = createMessagesRepliesHandler({
      env: {},
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
        fetchMessageReplies: async () => {
          throw createSlackClientError({
            code: "SLACK_AUTH_ERROR",
            message: "Slack authentication failed: invalid_auth.",
            hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
          });
        },
      }),
      resolveToken: () => ({ token: "xoxp-bad", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["messages", "replies"],
      positionals: ["C123", "1700000000.000000"],
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

describe("fetchMessageReplies client path", () => {
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

  test("requests conversations.replies with cursor params", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/conversations.replies");
        expect(requestUrl).toContain("channel=C456");
        expect(requestUrl).toContain("ts=1700000000.000001");
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
                text: "reply to thread",
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
    const result = await client.fetchMessageReplies({
      channel: "C456",
      ts: "1700000000.000001",
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
        text: "reply to thread",
        ts: "1700000001.000001",
        threadTs: undefined,
      },
    ]);
  });
});
