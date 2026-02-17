import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createReactionsAddHandler } from "../handlers/reactions-add";
import { createSlackClientError } from "../slack";

describe("reactions add command", () => {
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
    const result = await runCliWithBuffer(["reactions", "add", "--json"]);

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

  test("returns missing argument when timestamp is absent", async () => {
    const result = await runCliWithBuffer(["reactions", "add", "C123", "--json"]);

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
    expect(parsed.error.message).toContain("MISSING_ARGUMENT");
    expect(parsed.error.message).toContain("<timestamp>");
  });

  test("returns missing argument when emoji name is absent", async () => {
    const result = await runCliWithBuffer([
      "reactions",
      "add",
      "C123",
      "1700000001.000100",
      "--json",
    ]);

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
    expect(parsed.error.message).toContain("MISSING_ARGUMENT");
    expect(parsed.error.message).toContain("<emoji-name>");
  });

  test("adds reaction and returns expected payload with --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/reactions.add");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("timestamp")).toBe("1700000001.000100");
        expect(params.get("name")).toBe("thumbsup");

        return new Response(
          JSON.stringify({
            ok: true,
            type: "message",
            channel: "C123",
            message: {
              ts: "1700000001.000100",
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
      "reactions",
      "add",
      "C123",
      "1700000001.000100",
      "thumbsup",
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
    expect(parsed.command).toBe("reactions.add");
    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    const firstLine = parsed.textLines[0];
    expect(typeof firstLine).toBe("string");
    if (typeof firstLine !== "string") {
      return;
    }

    expect(firstLine).toContain("C123");
    expect(firstLine).toContain("1700000001.000100");
    expect(firstLine).toContain("thumbsup");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.channel).toBe("C123");
    expect(parsed.data.timestamp).toBe("1700000001.000100");
    expect(parsed.data.name).toBe("thumbsup");
  });

  test("maps SLACK_API_ERROR to invalid argument with marker", async () => {
    const handler = createReactionsAddHandler({
      env: {},
      createClient: () => ({
        addReaction: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: channel_not_found.",
            hint: "Verify channel id and scopes.",
            details: "channel_not_found",
          });
        },
        removeReaction: async () => {
          return {
            channel: "C123",
            ts: "1700000001.000100",
            name: "thumbsup",
          };
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["reactions", "add"],
      positionals: ["C999", "1700000001.000100", "thumbsup"],
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
