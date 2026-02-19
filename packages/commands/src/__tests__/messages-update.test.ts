import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("messages update command", () => {
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

  test("returns missing argument when message target is absent", async () => {
    const result = await runCliWithBuffer(["messages", "update", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("<channel-id>");
  });

  test("updates message with channel and timestamp", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.update");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("ts")).toBe("1700000001.000100");
        expect(params.get("text")).toBe("Read *docs*");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C123",
            ts: "1700000001.000100",
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
      "update",
      "C123",
      "1700000001.000100",
      "Read",
      "**docs**",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.command).toBe("messages.update");
    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.ts).toBe("1700000001.000100");
  });

  test("updates message from canonical permalink", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.update");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C077NSRSCUR");
        expect(params.get("ts")).toBe("1771461608.515959");
        expect(params.get("text")).toBe("done");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C077NSRSCUR",
            ts: "1771461608.515959",
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
      "update",
      "https://flex-cv82520.slack.com/archives/C077NSRSCUR/p1771461608515959",
      "done",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C077NSRSCUR");
    expect(parsed.data.ts).toBe("1771461608.515959");
  });
});
