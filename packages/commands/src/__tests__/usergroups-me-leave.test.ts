import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsMeLeaveHandler } from "../handlers/usergroups-me-leave";
import { createSlackClientError } from "../slack";
import type {
  SlackAuthWebApiClient,
  SlackUsergroupsUpdateWebApiClient,
  SlackUsergroupsUsersListWebApiClient,
} from "../slack/types";

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

type SlackUsergroupsMeLeaveWebApiClient = SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  Pick<SlackUsergroupsUpdateWebApiClient, "updateUsergroupUsers">;

const createMockClient = (
  overrides: Partial<SlackUsergroupsMeLeaveWebApiClient> = {},
): SlackUsergroupsMeLeaveWebApiClient => {
  return {
    getCurrentUserId: async () => "U001",
    listUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U001", "U100"] }),
    updateUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U100"] }),
    ...overrides,
  };
};

describe("usergroups me leave command", () => {
  test("help metadata exposes usergroups me leave args", async () => {
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
    const leaveLine = lines.find((line) => line.includes("me leave <usergroup-id> [--json]"));
    expect(leaveLine).toBeDefined();
  });

  test("removes current user and updates membership with filtered users", async () => {
    const updateCalls: Array<{ usergroupId: string; userIds: string[] }> = [];
    const handler = createUsergroupsMeLeaveHandler({
      createClient: () =>
        createMockClient({
          listUsergroupUsers: async () => ({
            usergroupId: "S001",
            userIds: ["U100", "U001", "U200"],
          }),
          updateUsergroupUsers: async (params) => {
            updateCalls.push({
              usergroupId: params.usergroupId,
              userIds: [...params.userIds],
            });
            return { usergroupId: params.usergroupId, userIds: params.userIds };
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "leave"],
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

    expect(updateCalls).toEqual([{ usergroupId: "S001", userIds: ["U100", "U200"] }]);
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("usergroups.me.leave");
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.usergroupId).toBe("S001");
    expect(result.data.userId).toBe("U001");
    expect(result.data.changed).toBe(true);
    expect(result.data.count).toBe(2);
    expect(result.data.users).toEqual(["U100", "U200"]);
    expect(result.textLines).toEqual([
      "Result: left",
      "User group: S001",
      "User: U001",
      "Users (2): U100, U200",
    ]);
  });

  test("not-member returns success no-op", async () => {
    let updateCalled = false;
    const handler = createUsergroupsMeLeaveHandler({
      createClient: () =>
        createMockClient({
          listUsergroupUsers: async () => ({ usergroupId: "S001", userIds: ["U100", "U200"] }),
          updateUsergroupUsers: async () => {
            updateCalled = true;
            return { usergroupId: "S001", userIds: ["U100", "U200"] };
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "leave"],
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

    expect(result.ok).toBe(true);
    expect(updateCalled).toBe(false);

    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("usergroups.me.leave");
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.changed).toBe(false);
    expect(result.data.count).toBe(2);
    expect(result.textLines).toEqual([
      "Result: no-op (already not a member)",
      "User group: S001",
      "User: U001",
      "Users (2): U100, U200",
    ]);
  });

  test("returns invalid argument with usage hint when usergroup id is missing", async () => {
    const result = await runCliWithBuffer(["usergroups", "me", "leave", "--json"]);

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
    expect(parsed.error.hint).toBe("Usage: slack usergroups me leave <usergroup-id> [--json]");
  });

  test("returns invalid argument when extra positional arguments are provided", async () => {
    const handler = createUsergroupsMeLeaveHandler({
      createClient: () => createMockClient(),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "leave"],
      positionals: ["S001", "extra"],
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
    expect(result.error.message).toContain("accepts only one <usergroup-id>");
  });

  const deterministicSlackErrorCases: Array<{
    title: string;
    clientErrorArgs: Parameters<typeof createSlackClientError>[0];
    expectedCliCode: "INVALID_ARGUMENT" | "INTERNAL_ERROR";
    expectedHint: string;
    expectedDetail: string;
  }> = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_CONFIG_ERROR",
        message: "Slack token is not configured.",
        hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
        details: "config-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      expectedDetail: "config-detail-must-not-appear",
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_AUTH_ERROR",
        message: "Slack authentication failed: invalid_auth.",
        hint: "Use valid Slack token.",
        details: "auth-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Use valid Slack token.",
      expectedDetail: "auth-detail-must-not-appear",
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT without marker and detail suffix",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Slack API request failed: permission_denied.",
        hint: "Confirm current user can leave this user group.",
        details: "api-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Confirm current user can leave this user group.",
      expectedDetail: "api-detail-must-not-appear",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Slack HTTP transport failed with status 503.",
        hint: "Check network path and retry usergroups me leave.",
        details: "http-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Check network path and retry usergroups me leave.",
      expectedDetail: "http-detail-must-not-appear",
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack response payload missing users list.",
        hint: "Capture raw response and validate schema assumptions.",
        details: "response-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Capture raw response and validate schema assumptions.",
      expectedDetail: "response-detail-must-not-appear",
    },
  ];

  deterministicSlackErrorCases.forEach(
    ({ title, clientErrorArgs, expectedCliCode, expectedHint, expectedDetail }) => {
      test(title, async () => {
        const handler = createUsergroupsMeLeaveHandler({
          createClient: () =>
            createMockClient({
              getCurrentUserId: async () => {
                throw createSlackClientError(clientErrorArgs);
              },
            }),
        });

        const result = await handler({
          commandPath: ["usergroups", "me", "leave"],
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

        expect(result.error.code).toBe(expectedCliCode);
        expect(result.error.message).toBe(clientErrorArgs.message);
        expect(result.error.hint).toBe(expectedHint);
        expect(result.error.message).not.toContain("[AUTH_ERROR]");
        expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
        expect(result.error.message).not.toContain(expectedDetail);
      });
    },
  );
});
