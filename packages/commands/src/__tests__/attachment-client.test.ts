import { afterEach, describe, expect, test } from "bun:test";

import { createSlackWebApiClient } from "../slack";

describe("attachment client path", () => {
  const XOXP_ENV_KEY = "SLACK_MCP_XOXP_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxpToken = process.env[XOXP_ENV_KEY];

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalXoxpToken === undefined) {
      delete process.env[XOXP_ENV_KEY];
    } else {
      process.env[XOXP_ENV_KEY] = originalXoxpToken;
    }
  });

  test("fetchFileInfo calls files.info and maps file metadata", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/files.info");
        expect(requestUrl).toContain("file=F123");
        expect(init?.method).toBe("GET");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            file: {
              id: "F123",
              name: "design-spec.pdf",
              mimetype: "application/pdf",
              filetype: "pdf",
              size: 4096,
              url_private: "https://files.slack.test/F123",
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

    const client = createSlackWebApiClient();
    const result = await client.fetchFileInfo("F123");

    expect(result).toEqual({
      id: "F123",
      name: "design-spec.pdf",
      mimetype: "application/pdf",
      filetype: "pdf",
      size: 4096,
      urlPrivate: "https://files.slack.test/F123",
    });
  });

  test("fetchFileInfo rejects empty file id", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const client = createSlackWebApiClient();

    await expect(client.fetchFileInfo("   ")).rejects.toMatchObject({
      code: "SLACK_CONFIG_ERROR",
    });
  });

  test("fetchFileInfo rejects malformed files.info payload", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            file: {
              id: "F123",
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

    const client = createSlackWebApiClient();

    await expect(client.fetchFileInfo("F123")).rejects.toMatchObject({
      code: "SLACK_RESPONSE_ERROR",
    });
  });

  test("fetchFileInfo maps Slack API error payload", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";

    const mockedFetch: typeof fetch = Object.assign(
      async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "file_not_found",
          }),
          { status: 200 },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockedFetch;

    const client = createSlackWebApiClient();

    try {
      await client.fetchFileInfo("F404");
      throw new Error("Expected fetchFileInfo to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        return;
      }

      expect(Reflect.get(error, "code")).toBe("SLACK_API_ERROR");
      expect(error.message).toContain("file_not_found");
    }
  });
});
