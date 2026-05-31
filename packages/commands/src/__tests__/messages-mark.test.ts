import { describe, expect, test } from "bun:test";

import { createMessagesMarkHandler } from "../handlers/messages-mark";
import type { CommandRequest } from "../types";

const baseRequest = (overrides: Partial<CommandRequest> = {}): CommandRequest => ({
  commandPath: ["messages", "mark"],
  positionals: ["C123"],
  options: {},
  flags: { json: true, help: false, version: false, xoxp: false, xoxb: false },
  context: { version: "test" },
  ...overrides,
});

describe("messages mark command", () => {
  test("is disabled unless SLACK_MCP_MARK_TOOL is enabled", async () => {
    const handler = createMessagesMarkHandler({ env: {} });

    const result = await handler(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("MARK_TOOL_DISABLED");
  });

  test("marks provided timestamp", async () => {
    const calls: unknown[] = [];
    const handler = createMessagesMarkHandler({
      env: { SLACK_MCP_MARK_TOOL: "true" },
      resolveToken: () => ({
        token: "xoxp-test",
        source: "SLACK_MCP_XOXP_TOKEN",
        tokenType: "xoxp",
      }),
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async (query) => ({ query, total: 0, messages: [] }),
        fetchChannelHistory: async () => ({ channel: "C123", messages: [] }),
        markConversation: async (params) => {
          calls.push(params);
          return params;
        },
      }),
    });

    const result = await handler(baseRequest({ options: { ts: "1700000000.000001" } }));

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ channel: "C123", ts: "1700000000.000001" }]);
  });
});
