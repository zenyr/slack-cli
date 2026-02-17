import { describe, expect, test } from "bun:test";

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
    },
    context: {
      version: "1.2.3",
    },
  };
};

describe("reactions remove handler", () => {
  test("routes reactions remove command and returns INVALID_ARGUMENT for missing channel", async () => {
    const result = await runCliWithBuffer(["reactions", "remove", "--json"]);

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

  test("maps SLACK_API_ERROR to INVALID_ARGUMENT with SLACK_API_ERROR marker", async () => {
    const handler = createReactionsRemoveHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        addReaction: async () => ({ channel: "", ts: "", name: "" }),
        removeReaction: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: channel_not_found.",
            hint: "Verify channel id and scopes.",
            details: "channel_not_found",
          });
        },
      }),
    });

    const result = await handler(createRequest(["C999", "1700000000.000001", "eyes"]));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("SLACK_API_ERROR");
    expect(result.error.message).toContain("channel_not_found");
  });
});
