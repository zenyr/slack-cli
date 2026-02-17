import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsCreateHandler } from "../handlers/usergroups-create";
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
      description: "Primary incident responders",
    }),
    ...overrides,
  };
};

describe("usergroups create command", () => {
  test("help metadata exposes usergroups create required args", async () => {
    const result = await runCliWithBuffer(["help", "usergroups", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    const lines = parsed.textLines.filter((line): line is string => typeof line === "string");
    const createLine = lines.find((line) => line.includes("create <name> <handle> [--json]"));
    expect(createLine).toBeDefined();
    expect(createLine).not.toContain("--name");
    expect(createLine).not.toContain("--handle");
  });

  test("creates usergroup and returns core fields for --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/usergroups.create");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");
        expect(headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("name")).toBe("On-call");
        expect(params.get("handle")).toBe("oncall");

        return new Response(
          JSON.stringify({
            ok: true,
            usergroup: {
              id: "S001",
              handle: "oncall",
              name: "On-call",
              description: "Primary incident responders",
            },
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

    const result = await runCliWithBuffer(["usergroups", "create", "On-call", "oncall", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("usergroups.create");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(isRecord(parsed.data.usergroup)).toBe(true);
    if (!isRecord(parsed.data.usergroup)) {
      return;
    }

    expect(parsed.data.usergroup.id).toBe("S001");
    expect(parsed.data.usergroup.handle).toBe("oncall");
    expect(parsed.data.usergroup.name).toBe("On-call");
    expect(parsed.data.usergroup.description).toBe("Primary incident responders");
  });

  test("returns invalid argument with usage hint when required args are missing", async () => {
    const result = await runCliWithBuffer(["usergroups", "create", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("MISSING_ARGUMENT");
    expect(parsed.error.hint).toBe("Usage: slack usergroups create <name> <handle> [--json]");
  });

  test("maps Slack auth errors to invalid argument", async () => {
    const handler = createUsergroupsCreateHandler({
      createClient: () =>
        createMockClient({
          createUsergroup: async () => {
            throw createSlackClientError({
              code: "SLACK_AUTH_ERROR",
              message: "Slack authentication failed: invalid_auth.",
              hint: "Use valid Slack token.",
            });
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "create"],
      positionals: ["On-call", "oncall"],
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
});
