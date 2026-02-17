import { describe, expect, test } from "bun:test";

import { resolveSlackTokenFromEnv } from "../slack";

describe("resolveSlackTokenFromEnv", () => {
  test("prefers user token over bot token", () => {
    const token = resolveSlackTokenFromEnv({
      SLACK_MCP_XOXP_TOKEN: "xoxp-123",
      SLACK_MCP_XOXB_TOKEN: "xoxb-456",
    });

    expect(token.source).toBe("SLACK_MCP_XOXP_TOKEN");
    expect(token.token).toBe("xoxp-123");
  });

  test("falls back to bot token when user token is missing", () => {
    const token = resolveSlackTokenFromEnv({
      SLACK_MCP_XOXB_TOKEN: "xoxb-456",
    });

    expect(token.source).toBe("SLACK_MCP_XOXB_TOKEN");
    expect(token.token).toBe("xoxb-456");
  });

  test("throws config error when both tokens are missing", () => {
    expect(() => resolveSlackTokenFromEnv({})).toThrow("Slack token is not configured.");
  });
});
