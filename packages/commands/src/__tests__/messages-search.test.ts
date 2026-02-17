import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createMessagesSearchHandler } from "../handlers/messages-search";
import { createSlackClientError } from "../slack";

describe("messages search command", () => {
  const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
  const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxpToken = process.env[XOXP_ENV_KEY];
  const originalXoxbToken = process.env[XOXB_ENV_KEY];

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

  test("returns invalid argument when query is missing", async () => {
    const result = await runCliWithBuffer(["messages", "search", "--json"]);

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
  });

  test("returns messages search success payload for messages search --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/search.messages");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: {
              total: 1,
              matches: [
                {
                  text: "deploy done",
                  ts: "1700000000.000100",
                  channel: {
                    id: "C123",
                    name: "ops",
                  },
                },
              ],
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

    const result = await runCliWithBuffer(["messages", "search", "deploy", "done", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("messages.search");
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.query).toBe("deploy done");
    expect(parsed.data.total).toBe(1);
  });

  test("returns invalid argument for bot token", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxb-test",
        source: "SLACK_MCP_XOXB_TOKEN",
      }),
    });

    const result = await handler({
      commandPath: ["messages", "search"],
      positionals: ["deploy"],
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
    expect(result.error.message).toContain("user token");
  });

  test("maps slack auth error to invalid argument", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxp-test",
        source: "SLACK_MCP_XOXP_TOKEN",
      }),
      createClient: () => ({
        listChannels: async () => ({
          channels: [],
        }),
        listUsers: async () => ({
          users: [],
        }),
        searchMessages: async () => {
          throw createSlackClientError({
            code: "SLACK_AUTH_ERROR",
            message: "Slack authentication failed: invalid_auth.",
            hint: "Use a valid token.",
          });
        },
      }),
    });

    const result = await handler({
      commandPath: ["messages", "search"],
      positionals: ["deploy"],
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
    expect(result.error.hint).toBe("Use a valid token.");
  });
});
