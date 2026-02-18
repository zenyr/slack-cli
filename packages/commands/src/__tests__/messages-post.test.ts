import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createMessagesPostHandler } from "../handlers/messages-post";
import { createSlackClientError, createSlackWebApiClient } from "../slack";

describe("messages post command", () => {
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
    const result = await runCliWithBuffer(["messages", "post", "--json"]);

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
    expect(parsed.error.message).toContain("<channel-id>");
  });

  test("returns missing argument when text is absent", async () => {
    const result = await runCliWithBuffer(["messages", "post", "C123", "--json"]);

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
    expect(parsed.error.message).toContain("non-empty <text>");
  });

  test("returns invalid argument when text is whitespace-only", async () => {
    const result = await runCliWithBuffer(["messages", "post", "C123", "   ", "--json"]);

    expect(result.exitCode).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    if (!isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("non-empty <text>");
  });

  test("returns invalid argument when --thread-ts is provided without value", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "post",
      "C123",
      "hello",
      "--thread-ts",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("--thread-ts requires a value");
    expect(parsed.error.hint).toContain("--thread-ts=<ts>");
  });

  test("returns invalid argument when --thread-ts is blank", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "post",
      "C123",
      "hello",
      "--thread-ts=",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("value cannot be empty");
  });

  test("returns invalid argument when --thread-ts has invalid timestamp format", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "post",
      "C123",
      "hello",
      "--thread-ts=not-a-ts",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("seconds.fraction");
    expect(parsed.error.message).toContain("not-a-ts");
  });

  test("posts plain text and returns posted metadata with --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.postMessage");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");
        expect(headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("text")).toBe("hello from cli");
        expect(params.get("thread_ts")).toBeNull();

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            ts: "1700000002.000100",
            message: {
              type: "message",
              user: "U001",
              text: "hello from cli",
              ts: "1700000002.000100",
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
      "post",
      "C123",
      "hello",
      "from",
      "cli",
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
    expect(parsed.command).toBe("messages.post");
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.ts).toBe("1700000002.000100");
    expect(isRecord(parsed.data.message)).toBe(true);
    if (!isRecord(parsed.data.message)) {
      return;
    }

    expect(parsed.data.message.text).toBe("hello from cli");
  });

  test("forwards --thread-ts to chat.postMessage payload", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("text")).toBe("hello from cli");
        expect(params.get("thread_ts")).toBe("1700000000.000001");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            ts: "1700000002.000100",
            message: {
              type: "message",
              user: "U001",
              text: "hello from cli",
              ts: "1700000002.000100",
              thread_ts: "1700000000.000001",
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
      "post",
      "C123",
      "hello",
      "from",
      "cli",
      "--thread-ts=1700000000.000001",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.message)) {
      return;
    }

    expect(parsed.data.message.threadTs).toBe("1700000000.000001");
  });

  test("enforces post channel policy before attempting post", async () => {
    let tokenResolved = false;
    let postAttempted = false;

    const handler = createMessagesPostHandler({
      env: {
        SLACK_MCP_POST_CHANNEL_DENYLIST: "C999",
      },
      resolveToken: () => {
        tokenResolved = true;
        return { token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" };
      },
      createClient: () => ({
        postMessage: async () => {
          postAttempted = true;
          return {
            channel: "C999",
            ts: "1700000002.000100",
            message: {
              type: "message",
              text: "should not post",
              ts: "1700000002.000100",
            },
          };
        },
      }),
    });

    const result = await handler({
      commandPath: ["messages", "post"],
      positionals: ["C999", "hello"],
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
    expect(result.error.message).toContain("POST_CHANNEL_POLICY");
    expect(result.error.message).toContain("channel denied by SLACK_MCP_POST_CHANNEL_DENYLIST");
    expect(tokenResolved).toBe(false);
    expect(postAttempted).toBe(false);
  });

  test("converts markdown text before calling chat.postMessage", async () => {
    let postedText = "";

    const handler = createMessagesPostHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        postMessage: async ({ text }) => {
          postedText = text;
          return {
            channel: "C123",
            ts: "1700000002.000100",
            message: {
              type: "message",
              text,
              ts: "1700000002.000100",
            },
          };
        },
      }),
    });

    const result = await handler({
      commandPath: ["messages", "post"],
      positionals: ["C123", "Read", "**docs**", "at", "[guide](https://example.com/guide)"],
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
    expect(postedText).toBe("Read *docs* at <https://example.com/guide|guide>");
  });

  const deterministicSlackErrorCases: Array<{
    title: string;
    clientErrorArgs: Parameters<typeof createSlackClientError>[0];
    expectedCliCode: "INVALID_ARGUMENT" | "INTERNAL_ERROR";
    expectedHint: string;
    expectedMessageContains: string[];
    expectedMessageExcludes: string[];
  }> = [
    {
      title:
        "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT with deterministic marker/detail behavior",
      clientErrorArgs: {
        code: "SLACK_CONFIG_ERROR",
        message: "Slack token is not configured.",
        hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
        details: "config-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      expectedMessageContains: ["Slack token is not configured."],
      expectedMessageExcludes: [
        "config-detail-must-not-appear",
        "[AUTH_ERROR]",
        "[SLACK_API_ERROR]",
      ],
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT with deterministic marker/detail behavior",
      clientErrorArgs: {
        code: "SLACK_AUTH_ERROR",
        message: "Slack authentication failed: invalid_auth.",
        hint: "Use valid Slack token.",
        details: "auth-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Use valid Slack token.",
      expectedMessageContains: ["Slack authentication failed: invalid_auth.", "[AUTH_ERROR]"],
      expectedMessageExcludes: ["auth-detail-must-not-appear", "[SLACK_API_ERROR]"],
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT with deterministic marker/detail behavior",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Slack API request failed: channel_not_found.",
        hint: "Verify channel id and scopes.",
        details: "channel_not_found",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Verify channel id and scopes.",
      expectedMessageContains: [
        "Slack API request failed: channel_not_found.",
        "channel_not_found",
        "[SLACK_API_ERROR]",
      ],
      expectedMessageExcludes: ["[AUTH_ERROR]"],
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR with deterministic marker/detail behavior",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Slack HTTP transport failed with status 503.",
        hint: "Check network path and retry.",
        details: "http-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Check network path and retry.",
      expectedMessageContains: ["Slack HTTP transport failed with status 503."],
      expectedMessageExcludes: ["http-detail-must-not-appear", "[AUTH_ERROR]", "[SLACK_API_ERROR]"],
    },
    {
      title:
        "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR with deterministic marker/detail behavior",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack response payload missing message.ts",
        hint: "Capture raw response and validate schema assumptions.",
        details: "response-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Capture raw response and validate schema assumptions.",
      expectedMessageContains: ["Slack response payload missing message.ts"],
      expectedMessageExcludes: [
        "response-detail-must-not-appear",
        "[AUTH_ERROR]",
        "[SLACK_API_ERROR]",
      ],
    },
  ];

  deterministicSlackErrorCases.forEach(
    ({
      title,
      clientErrorArgs,
      expectedCliCode,
      expectedHint,
      expectedMessageContains,
      expectedMessageExcludes,
    }) => {
      test(title, async () => {
        const handler = createMessagesPostHandler({
          env: {},
          createClient: () => ({
            postMessage: async () => {
              throw createSlackClientError(clientErrorArgs);
            },
          }),
          resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
        });

        const result = await handler({
          commandPath: ["messages", "post"],
          positionals: ["C123", "hello"],
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
        expect(result.error.hint).toBe(expectedHint);

        expectedMessageContains.forEach((token) => {
          expect(result.error.message).toContain(token);
        });

        expectedMessageExcludes.forEach((token) => {
          expect(result.error.message).not.toContain(token);
        });
      });
    },
  );
});

describe("postMessage client path", () => {
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

  test("calls chat.postMessage and maps response", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.postMessage");
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C777",
            ts: "1700000001.000001",
            message: {
              type: "message",
              text: "deployed",
              ts: "1700000001.000001",
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

    const client = createSlackWebApiClient();
    const result = await client.postMessage({ channel: "C777", text: "deployed" });

    expect(result.channel).toBe("C777");
    expect(result.ts).toBe("1700000001.000001");
    expect(isRecord(result.message)).toBe(true);
  });

  test("sends thread_ts when postMessage called with threadTs", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C777");
        expect(params.get("text")).toBe("deployed");
        expect(params.get("thread_ts")).toBe("1700000000.999999");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C777",
            ts: "1700000001.000001",
            message: {
              type: "message",
              text: "deployed",
              ts: "1700000001.000001",
              thread_ts: "1700000000.999999",
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

    const client = createSlackWebApiClient();
    const result = await client.postMessage({
      channel: "C777",
      text: "deployed",
      threadTs: "1700000000.999999",
    });

    expect(result.ts).toBe("1700000001.000001");
    expect(isRecord(result.message)).toBe(true);
    if (!isRecord(result.message)) {
      return;
    }

    expect(result.message.threadTs).toBe("1700000000.999999");
  });
});
