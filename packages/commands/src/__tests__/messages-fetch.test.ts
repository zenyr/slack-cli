import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("messages fetch command", () => {
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

  test("returns missing argument when message url is absent", async () => {
    const result = await runCliWithBuffer(["messages", "fetch", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("<message-url>");
  });

  test("returns invalid argument when --thread has invalid boolean", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "fetch",
      "https://acme.slack.com/archives/C12345678/p1700000000123456",
      "--thread=maybe",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("--thread must be boolean");
  });

  test("fetches exact message from permalink", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/conversations.history");
        expect(requestUrl).toContain("channel=C12345678");
        expect(requestUrl).toContain("oldest=1699999999.123456");
        expect(requestUrl).toContain("latest=1700000001.123456");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U123",
                text: "target message",
                ts: "1700000000.123456",
                thread_ts: "1699999900.000001",
              },
            ],
          }),
          { status: 200 },
        );
      },
      { preconnect: originalFetch.preconnect },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "fetch",
      "https://acme.slack.com/archives/C12345678/p1700000000123456",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.message)) {
      return;
    }

    expect(parsed.command).toBe("messages.fetch");
    expect(parsed.data.channel).toBe("C12345678");
    expect(parsed.data.ts).toBe("1700000000.123456");
    expect(parsed.data.message.text).toBe("target message");
  });

  test("fetches full thread when --thread is set", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    let callCount = 0;
    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request) => {
        callCount += 1;
        const requestUrl = input instanceof URL ? input.toString() : String(input);

        if (requestUrl.includes("/conversations.history")) {
          return new Response(
            JSON.stringify({
              ok: true,
              messages: [
                {
                  type: "message",
                  user: "U123",
                  text: "target reply",
                  ts: "1700000000.123456",
                  thread_ts: "1699999900.000001",
                },
              ],
            }),
            { status: 200 },
          );
        }

        expect(requestUrl).toContain("/conversations.replies");
        expect(requestUrl).toContain("channel=C12345678");
        expect(requestUrl).toContain("ts=1699999900.000001");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                user: "U111",
                text: "root",
                ts: "1699999900.000001",
              },
              {
                type: "message",
                user: "U123",
                text: "target reply",
                ts: "1700000000.123456",
                thread_ts: "1699999900.000001",
              },
            ],
          }),
          { status: 200 },
        );
      },
      { preconnect: originalFetch.preconnect },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer([
      "messages",
      "fetch",
      "https://acme.slack.com/archives/C12345678/p1700000000123456",
      "--thread",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(callCount).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !Array.isArray(parsed.data.messages)) {
      return;
    }

    expect(parsed.data.thread_ts).toBe("1699999900.000001");
    expect(parsed.data.target_ts).toBe("1700000000.123456");
    expect(parsed.data.messages.length).toBe(2);
  });
});
