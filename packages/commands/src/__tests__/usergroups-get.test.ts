import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsGetHandler } from "../handlers/usergroups-get";
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

describe("usergroups get command", () => {
  test("returns missing argument when usergroup id is absent", async () => {
    const result = await runCliWithBuffer(["usergroups", "get", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("requires at least one <usergroup-id>");
  });

  test("returns filtered usergroups and missing ids", async () => {
    const handler = createUsergroupsGetHandler({
      createClient: () =>
        createMockClient({
          listUsergroups: async () => ({
            usergroups: [
              {
                id: "S001",
                handle: "oncall",
                name: "On-call",
              },
              {
                id: "S002",
                handle: "eng",
                name: "Engineering",
              },
            ],
          }),
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "get"],
      positionals: ["S002", "S999"],
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
    if (!result.ok || !isRecord(result.data) || !Array.isArray(result.data.usergroups)) {
      return;
    }

    expect(result.command).toBe("usergroups.get");
    expect(result.data.count).toBe(1);
    expect(result.data.requested_ids).toEqual(["S002", "S999"]);
    expect(result.data.missing_ids).toEqual(["S999"]);
    expect(result.textLines).toContain("Matched 1 user groups (requested 2).");
  });

  test("returns invalid argument for malformed usergroup id", async () => {
    const result = await runCliWithBuffer(["usergroups", "get", "invalid-id", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("Invalid usergroup id");
  });

  test("maps SLACK_API_ERROR to INVALID_ARGUMENT", async () => {
    const handler = createUsergroupsGetHandler({
      createClient: () => {
        throw createSlackClientError({
          code: "SLACK_API_ERROR",
          message: "Slack API request failed.",
          hint: "Check args and retry usergroups.get.",
        });
      },
    });

    const result = await handler({
      commandPath: ["usergroups", "get"],
      positionals: ["S001"],
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
    expect(result.error.message).toBe("Slack API request failed.");
  });
});
