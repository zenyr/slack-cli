import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createReactionsAddHandler } from "../handlers/reactions-add";
import { createSlackClientError } from "../slack";

describe("reactions add command", () => {
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

  test("returns missing argument when channel id is absent", async () => {
    const result = await runCliWithBuffer(["reactions", "add", "--json", "--xoxb"]);

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
    const result = await runCliWithBuffer(["reactions", "add", "C123", "--json", "--xoxb"]);

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
      "--xoxb",
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

  test("requires explicit token type selection", async () => {
    const result = await runCliWithBuffer([
      "reactions",
      "add",
      "C123",
      "1700000001.000100",
      "thumbsup",
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

  test("adds reaction and returns expected payload with --json", async () => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/reactions.add");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxb-test-token");

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
      "--xoxb",
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

  const deterministicSlackErrorCases = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      slackCode: "SLACK_CONFIG_ERROR",
      message: "Slack token is not configured.",
      hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      details: undefined,
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT with AUTH_ERROR marker",
      slackCode: "SLACK_AUTH_ERROR",
      message: "Slack authentication failed: invalid_auth.",
      hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
      details: undefined,
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: "AUTH_ERROR",
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT with SLACK_API_ERROR marker",
      slackCode: "SLACK_API_ERROR",
      message: "Slack API request failed: channel_not_found.",
      hint: "Verify channel id and scopes.",
      details: "channel_not_found",
      expectedCliCode: "INVALID_ARGUMENT",
      expectedMarker: "SLACK_API_ERROR",
      expectedDetail: "channel_not_found",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      slackCode: "SLACK_HTTP_ERROR",
      message: "Slack HTTP transport failed with status 503.",
      hint: "Check network path and retry.",
      details: undefined,
      expectedCliCode: "INTERNAL_ERROR",
      expectedMarker: undefined,
      expectedDetail: undefined,
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      slackCode: "SLACK_RESPONSE_ERROR",
      message: "Slack response payload missing reaction metadata.",
      hint: "Capture raw response and validate schema assumptions.",
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
        const handler = createReactionsAddHandler({
          env: {},
          createClient: () => ({
            addReaction: async () => {
              throw createSlackClientError({
                code: slackCode,
                message,
                hint,
                details,
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
            xoxp: false,
            xoxb: false,
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
          expect(result.error.message).not.toContain("AUTH_ERROR");
          expect(result.error.message).not.toContain("SLACK_API_ERROR");
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
