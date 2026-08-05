import { describe, expect, test } from "bun:test";

import { createChannelsSearchHandler } from "../handlers/channels-search";
import type { SlackWebApiClient } from "../slack";
import type { CommandRequest } from "../types";

const request = (positionals: string[], query?: string): CommandRequest => ({
  commandPath: ["channels", "search"],
  positionals,
  options: query === undefined ? {} : { query },
  flags: { json: true, help: false, version: false, xoxp: true, xoxb: false },
  context: { version: "test" },
});

describe("channels search query shape", () => {
  test("accepts --query as an alternative to positional query", async () => {
    const handler = createChannelsSearchHandler({
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () =>
        ({
          listChannels: async () => ({
            channels: [{ id: "C123", name: "product", isPrivate: false, isArchived: false }],
          }),
        }) as unknown as SlackWebApiClient,
    });

    const result = await handler(request([], "product"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      channels: [{ id: "C123", name: "product", isPrivate: false, isArchived: false }],
      count: 1,
      query: "product",
    });
  });
});
