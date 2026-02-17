import { describe, expect, test } from "bun:test";

import { evaluatePostChannelPolicy } from "../messages-post/policy";

describe("evaluatePostChannelPolicy", () => {
  test("allows channel when both lists are empty", () => {
    const result = evaluatePostChannelPolicy("C12345678", {});

    expect(result).toEqual({ allowed: true });
  });

  test("denies when channel is included in denylist", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_DENYLIST: "C12345678,C87654321",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SLACK_MCP_POST_CHANNEL_DENYLIST");
  });

  test("denies when allowlist exists and channel is missing", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_ALLOWLIST: "C11111111,C22222222",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SLACK_MCP_POST_CHANNEL_ALLOWLIST");
  });

  test("allows when channel is included in allowlist", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_ALLOWLIST: "C11111111,C12345678",
    });

    expect(result).toEqual({ allowed: true });
  });

  test("denylist takes precedence over allowlist", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_ALLOWLIST: "C12345678",
      SLACK_MCP_POST_CHANNEL_DENYLIST: "C12345678",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SLACK_MCP_POST_CHANNEL_DENYLIST");
  });

  test("trims entries and ignores empty values", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_ALLOWLIST: "  , C12345678 , , C87654321  ",
      SLACK_MCP_POST_CHANNEL_DENYLIST: "  ,   ",
    });

    expect(result).toEqual({ allowed: true });
  });

  test("denies invalid channel id input", () => {
    const result = evaluatePostChannelPolicy("not-a-channel", {});

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("invalid channel id: not-a-channel");
  });

  test("denies invalid denylist channel id", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_DENYLIST: "invalid,C99999999",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("invalid denylist channel id: invalid");
  });

  test("denies invalid allowlist channel id", () => {
    const result = evaluatePostChannelPolicy("C12345678", {
      SLACK_MCP_POST_CHANNEL_ALLOWLIST: "C11111111,invalid",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("invalid allowlist channel id: invalid");
  });
});
