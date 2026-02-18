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

  test("keeps xoxp precedence when unsupported edge token is also set", () => {
    const token = resolveSlackTokenFromEnv({
      SLACK_MCP_XOXP_TOKEN: "xoxp-123",
      SLACK_MCP_XOXC_TOKEN: "xoxc-edge",
    });

    expect(token.source).toBe("SLACK_MCP_XOXP_TOKEN");
    expect(token.token).toBe("xoxp-123");
  });

  test("keeps xoxb fallback when unsupported edge token is also set", () => {
    const token = resolveSlackTokenFromEnv({
      SLACK_MCP_XOXB_TOKEN: "xoxb-456",
      SLACK_MCP_XOXD_TOKEN: "xoxd-edge",
    });

    expect(token.source).toBe("SLACK_MCP_XOXB_TOKEN");
    expect(token.token).toBe("xoxb-456");
  });

  test("throws config error when user token prefix does not match env key", () => {
    try {
      resolveSlackTokenFromEnv({
        SLACK_MCP_XOXP_TOKEN: "xoxb-123",
      });
      throw new Error("Expected resolveSlackTokenFromEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        code: "SLACK_CONFIG_ERROR",
        message: "SLACK_MCP_XOXP_TOKEN must start with xoxp.",
        hint: "Set SLACK_MCP_XOXP_TOKEN to a token that starts with xoxp.",
      });
    }
  });

  test("throws config error when bot token prefix does not match env key", () => {
    try {
      resolveSlackTokenFromEnv({
        SLACK_MCP_XOXB_TOKEN: "xoxp-123",
      });
      throw new Error("Expected resolveSlackTokenFromEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        code: "SLACK_CONFIG_ERROR",
        message: "SLACK_MCP_XOXB_TOKEN must start with xoxb.",
        hint: "Set SLACK_MCP_XOXB_TOKEN to a token that starts with xoxb.",
      });
    }
  });

  test("throws config error for xoxc and xoxd token mismatches", () => {
    expect(() =>
      resolveSlackTokenFromEnv({
        SLACK_MCP_XOXP_TOKEN: "xoxc-123",
      }),
    ).toThrow("SLACK_MCP_XOXP_TOKEN must start with xoxp.");

    expect(() =>
      resolveSlackTokenFromEnv({
        SLACK_MCP_XOXB_TOKEN: "xoxd-456",
      }),
    ).toThrow("SLACK_MCP_XOXB_TOKEN must start with xoxb.");
  });

  test("throws config error when both tokens are missing", () => {
    expect(() => resolveSlackTokenFromEnv({})).toThrow("Slack token is not configured.");
  });

  test("throws unsupported-edge config error when only xoxc token is set", () => {
    try {
      resolveSlackTokenFromEnv({
        SLACK_MCP_XOXC_TOKEN: "xoxc-edge",
      });
      throw new Error("Expected resolveSlackTokenFromEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        code: "SLACK_CONFIG_ERROR",
        message: "Slack edge tokens are unsupported in this environment.",
        hint: "Unset SLACK_MCP_XOXC_TOKEN/SLACK_MCP_XOXD_TOKEN and set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
      });
    }
  });

  test("throws unsupported-edge config error when only xoxd token is set", () => {
    expect(() =>
      resolveSlackTokenFromEnv({
        SLACK_MCP_XOXD_TOKEN: "xoxd-edge",
      }),
    ).toThrow("Slack edge tokens are unsupported in this environment.");
  });
});
