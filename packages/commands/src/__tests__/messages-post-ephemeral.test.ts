import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("messages post-ephemeral command", () => {
  const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
  const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxpToken = process.env[XOXP_ENV_KEY];
  const originalXoxbToken = process.env[XOXB_ENV_KEY];

  beforeEach(() => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";
  });

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

  test("returns missing argument when user id is absent", async () => {
    const result = await runCliWithBuffer(["messages", "post-ephemeral", "C123", "--json", "--xoxb"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("<user-id>");
  });

  test("requires explicit token type selection", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "post-ephemeral",
      "C123",
      "U123",
      "hello",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("requires explicit token type selection");
  });

  test("returns invalid argument when thread ts format is invalid", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "post-ephemeral",
      "C123",
      "U123",
      "hello",
      "--thread-ts=bad-ts",
      "--json",
      "--xoxb",
    ]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("seconds.fraction");
  });

  test("posts ephemeral message with receiver and thread ts", async () => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.postEphemeral");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxb-test-token");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("user")).toBe("U777");
        expect(params.get("thread_ts")).toBe("1700000000.000001");
        expect(params.get("text")).toBe("Read *docs*");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            message_ts: "1700000002.000100",
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
      "post-ephemeral",
      "C123",
      "U777",
      "Read",
      "**docs**",
      "--thread-ts=1700000000.000001",
      "--json",
      "--xoxb",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.command).toBe("messages.post-ephemeral");
    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.user).toBe("U777");
    expect(parsed.data.message_ts).toBe("1700000002.000100");
  });

  test("posts ephemeral message with raw JSON blocks when --blocks is provided", async () => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";

    let capturedContentType = "";
    let capturedBlocks: unknown;

    const mockedFetch: typeof fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        capturedContentType = new Headers(init?.headers).get("Content-Type") ?? "";
        const body = JSON.parse(String(init?.body));
        capturedBlocks = body.blocks;
        expect(body.channel).toBe("C123");
        expect(body.user).toBe("U777");
        expect(body.text).toBe("Read *docs*");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            message_ts: "1700000002.000100",
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
      "post-ephemeral",
      "C123",
      "U777",
      "Read",
      "**docs**",
      '--blocks=[{"type":"section","text":{"type":"mrkdwn","text":"*override*"}}]',
      "--json",
      "--xoxb",
    ]);

    expect(result.exitCode).toBe(0);
    expect(capturedContentType).toContain("application/json");
    expect(Array.isArray(capturedBlocks)).toBe(true);
    expect((capturedBlocks as unknown[]).length).toBe(1);
  });
});
