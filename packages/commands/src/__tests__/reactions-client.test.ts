import { afterEach, describe, expect, test } from "bun:test";

import { createSlackWebApiClient } from "../slack";

describe("reactions client path", () => {
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

  test("addReaction calls reactions.add and maps response", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/reactions.add");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");
        expect(headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("channel")).toBe("C123");
        expect(params.get("timestamp")).toBe("1700000000.000001");
        expect(params.get("name")).toBe("thumbsup");

        return new Response(
          JSON.stringify({
            ok: true,
            type: "message",
            channel: "C123",
            message: {
              ts: "1700000000.000001",
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
    const result = await client.addReaction({
      channel: "C123",
      timestamp: "1700000000.000001",
      name: "thumbsup",
    });

    expect(result).toEqual({
      channel: "C123",
      ts: "1700000000.000001",
      name: "thumbsup",
    });
  });

  test("removeReaction calls reactions.remove and maps response", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/reactions.remove");

        return new Response(
          JSON.stringify({
            ok: true,
            type: "message",
            channel: "C456",
            message: {
              ts: "1700000002.000003",
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
    const result = await client.removeReaction({
      channel: "C456",
      timestamp: "1700000002.000003",
      name: "eyes",
    });

    expect(result).toEqual({
      channel: "C456",
      ts: "1700000002.000003",
      name: "eyes",
    });
  });

  test("addReaction rejects empty reaction name", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const client = createSlackWebApiClient();

    await expect(
      client.addReaction({
        channel: "C123",
        timestamp: "1700000000.000001",
        name: "   ",
      }),
    ).rejects.toMatchObject({
      code: "SLACK_CONFIG_ERROR",
    });
  });

  test("removeReaction rejects invalid timestamp format", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const client = createSlackWebApiClient();

    await expect(
      client.removeReaction({
        channel: "C123",
        timestamp: "1700000000",
        name: "eyes",
      }),
    ).rejects.toMatchObject({
      code: "SLACK_CONFIG_ERROR",
    });
  });

  test("addReaction rejects malformed response payload", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            type: "message",
            channel: "C123",
            message: {},
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

    await expect(
      client.addReaction({
        channel: "C123",
        timestamp: "1700000000.000001",
        name: "thumbsup",
      }),
    ).rejects.toMatchObject({
      code: "SLACK_RESPONSE_ERROR",
    });
  });

  test("addReaction maps transport rate limit to Slack HTTP error", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response("", {
          status: 429,
          headers: {
            "retry-after": "7",
          },
        });
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockedFetch;

    const client = createSlackWebApiClient();

    await expect(
      client.addReaction({
        channel: "C123",
        timestamp: "1700000000.000001",
        name: "thumbsup",
      }),
    ).rejects.toMatchObject({
      code: "SLACK_HTTP_ERROR",
      message: "Slack API rate limit reached.",
      hint: "Retry later or narrow query scope.",
      status: 429,
      retryAfterSeconds: 7,
    });
  });

  test("removeReaction maps auth-related API failure to Slack auth error", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "invalid_auth",
            needed: "reactions:write",
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

    await expect(
      client.removeReaction({
        channel: "C456",
        timestamp: "1700000002.000003",
        name: "eyes",
      }),
    ).rejects.toMatchObject({
      code: "SLACK_AUTH_ERROR",
      message: "Slack authentication failed: invalid_auth.",
      hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
      details: "reactions:write",
    });
  });

  test("removeReaction maps Slack API error payload", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "channel_not_found",
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

    try {
      await client.removeReaction({
        channel: "C999",
        timestamp: "1700000000.000001",
        name: "eyes",
      });
      throw new Error("Expected removeReaction to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        return;
      }

      expect(Reflect.get(error, "code")).toBe("SLACK_API_ERROR");
      expect(error.message).toContain("channel_not_found");
    }
  });
});
