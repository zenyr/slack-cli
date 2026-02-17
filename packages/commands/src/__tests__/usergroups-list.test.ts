import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsListHandler } from "../handlers/usergroups-list";
import { createSlackClientError } from "../slack";
import type { SlackUsergroupsWebApiClient } from "../slack/types";

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

const createMockClient = (
  overrides: Partial<SlackUsergroupsWebApiClient> = {},
): SlackUsergroupsWebApiClient => {
  return {
    listUsergroups: async () => ({ usergroups: [] }),
    createUsergroup: async () => ({
      id: "S001",
      handle: "oncall",
      name: "On-call",
    }),
    ...overrides,
  };
};

describe("usergroups list command", () => {
  test("returns usergroups list result for usergroups list --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/usergroups.list");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        return new Response(
          JSON.stringify({
            ok: true,
            usergroups: [
              {
                id: "S001",
                handle: "oncall",
                name: "On-call",
                description: "Primary incident responders",
              },
              {
                id: "S002",
                handle: "eng",
                name: "Engineering",
                description: "",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockFetch;

    const result = await runCliWithBuffer(["usergroups", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("usergroups.list");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.count).toBe(2);
    expect(Array.isArray(parsed.data.usergroups)).toBe(true);
    if (!Array.isArray(parsed.data.usergroups)) {
      return;
    }

    const first = parsed.data.usergroups[0];
    const second = parsed.data.usergroups[1];

    expect(isRecord(first)).toBe(true);
    expect(isRecord(second)).toBe(true);
    if (!isRecord(first) || !isRecord(second)) {
      return;
    }

    expect(first.id).toBe("S001");
    expect(first.handle).toBe("oncall");
    expect(first.name).toBe("On-call");
    expect(first.description).toBe("Primary incident responders");
    expect(second.description).toBeUndefined();

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    expect(parsed.textLines[0]).toBe("Found 2 user groups.");
    expect(parsed.textLines).toContain("- @oncall (S001) On-call - Primary incident responders");
    expect(parsed.textLines).toContain("- @eng (S002) Engineering");
  });

  test("forwards include flags to usergroups.list query", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        const parsedUrl = new URL(requestUrl);

        expect(parsedUrl.pathname).toContain("/usergroups.list");
        expect(parsedUrl.searchParams.get("include_users")).toBe("true");
        expect(parsedUrl.searchParams.get("include_disabled")).toBe("false");
        expect(parsedUrl.searchParams.get("include_count")).toBe("true");

        return new Response(
          JSON.stringify({
            ok: true,
            usergroups: [],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockFetch;

    const result = await runCliWithBuffer([
      "usergroups",
      "list",
      "--include-users",
      "--include-disabled=false",
      "--include-count=1",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);
  });

  test("returns invalid argument for invalid include-users boolean", async () => {
    const result = await runCliWithBuffer([
      "usergroups",
      "list",
      "--include-users=maybe",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toBe("Invalid --include-users value: maybe.");
    expect(parsed.error.hint).toBe("Use boolean value for --include-users: true|false|1|0|yes|no.");
  });

  test("maps Slack auth errors to invalid argument", async () => {
    const handler = createUsergroupsListHandler({
      createClient: () => {
        throw createSlackClientError({
          code: "SLACK_AUTH_ERROR",
          message: "Slack authentication failed: invalid_auth.",
          hint: "Use valid Slack token.",
        });
      },
    });

    const result = await handler({
      commandPath: ["usergroups", "list"],
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
    expect(result.error.message).toBe("Slack authentication failed: invalid_auth.");
  });

  test("returns invalid argument when positionals are provided", async () => {
    const handler = createUsergroupsListHandler({
      createClient: () => createMockClient(),
    });

    const result = await handler({
      commandPath: ["usergroups", "list"],
      positionals: ["unexpected"],
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
    expect(result.error.message).toContain("does not accept positional arguments");
  });
});
