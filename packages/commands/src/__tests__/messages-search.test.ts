import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createMessagesSearchHandler } from "../handlers/messages-search";
import { createSlackClientError } from "../slack";

describe("messages search command", () => {
  test("returns invalid argument when query is missing", async () => {
    const result = await runCliWithBuffer(["messages", "search", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    expect(isRecord(parsed.error)).toBe(true);
    if (!isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
  });

  test("returns success result with mocked slack client", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxp-test",
        source: "SLACK_MCP_XOXP_TOKEN",
      }),
      createClient: () => ({
        listChannels: async () => ({
          channels: [],
        }),
        listUsers: async () => ({
          users: [],
        }),
        searchMessages: async (query) => ({
          query,
          total: 1,
          messages: [
            {
              text: "deploy done",
              ts: "1700000000.000100",
              channelName: "ops",
            },
          ],
        }),
      }),
    });

    const result = await handler({
      commandPath: ["messages", "search"],
      positionals: ["deploy", "done"],
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("messages.search");
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.query).toBe("deploy done");
    expect(result.data.total).toBe(1);
    expect(Array.isArray(result.textLines)).toBe(true);
    expect(result.textLines?.[0]).toContain("deploy done");
  });

  test("returns invalid argument for bot token", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxb-test",
        source: "SLACK_MCP_XOXB_TOKEN",
      }),
    });

    const result = await handler({
      commandPath: ["messages", "search"],
      positionals: ["deploy"],
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
    expect(result.error.message).toContain("user token");
  });

  test("maps slack auth error to invalid argument", async () => {
    const handler = createMessagesSearchHandler({
      env: {},
      resolveToken: () => ({
        token: "xoxp-test",
        source: "SLACK_MCP_XOXP_TOKEN",
      }),
      createClient: () => ({
        listChannels: async () => ({
          channels: [],
        }),
        listUsers: async () => ({
          users: [],
        }),
        searchMessages: async () => {
          throw createSlackClientError({
            code: "SLACK_AUTH_ERROR",
            message: "Slack authentication failed: invalid_auth.",
            hint: "Use a valid token.",
          });
        },
      }),
    });

    const result = await handler({
      commandPath: ["messages", "search"],
      positionals: ["deploy"],
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
    expect(result.error.hint).toBe("Use a valid token.");
  });
});
