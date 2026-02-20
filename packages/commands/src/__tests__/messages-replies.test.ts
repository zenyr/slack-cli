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

  const invalidThreadTsTestCases = [
    "1700000000",
    "1700000000.",
    ".000000",
    "abc.def",
    "1700000000.000000.1",
  ];

  invalidThreadTsTestCases.forEach((threadTs) => {
    test(`returns error when thread-ts positional has invalid format (${threadTs})`, async () => {
      const result = await runCliWithBuffer(["messages", "replies", "C123", threadTs, "--json"]);

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
      expect(parsed.error.message).toContain("seconds.fraction");
      expect(parsed.error.message).toContain(threadTs);
    });
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

  const invalidRangeValueTestCases = [
    {
      option: "oldest",
      value: "1700000000",
      description: "missing fractional part",
    },
    {
      option: "oldest",
      value: ".000001",
      description: "missing seconds part",
    },
    {
      option: "latest",
      value: "1700000000.",
      description: "missing fractional digits",
    },
    {
      option: "latest",
      value: "abc.def",
      description: "non-numeric timestamp",
    },
  ];

  invalidRangeValueTestCases.forEach(({ option, value, description }) => {
    test(`returns error when --${option} has invalid timestamp (${description})`, async () => {
      const result = await runCliWithBuffer([
        "messages",
        "replies",
        "C123",
        "1700000000.000000",
        `--${option}=${value}`,
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
      expect(parsed.error.message).toContain("seconds.fraction");
      expect(parsed.error.message).toContain(`--${option}`);
      expect(parsed.error.message).toContain(value);
    });
  });

  const invalidLimitValueTestCases = [
    {
      value: "abc",
      description: "non-numeric value",
    },
    {
      value: "10abc",
      description: "mixed numeric suffix",
    },
    {
      value: "1.5",
      description: "decimal value",
    },
    {
      value: "+2",
      description: "explicit positive sign",
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

  test("success response includes expected data fields", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    let callCount = 0;
    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        callCount += 1;
        if (callCount === 1) {
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
        }

        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U002",
                text: "second page",
                ts: "1700000002.000100",
              },
            ],
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
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(callCount).toBe(2);

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
    expect(parsed.data.next_cursor).toBeUndefined();
    expect(Array.isArray(parsed.data.messages)).toBe(true);
    if (!Array.isArray(parsed.data.messages)) {
      return;
    }
    expect(parsed.data.messages.length).toBe(2);
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
        expect(requestUrl).toContain("oldest=1700000000.000001");
        expect(requestUrl).toContain("latest=1700000002.000002");
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
      "1700000000.000001",
      "--latest",
      "1700000002.000002",
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

  test("auto-paginates when --limit exceeds single page size", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    let callCount = 0;
    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request) => {
        callCount += 1;
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/conversations.replies");
        expect(requestUrl).toContain("channel=C777");
        expect(requestUrl).toContain("ts=1700000000.000000");
        expect(requestUrl).toContain("limit=200");

        if (callCount === 1) {
          const firstPageMessages = Array.from({ length: 200 }, (_, index) => ({
            type: "message",
            user: "U001",
            text: `page1-${index + 1}`,
            ts: `1700000001.${String(index + 1).padStart(6, "0")}`,
          }));

          return new Response(
            JSON.stringify({
              ok: true,
              messages: firstPageMessages,
              response_metadata: {
                next_cursor: "cursor-page-2",
              },
            }),
            { status: 200 },
          );
        }

        expect(requestUrl).toContain("cursor=cursor-page-2");
        const secondPageMessages = Array.from({ length: 100 }, (_, index) => ({
          type: "message",
          user: "U002",
          text: `page2-${index + 1}`,
          ts: `1700000002.${String(index + 1).padStart(6, "0")}`,
        }));

        return new Response(
          JSON.stringify({
            ok: true,
            messages: secondPageMessages,
            response_metadata: {
              next_cursor: "cursor-page-3",
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
      "C777",
      "1700000000.000000",
      "--limit=250",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(callCount).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !Array.isArray(parsed.data.messages)) {
      return;
    }

    expect(parsed.data.messages.length).toBe(250);
    expect(parsed.data.next_cursor).toBe("cursor-page-3");
  });

  test("reconstructs message text from rich_text blocks when text is truncated", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const fullText =
      "좋습니다. 질문하신 내용에 대해 정리해드리겠습니다. 라이센스, 성능, 호환성 순서로 답변드립니다.";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U001",
                text: "좋습니다. 질문하신 내용에 대해 정리해드리겠습니다.",
                ts: "1700000001.000100",
                thread_ts: "1700000000.000000",
                blocks: [
                  {
                    type: "rich_text",
                    elements: [
                      {
                        type: "rich_text_section",
                        elements: [
                          {
                            type: "text",
                            text: fullText,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
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
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !Array.isArray(parsed.data.messages)) {
      return;
    }

    const first = parsed.data.messages[0];
    expect(isRecord(first)).toBe(true);
    if (!isRecord(first)) {
      return;
    }

    expect(first.text).toBe(fullText);
  });

  const deterministicSlackErrorCases = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      slackCode: "SLACK_CONFIG_ERROR",
      message: "Slack token is not configured.",
      hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      details: undefined,
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT with AUTH_ERROR marker",
      slackCode: "SLACK_AUTH_ERROR",
      message: "Slack authentication failed: invalid_auth.",
      hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
      details: undefined,
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: "AUTH_ERROR",
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT with SLACK_API_ERROR marker",
      slackCode: "SLACK_API_ERROR",
      message: "Slack API request failed: channel_not_found.",
      hint: "Verify channel id and scopes.",
      details: "channel_not_found",
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: "SLACK_API_ERROR",
      expectedDetail: "channel_not_found",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      slackCode: "SLACK_HTTP_ERROR",
      message: "Slack HTTP transport failed with status 503.",
      hint: "Check network path and retry.",
      details: undefined,
      expectedCliCode: "INTERNAL_ERROR",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      slackCode: "SLACK_RESPONSE_ERROR",
      message: "Slack response payload missing thread message metadata.",
      hint: "Capture raw response and validate schema assumptions.",
      details: undefined,
      expectedCliCode: "INTERNAL_ERROR",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
  ] as const;

  deterministicSlackErrorCases.forEach(
    ({
      title,
      slackCode,
      message,
      hint,
      details,
      expectedCliCode,
      expectedMarker,
      expectedDetail,
    }) => {
      test(title, async () => {
        const handler = createMessagesRepliesHandler({
          env: {},
          createClient: () => ({
            listChannels: async () => ({ channels: [] }),
            listUsers: async () => ({ users: [] }),
            searchMessages: async () => ({ query: "", total: 0, messages: [] }),
            getUsersByIds: async () => ({ users: [], missingUserIds: [] }),
            fetchChannelHistory: async () => ({
              channel: "",
              messages: [],
            }),
            fetchMessageReplies: async () => {
              throw createSlackClientError({
                code: slackCode,
                message,
                hint,
                details,
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

        expect(result.error.code).toBe(expectedCliCode);
        expect(result.error.hint).toBe(hint);
        if (expectedMarker === undefined) {
          expect(result.error.message).not.toContain("AUTH_ERROR");
          expect(result.error.message).not.toContain("SLACK_API_ERROR");
        } else {
          expect(result.error.message).toContain(expectedMarker);
        }

        if (expectedDetail !== undefined) {
          expect(result.error.message).toContain(expectedDetail);
        }
      });
    },
  );

  const edgeTokenGuardCases: Array<{
    title: string;
    token: string;
    source: "store:active" | "store:fallback" | "SLACK_MCP_XOXP_TOKEN" | "SLACK_MCP_XOXB_TOKEN";
    tokenType?: "xoxp" | "xoxb";
  }> = [
    {
      title: "unclassified xoxc token",
      token: "xoxc-edge-test",
      source: "store:active",
    },
    {
      title: "unclassified xoxd token",
      token: "xoxd-edge-test",
      source: "store:fallback",
    },
    {
      title: "xoxc token classified as xoxp",
      token: "xoxc-edge-test",
      source: "SLACK_MCP_XOXP_TOKEN",
      tokenType: "xoxp",
    },
    {
      title: "xoxd token classified as xoxb",
      token: "xoxd-edge-test",
      source: "SLACK_MCP_XOXB_TOKEN",
      tokenType: "xoxb",
    },
  ];

  edgeTokenGuardCases.forEach(({ title, token, source, tokenType }) => {
    test(`returns invalid argument for ${title}`, async () => {
      const handler = createMessagesRepliesHandler({
        env: {},
        resolveToken: () => ({
          token,
          source,
          tokenType,
        }),
        createClient: () => {
          throw new Error("createClient should not be called for edge tokens");
        },
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
      expect(result.error.message).toContain("edge API tokens");
      expect(result.error.hint).toContain("not yet supported");
    });
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
    // Runtime narrowing check: verify client has fetchMessageReplies before calling (test only)
    if (!("fetchMessageReplies" in (client as Record<string, unknown>))) {
      throw new Error("Client does not have fetchMessageReplies method");
    }
    type ClientWithReplies = { fetchMessageReplies: (params: unknown) => Promise<unknown> };
    const result = (await (client as unknown as ClientWithReplies).fetchMessageReplies({
      channel: "C456",
      ts: "1700000000.000001",
      limit: 2,
      oldest: "100",
      latest: "200",
      cursor: "page-1",
    })) as unknown as { channel: string; nextCursor?: string; messages: unknown[] };

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
