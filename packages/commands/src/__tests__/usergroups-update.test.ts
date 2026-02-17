import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsUpdateHandler } from "../handlers/usergroups-update";
import { createSlackClientError } from "../slack";
import type { SlackUsergroupsUpdateWebApiClient } from "../slack/types";

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
  overrides: Partial<SlackUsergroupsUpdateWebApiClient> = {},
): SlackUsergroupsUpdateWebApiClient => {
  return {
    updateUsergroup: async () => ({
      usergroup: {
        id: "S001",
        handle: "eng-core",
        name: "Engineering Core",
      },
    }),
    updateUsergroupUsers: async () => ({
      usergroupId: "S001",
      userIds: ["U001"],
    }),
    ...overrides,
  };
};

describe("usergroups update command", () => {
  test("help metadata exposes usergroups update required args", async () => {
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
    const updateLine = lines.find((line) =>
      line.includes("update <usergroup-id> <name> <handle> [--json]"),
    );
    expect(updateLine).toBeDefined();
    expect(updateLine).not.toContain("--name");
    expect(updateLine).not.toContain("--handle");
  });

  test("updates usergroup and returns core fields for --json", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/usergroups.update");
        expect(init?.method).toBe("POST");

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");
        expect(headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("usergroup")).toBe("S001");
        expect(params.get("name")).toBe("Engineering Core");
        expect(params.get("handle")).toBe("eng-core");

        return new Response(
          JSON.stringify({
            ok: true,
            usergroup: {
              id: "S001",
              handle: "eng-core",
              name: "Engineering Core",
              description: "Core eng team",
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

    const result = await runCliWithBuffer([
      "usergroups",
      "update",
      "S001",
      "Engineering Core",
      "eng-core",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("usergroups.update");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(isRecord(parsed.data.usergroup)).toBe(true);
    if (!isRecord(parsed.data.usergroup)) {
      return;
    }

    expect(parsed.data.usergroup.id).toBe("S001");
    expect(parsed.data.usergroup.handle).toBe("eng-core");
    expect(parsed.data.usergroup.name).toBe("Engineering Core");
  });

  test("returns invalid argument with usage hint when required args are missing", async () => {
    const result = await runCliWithBuffer(["usergroups", "update", "--json"]);

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
    expect(parsed.error.hint).toBe(
      "Usage: slack usergroups update <usergroup-id> <name> <handle> [--json]",
    );
  });

  test("maps Slack auth errors to invalid argument", async () => {
    const handler = createUsergroupsUpdateHandler({
      createClient: () =>
        createMockClient({
          updateUsergroup: async () => {
            throw createSlackClientError({
              code: "SLACK_AUTH_ERROR",
              message: "Slack authentication failed: invalid_auth.",
              hint: "Use valid Slack token.",
            });
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "update"],
      positionals: ["S001", "Engineering Core", "eng-core"],
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
