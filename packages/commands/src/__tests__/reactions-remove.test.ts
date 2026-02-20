import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createReactionsRemoveHandler } from "../handlers/reactions-remove";
import { createSlackClientError } from "../slack";

const createRequest = (positionals: string[]) => {
  return {
    commandPath: ["reactions", "remove"],
    positionals,
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
  };
};

describe("reactions remove handler", () => {
  const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
  const originalXoxbToken = process.env[XOXB_ENV_KEY];

  beforeEach(() => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";
  });

  afterEach(() => {
    if (originalXoxbToken === undefined) {
      delete process.env[XOXB_ENV_KEY];
    } else {
      process.env[XOXB_ENV_KEY] = originalXoxbToken;
    }
  });

  test("routes reactions remove command and returns INVALID_ARGUMENT for missing channel", async () => {
    const result = await runCliWithBuffer(["reactions", "remove", "--json", "--xoxb"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

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
    expect(parsed.error.message).toContain("<channel-id>");
  });

  test("requires explicit token type selection", async () => {
    const result = await runCliWithBuffer([
      "reactions",
      "remove",
      "C123",
      "1700000000.000001",
      "eyes",
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

  test("help metadata exposes reactions remove args only", async () => {
    const result = await runCliWithBuffer(["help", "reactions", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    const lines = parsed.textLines.filter((line): line is string => typeof line === "string");
    const removeLine = lines.find((line) =>
      line.includes("remove <channel-id> <timestamp> <emoji-name> [--json]"),
    );
    expect(removeLine).toBeDefined();
    expect(removeLine).not.toContain("--channel");
    expect(removeLine).not.toContain("--timestamp");
    expect(removeLine).not.toContain("--name");
  });

  test("returns INVALID_ARGUMENT with usage hint when channel is missing", async () => {
    const handler = createReactionsRemoveHandler();

    const result = await handler(createRequest(["", "1700000000.000001", "eyes"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("<channel-id>");
    expect(result.error.message).toContain("MISSING_ARGUMENT");
    expect(result.error.hint).toContain("Usage: slack reactions remove");
  });

  test("returns INVALID_ARGUMENT with usage hint when timestamp format is invalid", async () => {
    const handler = createReactionsRemoveHandler();

    const result = await handler(createRequest(["C123", "1700000000", "eyes"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("<timestamp>");
    expect(result.error.message).toContain("1700000000");
    expect(result.error.hint).toContain("Usage: slack reactions remove");
  });

  test("returns INVALID_ARGUMENT with usage hint when emoji name has whitespace", async () => {
    const handler = createReactionsRemoveHandler();

    const result = await handler(createRequest(["C123", "1700000000.000001", "party parrot"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("<emoji-name>");
    expect(result.error.message).toContain("party parrot");
    expect(result.error.hint).toContain("Usage: slack reactions remove");
  });

  test("returns success payload with command id reactions.remove", async () => {
    let calledChannel = "";
    let calledTimestamp = "";
    let calledName = "";

    const handler = createReactionsRemoveHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        addReaction: async () => ({ channel: "", ts: "", name: "" }),
        removeReaction: async ({ channel, timestamp, name }) => {
          calledChannel = channel;
          calledTimestamp = timestamp;
          calledName = name;
          return {
            channel: "C123",
            ts: "1700000000.000001",
            name: "eyes",
          };
        },
      }),
    });

    const result = await handler(createRequest([" C123 ", " 1700000000.000001 ", " eyes "]));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("reactions.remove");
    expect(calledChannel).toBe("C123");
    expect(calledTimestamp).toBe("1700000000.000001");
    expect(calledName).toBe("eyes");
    expect(result.data).toEqual({
      channel: "C123",
      timestamp: "1700000000.000001",
      name: "eyes",
    });
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
        const handler = createReactionsRemoveHandler({
          env: {},
          resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
          createClient: () => ({
            addReaction: async () => ({ channel: "", ts: "", name: "" }),
            removeReaction: async () => {
              throw createSlackClientError({
                code: slackCode,
                message,
                hint,
                details,
              });
            },
          }),
        });

        const result = await handler(createRequest(["C999", "1700000000.000001", "eyes"]));

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
