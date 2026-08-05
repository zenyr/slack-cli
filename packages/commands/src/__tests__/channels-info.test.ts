import { describe, expect, test } from "bun:test";

import { createChannelsInfoHandler } from "../handlers/channels-info";
import { createSlackClientError } from "../slack";
import type { CommandRequest } from "../types";

const request = (channel: string): CommandRequest => ({
  commandPath: ["channels", "info"],
  positionals: [channel],
  options: {},
  flags: { json: true, help: false, version: false, xoxp: true, xoxb: false },
  context: { version: "test" },
});

describe("channels info name resolution", () => {
  test("resolves a name before fetching info", async () => {
    let fetched = "";
    const handler = createChannelsInfoHandler({
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        listChannels: async () => ({
          channels: [{ id: "C123", name: "product", isPrivate: false, isArchived: false }],
        }),
        fetchChannelInfo: async (channelId) => {
          fetched = channelId;
          return {
            channel: { id: channelId, name: "product", isPrivate: false, isArchived: false },
          };
        },
      }),
    });

    const result = await handler(request("#product"));

    expect(result.ok).toBe(true);
    expect(fetched).toBe("C123");
  });

  test("preserves required scope metadata", async () => {
    const handler = createChannelsInfoHandler({
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        listChannels: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: missing_scope.",
            hint: "Grant the required Slack scope: channels:read.",
            needed: "channels:read",
            provided: "chat:write",
          });
        },
        fetchChannelInfo: async () => {
          throw new Error("must not fetch channel info");
        },
      }),
    });

    const result = await handler(request("product"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.needed).toBe("channels:read");
    expect(result.error.provided).toBe("chat:write");
    expect(result.error.hint).toContain("channels:read");
  });
});
