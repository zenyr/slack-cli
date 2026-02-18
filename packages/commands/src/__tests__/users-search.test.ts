import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("users search command", () => {
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

  test("routes to users.search command id and applies query filtering", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockedFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = input instanceof URL ? input.toString() : String(input);
      expect(requestUrl).toContain("/users.list");
      expect(requestUrl).toContain("limit=200");

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

      return new Response(
        JSON.stringify({
          ok: true,
          members: [
            {
              id: "U001",
              name: "alice",
              deleted: false,
              is_bot: false,
              is_admin: true,
              profile: {
                display_name: "Alice",
                real_name: "Alice Kim",
              },
            },
            {
              id: "U002",
              name: "bob",
              deleted: false,
              is_bot: false,
              is_admin: false,
              profile: {
                real_name: "Bob",
                email: "bob@company.com",
              },
            },
          ],
          response_metadata: {
            next_cursor: "",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    globalThis.fetch = mockedFetch as typeof fetch;

    const result = await runCliWithBuffer(["users", "search", "alice", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("users.search");

    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(1);

    const users = Array.isArray(parsed.data.users) ? parsed.data.users : [];
    expect(users.length).toBe(1);

    const firstUser = users[0];
    if (isRecord(firstUser)) {
      expect(firstUser.id).toBe("U001");
      expect(firstUser.username).toBe("alice");
    }

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (Array.isArray(parsed.textLines)) {
      expect(parsed.textLines[0]).toBe("Found 1 users (filtered by: alice).");
    }
  });
});
