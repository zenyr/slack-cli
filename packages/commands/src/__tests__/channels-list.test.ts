import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createChannelsListHandler } from "../handlers/channels-list";
import type { SlackChannel } from "../slack";
import { createSlackClientError } from "../slack";

const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";

const originalFetch = globalThis.fetch;
const originalXoxpToken = process.env[XOXP_ENV_KEY];
const originalXoxbToken = process.env[XOXB_ENV_KEY];

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

describe("channels list command", () => {
  test("returns channels list success payload with mocked fetch", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [
              {
                id: "C123",
                name: "general",
                is_private: false,
                is_archived: false,
                num_members: 42,
              },
            ],
            response_metadata: {
              next_cursor: "",
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

    const result = await runCliWithBuffer(["channels", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("channels.list");
    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    const channels = parsed.data.channels;
    expect(Array.isArray(channels)).toBe(true);
    if (!Array.isArray(channels)) {
      return;
    }

    expect(channels.length).toBe(1);
    const first = channels[0];
    expect(isRecord(first)).toBe(true);
    if (!isRecord(first)) {
      return;
    }

    expect(first.id).toBe("C123");
    expect(first.name).toBe("general");
  });

  test("returns config error when Slack token is missing", async () => {
    delete process.env[XOXP_ENV_KEY];
    delete process.env[XOXB_ENV_KEY];

    const handler = createChannelsListHandler({
      createClient: () => {
        throw createSlackClientError({
          code: "SLACK_CONFIG_ERROR",
          message: "Slack token is not configured.",
          hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
        });
      },
    });

    const result = await handler({
      commandPath: ["channels", "list"],
      positionals: [],
      options: {},
      flags: {
        json: true,
        help: false,
        version: false,
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("Slack token is not configured.");
  });

  // ===== Unit 2 Tests =====

  describe("type filtering", () => {
    test("filters channels by single type (public)", async () => {
      const allChannels: SlackChannel[] = [
        {
          id: "C1",
          name: "public-channel",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
        {
          id: "C2",
          name: "private-channel",
          isPrivate: true,
          isArchived: false,
          memberCount: 5,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async (opts: any) => {
              const filtered = allChannels.filter((ch) => {
                if (opts.types.includes("public") && !ch.isPrivate) return true;
                if (opts.types.includes("private") && ch.isPrivate) return true;
                return false;
              });
              return { channels: filtered };
            },
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "public" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels).toHaveLength(1);
      expect(data.channels[0].name).toBe("public-channel");
    });

    test("filters channels by single type (private)", async () => {
      const allChannels: SlackChannel[] = [
        {
          id: "C1",
          name: "public-channel",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
        {
          id: "C2",
          name: "private-channel",
          isPrivate: true,
          isArchived: false,
          memberCount: 5,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async (opts: any) => {
              const filtered = allChannels.filter((ch) => {
                if (opts.types.includes("public") && !ch.isPrivate) return true;
                if (opts.types.includes("private") && ch.isPrivate) return true;
                return false;
              });
              return { channels: filtered };
            },
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "private" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels).toHaveLength(1);
      expect(data.channels[0].name).toBe("private-channel");
    });

    test("filters channels by comma-separated types (public,private)", async () => {
      const allChannels: SlackChannel[] = [
        {
          id: "C1",
          name: "public-channel",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
        {
          id: "C2",
          name: "private-channel",
          isPrivate: true,
          isArchived: false,
          memberCount: 5,
        },
        {
          id: "C3",
          name: "im-channel",
          isPrivate: true,
          isArchived: false,
          memberCount: 1,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async (opts: any) => {
              expect(opts.types).toEqual(["public", "private"]);
              const filtered = allChannels.filter((ch) => {
                if (opts.types.includes("public") && !ch.isPrivate) return true;
                if (opts.types.includes("private") && ch.isPrivate) return true;
                return false;
              });
              return { channels: filtered };
            },
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "public,private" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
    });

    test("filters channels by comma-separated types with spaces", async () => {
      const allChannels: SlackChannel[] = [
        {
          id: "C1",
          name: "public-channel",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "im-channel",
          isPrivate: true,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async (opts: any) => {
              expect(opts.types).toEqual(["public", "im"]);
              return { channels: allChannels };
            },
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "public , im" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
    });

    test("returns INVALID_ARGUMENT for invalid type", async () => {
      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels: [] }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "invalid" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("invalid type value");
    });

    test("returns INVALID_ARGUMENT for partially invalid comma-separated types", async () => {
      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels: [] }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "public,invalid,private" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("invalid type value");
    });
  });

  describe("popularity sorting", () => {
    test("sorts channels by member_count descending", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "alpha",
          isPrivate: false,
          isArchived: false,
          memberCount: 5,
        },
        {
          id: "C2",
          name: "beta",
          isPrivate: false,
          isArchived: false,
          memberCount: 20,
        },
        {
          id: "C3",
          name: "gamma",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { sort: "popularity" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels[0].name).toBe("beta");
      expect(data.channels[0].memberCount).toBe(20);
      expect(data.channels[1].name).toBe("gamma");
      expect(data.channels[1].memberCount).toBe(10);
      expect(data.channels[2].name).toBe("alpha");
      expect(data.channels[2].memberCount).toBe(5);
    });

    test("breaks ties in popularity sort by name ascending", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "zebra",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
        {
          id: "C2",
          name: "apple",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
        {
          id: "C3",
          name: "mango",
          isPrivate: false,
          isArchived: false,
          memberCount: 10,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { sort: "popularity" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels[0].name).toBe("apple");
      expect(data.channels[1].name).toBe("mango");
      expect(data.channels[2].name).toBe("zebra");
    });

    test("handles channels with undefined memberCount in popularity sort", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "with-count",
          isPrivate: false,
          isArchived: false,
          memberCount: 15,
        },
        {
          id: "C2",
          name: "no-count",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C3",
          name: "zero-count",
          isPrivate: false,
          isArchived: false,
          memberCount: 0,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { sort: "popularity" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels[0].name).toBe("with-count");
      expect(data.channels[0].memberCount).toBe(15);
    });
  });

  describe("cursor-based pagination", () => {
    test("returns next_cursor in JSON when more channels exist", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "channel2",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C3",
          name: "channel3",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "2" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels).toHaveLength(2);
      expect(data.next_cursor).toBeDefined();
      expect(typeof data.next_cursor).toBe("string");
      expect(data.next_cursor.length).toBeGreaterThan(0);
    });

    test("does not return next_cursor when at end of list", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "channel2",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "10" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.next_cursor).toBeUndefined();
    });

    test("includes Next cursor line in text output when more channels exist", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "channel2",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C3",
          name: "channel3",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "1" },
        flags: { json: false, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const hasNextCursorLine = result.textLines?.some((line) => line.startsWith("Next cursor: "));
      expect(hasNextCursorLine).toBe(true);
    });

    test("does not include Next cursor line in text output when at end", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "10" },
        flags: { json: false, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const hasNextCursorLine = result.textLines?.some((line) => line.startsWith("Next cursor: "));
      expect(hasNextCursorLine).toBe(false);
    });

    test("cursor is base64 encoded channel ID", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "channel2",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "1" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      const cursorB64 = data.next_cursor;
      expect(cursorB64).toBeDefined();
      const decoded = Buffer.from(cursorB64, "base64").toString("utf-8");
      expect(decoded).toBe("C1");
    });

    test("uses cursor to paginate to next batch", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "channel2",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C3",
          name: "channel3",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const cursorB64 = Buffer.from("C1", "utf-8").toString("base64");

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "1", cursor: cursorB64 },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels).toHaveLength(1);
      expect(data.channels[0].name).toBe("channel2");
    });

    test("returns error for stale cursor", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "channel1",
          isPrivate: false,
          isArchived: false,
        },
        {
          id: "C2",
          name: "channel2",
          isPrivate: false,
          isArchived: false,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels }),
          }) as any,
      });

      const staleCursorB64 = Buffer.from("C999", "utf-8").toString("base64");

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { cursor: staleCursorB64 },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("cursor references non-existent channel");
    });
  });

  describe("validation errors", () => {
    test("returns INVALID_ARGUMENT for non-positive limit", async () => {
      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels: [] }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "0" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("limit must be an integer > 0");
    });

    test("returns INVALID_ARGUMENT for negative limit", async () => {
      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels: [] }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "-5" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("limit must be an integer > 0");
    });

    test("returns INVALID_ARGUMENT for non-numeric limit", async () => {
      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels: [] }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "abc" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("limit must be an integer > 0");
    });

    test("returns INVALID_ARGUMENT when limit has leading zeros", async () => {
      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async () => ({ channels: [] }),
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { limit: "05" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_ARGUMENT");
    });
  });

  describe("combined operations", () => {
    test("type filter + popularity sort + pagination", async () => {
      const channels: SlackChannel[] = [
        {
          id: "C1",
          name: "public-high",
          isPrivate: false,
          isArchived: false,
          memberCount: 100,
        },
        {
          id: "C2",
          name: "private-high",
          isPrivate: true,
          isArchived: false,
          memberCount: 50,
        },
        {
          id: "C3",
          name: "public-low",
          isPrivate: false,
          isArchived: false,
          memberCount: 5,
        },
      ];

      const handler = createChannelsListHandler({
        createClient: () =>
          ({
            listChannels: async (opts: any) => {
              expect(opts.types).toEqual(["public"]);
              return { channels };
            },
          }) as any,
      });

      const result = await handler({
        commandPath: ["channels", "list"],
        positionals: [],
        options: { type: "public", sort: "popularity", limit: "1" },
        flags: { json: true, help: false, version: false },
        context: { version: "1.2.3" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as any;
      expect(data.channels).toHaveLength(1);
      expect(data.channels[0].name).toBe("public-high");
      expect(data.next_cursor).toBeDefined();
    });
  });
});
