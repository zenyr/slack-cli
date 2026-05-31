import { describe, expect, test } from "bun:test";

import { createMessagesUnreadsHandler } from "../handlers/messages-unreads";
import type { CommandRequest } from "../types";

const baseRequest = (overrides: Partial<CommandRequest> = {}): CommandRequest => ({
  commandPath: ["messages", "unreads"],
  positionals: [],
  options: {},
  flags: { json: true, help: false, version: false, xoxp: false, xoxb: false },
  context: { version: "test" },
  ...overrides,
});

describe("messages unreads command", () => {
  test("rejects bot token", async () => {
    const handler = createMessagesUnreadsHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxb-test",
        source: "SLACK_MCP_XOXB_TOKEN",
        tokenType: "xoxb",
      }),
    });

    const result = await handler(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("requires a user token");
  });

  test("returns unread channels from xoxp fallback scan", async () => {
    const handler = createMessagesUnreadsHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxp-test",
        source: "SLACK_MCP_XOXP_TOKEN",
        tokenType: "xoxp",
      }),
      createClient: () => ({
        listUsers: async () => ({ users: [] }),
        searchMessages: async (query) => ({ query, total: 0, messages: [] }),
        listChannels: async ({ types }) => ({
          channels:
            types[0] === "im"
              ? [{ id: "D123", name: "alice", isPrivate: true, isArchived: false }]
              : [],
        }),
        fetchChannelInfo: async () => ({
          channel: {
            id: "D123",
            name: "alice",
            isPrivate: true,
            isArchived: false,
            lastRead: "1700000000.000000",
            unreadCount: 1,
          },
        }),
        fetchChannelHistory: async () => ({
          channel: "D123",
          messages: [{ type: "message", user: "U1", text: "hello", ts: "1700000001.000000" }],
        }),
      }),
    });

    const result = await handler(baseRequest({ options: { "max-channels": "2" } }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toBe("messages.unreads");
    expect(result.textLines?.[0]).toContain("1 channels");
  });
});
