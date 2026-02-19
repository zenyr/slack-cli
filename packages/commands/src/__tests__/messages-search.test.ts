import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createMessagesSearchHandler } from "../handlers/messages-search";
import { createSlackClientError } from "../slack";

describe("messages search command", () => {
  const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
  const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  const originalXoxpToken = process.env[XOXP_ENV_KEY];
  const originalXoxbToken = process.env[XOXB_ENV_KEY];

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;

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

  test("builds query with all message filters in stable order", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/search.messages");

        const request = new URL(requestUrl, "https://slack.com");
        expect(request.searchParams.get("query")).toBe(
          "deploy done in:ops from:alice after:2026-01-03 before:2026-02-10 is:thread",
        );

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: {
              total: 3,
              matches: [],
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
      "search",
      "deploy",
      "done",
      "--before",
      "2026-02-10",
      "--channel",
      "ops",
      "--threads",
      "--user",
      "alice",
      "--after",
      "2026-01-03",
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
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.query).toBe(
      "deploy done in:ops from:alice after:2026-01-03 before:2026-02-10 is:thread",
    );
    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    expect(parsed.textLines).toContain(
      "Applied filters: in:ops, from:alice, after:2026-01-03, before:2026-02-10, is:thread",
    );
  });

  test("normalizes Slack message URL query into deterministic search query", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/search.messages");

        const request = new URL(requestUrl, "https://slack.com");
        expect(request.searchParams.get("query")).toBe("in:C12345678 1700000000.000100");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: {
              total: 1,
              matches: [],
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
      "search",
      "https://acme.slack.com/archives/C12345678/p1700000000000100",
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
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.query).toBe("in:C12345678 1700000000.000100");
  });

  test("returns invalid argument for unsupported Slack URL path", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "search",
      "https://acme.slack.com/client/T123/C123",
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
    expect(parsed.error.message).toContain("invalid messages search URL query");
    expect(parsed.error.hint).toContain("/archives/<channel-id>/p<message-ts>");
  });

  test("returns invalid argument for malformed --after date", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "search",
      "deploy",
      "--after",
      "2026-02-30",
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
    if (isRecord(parsed.error) === false) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.hint).toContain("YYYY-MM-DD");
  });

  test("normalizes relative --after and --before values into calendar dates", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];
    Date.now = () => Date.UTC(2026, 1, 15, 12, 0, 0);

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/search.messages");

        const request = new URL(requestUrl, "https://slack.com");
        expect(request.searchParams.get("query")).toBe("deploy after:2026-02-08 before:2026-02-14");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            messages: {
              total: 1,
              matches: [],
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
      "search",
      "deploy",
      "--after",
      "1w",
      "--before",
      "1d",
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
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.query).toBe("deploy after:2026-02-08 before:2026-02-14");
  });

  test("returns invalid argument for unsupported relative --after value", async () => {
    const result = await runCliWithBuffer([
      "messages",
      "search",
      "deploy",
      "--after",
      "2w",
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
    if (isRecord(parsed.error) === false) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.hint).toContain("1d, 1w, 30d, 90d");
  });

  test("returns invalid argument for bot token", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxb-test",
        source: "SLACK_MCP_XOXB_TOKEN",
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
          });
        },
        fetchChannelHistory: async () => ({
          channel: "",
          messages: [],
        }),
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
    expect(result.error.message).toContain("invalid_auth");
  });

  test("returns invalid argument for unclassified xoxc edge token", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxc-edge-test",
        source: "store:active",
      }),
      createClient: () => {
        throw new Error("createClient should not be called for xoxc token");
      },
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
    expect(result.error.message).toContain("does not support edge API tokens");
    expect(result.error.hint).toContain("Edge API token path is not yet supported");
  });

  test("returns invalid argument for unclassified xoxd edge token", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxd-edge-test",
        source: "store:fallback",
      }),
      createClient: () => {
        throw new Error("createClient should not be called for xoxd token");
      },
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
    expect(result.error.message).toContain("does not support edge API tokens");
    expect(result.error.hint).toContain("Edge API token path is not yet supported");
  });

  test("returns invalid argument for xoxc edge token classified as xoxp", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxc-edge-test",
        source: "SLACK_MCP_XOXP_TOKEN",
        tokenType: "xoxp",
      }),
      createClient: () => {
        throw new Error("createClient should not be called for xoxc token");
      },
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
    expect(result.error.message).toContain("does not support edge API tokens");
    expect(result.error.hint).toContain("Edge API token path is not yet supported");
  });

  test("returns invalid argument for xoxd edge token classified as xoxp", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxd-edge-test",
        source: "env:SLACK_MCP_XOXP_TOKEN",
        tokenType: "xoxp",
      }),
      createClient: () => {
        throw new Error("createClient should not be called for xoxd token");
      },
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
    expect(result.error.message).toContain("does not support edge API tokens");
    expect(result.error.hint).toContain("Edge API token path is not yet supported");
  });

  const deterministicSlackErrorCases = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      slackCode: "SLACK_CONFIG_ERROR",
      message: "Search query is empty.",
      hint: "Provide non-empty query for messages search.",
      details: undefined,
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT with [AUTH_ERROR] marker",
      slackCode: "SLACK_AUTH_ERROR",
      message: "Slack authentication failed: invalid_auth. [AUTH_ERROR]",
      hint: "Use a valid token with required scopes.",
      details: undefined,
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: "[AUTH_ERROR]",
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT with [SLACK_API_ERROR] marker",
      slackCode: "SLACK_API_ERROR",
      message:
        "Slack API request failed: channel_not_found. [SLACK_API_ERROR] detail=channel_not_found",
      hint: "Verify query input and token scopes.",
      details: "channel_not_found",
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: "[SLACK_API_ERROR]",
      expectedDetail: "channel_not_found",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR",
      slackCode: "SLACK_HTTP_ERROR",
      message: "Slack HTTP transport failed with status 503.",
      hint: "Retry with narrower query scope.",
      details: undefined,
      expectedCliCode: "INTERNAL_ERROR",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR",
      slackCode: "SLACK_RESPONSE_ERROR",
      message: "Slack response payload was not valid JSON.",
      hint: "Inspect proxy/response rewrite layers.",
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
                code: slackCode,
                message,
                hint,
                details,
              });
            },
            fetchChannelHistory: async () => ({
              channel: "",
              messages: [],
            }),
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

        expect(result.error.code).toBe(expectedCliCode);
        expect(result.error.hint).toBe(hint);

        if (expectedMarker === undefined) {
          expect(result.error.message).not.toContain("[AUTH_ERROR]");
          expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
        } else {
          expect(result.error.message).toContain(expectedMarker);
        }

        if (expectedDetail !== undefined) {
          expect(result.error.message).toContain(expectedDetail);
        }
      });
    },
  );
});
