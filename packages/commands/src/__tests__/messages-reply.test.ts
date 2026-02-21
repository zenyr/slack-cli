import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("messages reply command", () => {
  const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxbToken = process.env[XOXB_ENV_KEY];

  beforeEach(() => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalXoxbToken === undefined) {
      delete process.env[XOXB_ENV_KEY];
    } else {
      process.env[XOXB_ENV_KEY] = originalXoxbToken;
    }
  });

  test("uses stdin content as <text> when reply text is '-'", async () => {
    const mockedFetch: typeof fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("thread_ts")).toBe("1700000001.000100");
        expect(params.get("text")).toBe("reply from stdin");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            ts: "1700000002.000100",
            message: {
              type: "message",
              text: "reply from stdin",
              ts: "1700000002.000100",
              thread_ts: "1700000001.000100",
            },
          }),
          { status: 200 },
        );
      },
      { preconnect: originalFetch.preconnect },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer(
      ["messages", "reply", "C123", "1700000001.000100", "-", "--json", "--xoxb"],
      { stdin: "reply from stdin" },
    );

    expect(result.exitCode).toBe(0);
  });

  test("uses stdin content as block source when --blocks=- is provided", async () => {
    let capturedBlocks: unknown;

    const mockedFetch: typeof fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        capturedBlocks = body.blocks;
        expect(body.channel).toBe("C123");
        expect(body.thread_ts).toBe("1700000001.000100");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            ts: "1700000002.000100",
            message: {
              type: "message",
              text: "summary",
              ts: "1700000002.000100",
              thread_ts: "1700000001.000100",
            },
          }),
          { status: 200 },
        );
      },
      { preconnect: originalFetch.preconnect },
    );
    globalThis.fetch = mockedFetch;

    const result = await runCliWithBuffer(
      [
        "messages",
        "reply",
        "C123",
        "1700000001.000100",
        "summary",
        "--blocks=-",
        "--json",
        "--xoxb",
      ],
      { stdin: "# title\nreply block from stdin" },
    );

    expect(result.exitCode).toBe(0);
    expect(Array.isArray(capturedBlocks)).toBe(true);
    expect((capturedBlocks as unknown[]).length).toBeGreaterThan(0);
  });
});
