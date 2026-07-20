import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createChannelsMeHandler } from "../handlers/channels-me";
import type { SlackWebApiClient } from "../slack";

const TOKEN_KEY = "SLACK_MCP_XOXP_TOKEN";
const originalFetch = globalThis.fetch;
const originalToken = process.env[TOKEN_KEY];

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) {
    delete process.env[TOKEN_KEY];
  } else {
    process.env[TOKEN_KEY] = originalToken;
  }
});

const request = (options: Record<string, string | boolean> = {}) => ({
  commandPath: ["channels", "me"],
  positionals: [],
  options,
  flags: { json: true, help: false, version: false, xoxp: false, xoxb: false },
  context: { version: "1.3.0" },
});

const clientWith = (listChannels: SlackWebApiClient["listChannels"]): SlackWebApiClient => {
  return { listChannels } as SlackWebApiClient;
};

describe("channels me command", () => {
  test("routes to users.conversations and forwards native paging params", async () => {
    process.env[TOKEN_KEY] = "xoxp-test-token";
    let calledUrl = "";
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request) => {
        calledUrl = String(input);
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: "C1", name: "general", is_private: false, is_archived: false }],
            response_metadata: { next_cursor: "native-next" },
          }),
        );
      },
      { preconnect: originalFetch.preconnect },
    );

    const result = await runCliWithBuffer([
      "channels",
      "me",
      "--type",
      "private,im",
      "--limit",
      "25",
      "--cursor",
      "native-current",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const url = new URL(calledUrl);
    expect(url.pathname).toEndWith("/users.conversations");
    expect(url.searchParams.get("types")).toBe("private_channel,im");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("cursor")).toBe("native-current");

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed) && parsed.command).toBe("channels.me");
    if (!isRecord(parsed) || !isRecord(parsed.data)) return;
    expect(parsed.data.next_cursor).toBe("native-next");
  });

  test("uses public/private and limit 100 defaults", async () => {
    let received: unknown;
    const handler = createChannelsMeHandler({
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () =>
        clientWith(async (options) => {
          received = options;
          return { channels: [] };
        }),
    });

    const result = await handler(request());

    expect(result.ok).toBe(true);
    expect(received).toEqual({
      types: ["public", "private"],
      limit: 100,
      cursor: undefined,
      userOnly: true,
    });
  });

  test("caps limit at 999", async () => {
    let receivedLimit = 0;
    const handler = createChannelsMeHandler({
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () =>
        clientWith(async (options) => {
          receivedLimit = options.limit;
          return { channels: [] };
        }),
    });

    expect((await handler(request({ limit: "1000" }))).ok).toBe(true);
    expect(receivedLimit).toBe(999);
  });

  test.each([
    [{ limit: "0" }, "limit must be a positive integer"],
    [{ limit: "nope" }, "limit must be a positive integer"],
    [{ type: "public,unknown" }, "invalid type value"],
    [{ cursor: "" }, "cursor must be a non-empty string"],
  ])("validates options %#", async (options, message) => {
    const handler = createChannelsMeHandler({
      createClient: () => clientWith(async () => ({ channels: [] })),
    });

    const result = await handler(request(options));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain(message);
  });

  test("returns channel data and readable output", async () => {
    const handler = createChannelsMeHandler({
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () =>
        clientWith(async () => ({
          channels: [
            {
              id: "C1",
              name: "general",
              isPrivate: false,
              isArchived: false,
              memberCount: 42,
            },
          ],
          nextCursor: "next-page",
        })),
    });

    const result = await handler(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toBe("channels.me");
    expect(result.data).toEqual({
      channels: [
        {
          id: "C1",
          name: "general",
          isPrivate: false,
          isArchived: false,
          memberCount: 42,
        },
      ],
      count: 1,
      next_cursor: "next-page",
    });
    expect(result.textLines).toContain("#general (C1) - public, 42 members");
    expect(result.textLines).toContain("Next cursor: next-page");
  });

  test("registers help and schema metadata", async () => {
    const help = await runCliWithBuffer(["help", "channels"]);
    expect(help.stdout.join("\n")).toContain("me [--type <public|private|im|mpim>]");

    const schema = await runCliWithBuffer(["schema", "channels", "me", "--json"]);
    expect(schema.exitCode).toBe(0);
    const parsed = parseJsonOutput(schema.stdout);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) return;
    expect(parsed.data.schema.name).toBe("channels me");
    expect(parsed.data.schema.args).not.toContain("sort");
  });
});
