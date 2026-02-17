import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createChannelsListHandler } from "../handlers/channels-list";
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
});
