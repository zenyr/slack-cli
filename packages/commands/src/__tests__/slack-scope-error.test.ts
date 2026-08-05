import { afterEach, describe, expect, test } from "bun:test";

import { createSlackWebApiClient } from "../slack";

describe("Slack scope errors", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("preserves needed and provided scopes from Slack", async () => {
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: "missing_scope",
            needed: "channels:read",
            provided: "chat:write",
          }),
          { status: 200 },
        ),
      { preconnect: originalFetch.preconnect },
    );

    const client = createSlackWebApiClient({ token: "xoxp-test" });

    try {
      await client.listChannels({ types: ["public"], limit: 1 });
      throw new Error("Expected listChannels to throw");
    } catch (error) {
      expect(Reflect.get(Object(error), "needed")).toBe("channels:read");
      expect(Reflect.get(Object(error), "provided")).toBe("chat:write");
      expect(Reflect.get(Object(error), "hint")).toContain("channels:read");
    }
  });
});
