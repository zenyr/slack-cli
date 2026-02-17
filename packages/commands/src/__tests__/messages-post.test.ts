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

  test("maps SLACK_API_ERROR to invalid argument with marker", async () => {
    const handler = createMessagesPostHandler({
      env: {},
      createClient: () => ({
        postMessage: async () => {
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
    expect(result.error.message).toContain("SLACK_API_ERROR");
    expect(result.error.message).toContain("channel_not_found");
  });
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
});
