import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("views commands", () => {
  const XOXB_ENV_KEY = "SLACK_MCP_XOXB_TOKEN";
  const originalFetch = globalThis.fetch;
  const originalXoxbToken = process.env[XOXB_ENV_KEY];

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalXoxbToken === undefined) {
      delete process.env[XOXB_ENV_KEY];
    } else {
      process.env[XOXB_ENV_KEY] = originalXoxbToken;
    }
  });

  test("publish returns missing argument when user id is absent", async () => {
    const result = await runCliWithBuffer(["views", "publish", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("<user-id>");
  });

  test("publish supports dry-run with view option", async () => {
    const result = await runCliWithBuffer([
      "views",
      "publish",
      "U123",
      '--view={"type":"home","blocks":[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]}',
      "--dry-run",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.request)) {
      return;
    }

    expect(parsed.command).toBe("views.publish");
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.request.user_id).toBe("U123");
  });

  test("publish reads view JSON from stdin", async () => {
    const result = await runCliWithBuffer(
      ["views", "publish", "U123", "--view=-", "--dry-run", "--json"],
      { stdin: '{"type":"home","blocks":[]}' },
    );

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.request)) {
      return;
    }

    const request = parsed.data.request;
    expect(isRecord(request)).toBe(true);
    if (!isRecord(request) || !isRecord(request.view)) {
      return;
    }

    expect(request.view.type).toBe("home");
  });

  test("publish supports payload dry-run", async () => {
    const result = await runCliWithBuffer([
      "views",
      "publish",
      '--payload={"user_id":"U123","view":{"type":"home","blocks":[]},"hash":"h1"}',
      "--dry-run",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.request)) {
      return;
    }

    expect(parsed.data.request.user_id).toBe("U123");
    expect(parsed.data.request.hash).toBe("h1");
  });

  test("publish calls views.publish with JSON body", async () => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";

    let capturedBody: unknown;
    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/views.publish");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxb-test-token");
        expect(headers.get("Content-Type")).toContain("application/json");

        capturedBody = JSON.parse(String(init?.body));

        return new Response(
          JSON.stringify({
            ok: true,
            view: {
              id: "V123",
              type: "home",
              hash: "h2",
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

    const result = await runCliWithBuffer([
      "views",
      "publish",
      "U123",
      '--view={"type":"home","blocks":[]}',
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(isRecord(capturedBody)).toBe(true);
    if (!isRecord(capturedBody) || !isRecord(capturedBody.view)) {
      return;
    }

    expect(capturedBody.user_id).toBe("U123");
    expect(capturedBody.view.type).toBe("home");
  });

  test("clear dry-run publishes an empty Home view", async () => {
    const result = await runCliWithBuffer(["views", "clear", "U123", "--dry-run", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.request)) {
      return;
    }

    const request = parsed.data.request;
    expect(isRecord(request)).toBe(true);
    if (!isRecord(request) || !isRecord(request.view)) {
      return;
    }

    expect(request.user_id).toBe("U123");
    expect(request.view.type).toBe("home");
    expect(Array.isArray(request.view.blocks)).toBe(true);
  });

  test("clear calls views.publish with empty Home view", async () => {
    process.env[XOXB_ENV_KEY] = "xoxb-test-token";

    let capturedBody: unknown;
    const mockedFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/views.publish");
        capturedBody = JSON.parse(String(init?.body));

        return new Response(
          JSON.stringify({
            ok: true,
            view: {
              id: "V123",
              type: "home",
              hash: "h3",
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

    const result = await runCliWithBuffer(["views", "clear", "U123", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(isRecord(capturedBody)).toBe(true);
    if (!isRecord(capturedBody) || !isRecord(capturedBody.view)) {
      return;
    }

    expect(capturedBody.user_id).toBe("U123");
    expect(capturedBody.view.type).toBe("home");
    expect(Array.isArray(capturedBody.view.blocks)).toBe(true);
  });
});
