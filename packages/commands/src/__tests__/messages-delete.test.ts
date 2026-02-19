import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("messages delete command", () => {
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
    const result = await runCliWithBuffer(["messages", "delete", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("<channel-id>");
  });

  test("returns invalid argument when timestamp format is invalid", async () => {
    const result = await runCliWithBuffer(["messages", "delete", "C123", "not-a-ts", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("seconds.fraction");
  });

  test("deletes message and returns payload with --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.delete");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("ts")).toBe("1700000001.000100");

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
      "delete",
      "C123",
      "1700000001.000100",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.command).toBe("messages.delete");
    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.ts).toBe("1700000001.000100");
  });

  test("deletes message from canonical permalink", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/chat.delete");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C12345678");
        expect(params.get("ts")).toBe("1700000000.123456");

        return new Response(
          JSON.stringify({
            ok: true,
            channel: "C12345678",
            ts: "1700000000.123456",
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
      "delete",
      "https://acme.slack.com/archives/C12345678/p1700000000123456",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C12345678");
    expect(parsed.data.ts).toBe("1700000000.123456");
  });
});
