import { afterEach, describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createUsergroupsMeHandler } from "../handlers/usergroups-me";
import { createSlackClientError } from "../slack";
import type { SlackUsergroupsMeWebApiClient } from "../slack/types";

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
  overrides: Partial<SlackUsergroupsMeWebApiClient> = {},
): SlackUsergroupsMeWebApiClient => {
  return {
    getCurrentUserId: async () => "U001",
    listUsergroups: async () => ({ usergroups: [] }),
    listUsergroupUsers: async () => ({ usergroupId: "S001", userIds: [] }),
    ...overrides,
  };
};

describe("usergroups me list command", () => {
  test("help metadata exposes usergroups me list args", async () => {
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
    const listLine = lines.find((line) => line.includes("me list [--json]"));
    expect(listLine).toBeDefined();
  });

  test("lists memberships for current authenticated user", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const requestedUsergroups: string[] = [];
    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        const parsedUrl = new URL(requestUrl);

        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer xoxp-test-token");

        if (parsedUrl.pathname.includes("/auth.test")) {
          return new Response(JSON.stringify({ ok: true, user_id: "U001" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (parsedUrl.pathname.includes("/usergroups.list")) {
          return new Response(
            JSON.stringify({
              ok: true,
              usergroups: [
                { id: "S001", handle: "oncall", name: "On-call" },
                { id: "S002", handle: "eng", name: "Engineering" },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        if (parsedUrl.pathname.includes("/usergroups.users.list")) {
          const usergroupId = parsedUrl.searchParams.get("usergroup");
          if (usergroupId !== null) {
            requestedUsergroups.push(usergroupId);
          }

          const users = usergroupId === "S001" ? ["U001", "U999"] : ["U777"];
          return new Response(JSON.stringify({ ok: true, users }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: false, error: "unknown_method" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      },
      {
        preconnect: originalFetch.preconnect,
      },
    );

    globalThis.fetch = mockFetch;

    const result = await runCliWithBuffer(["usergroups", "me", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);
    expect(requestedUsergroups).toEqual(["S001", "S002"]);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("usergroups.me.list");

    expect(isRecord(parsed.data)).toBe(true);
    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.userId).toBe("U001");
    expect(parsed.data.count).toBe(1);
    expect(Array.isArray(parsed.data.usergroups)).toBe(true);
    if (!Array.isArray(parsed.data.usergroups)) {
      return;
    }

    expect(parsed.data.usergroups.length).toBe(1);
    const first = parsed.data.usergroups[0];
    expect(isRecord(first)).toBe(true);
    if (!isRecord(first)) {
      return;
    }

    expect(first.id).toBe("S001");
    expect(first.handle).toBe("oncall");
  });

  test("returns invalid argument when positionals are provided", async () => {
    const handler = createUsergroupsMeHandler({
      createClient: () => createMockClient(),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "list"],
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

  test("maps Slack auth errors to invalid argument", async () => {
    const handler = createUsergroupsMeHandler({
      createClient: () =>
        createMockClient({
          getCurrentUserId: async () => {
            throw createSlackClientError({
              code: "SLACK_AUTH_ERROR",
              message: "Slack authentication failed: invalid_auth.",
              hint: "Use valid Slack token.",
            });
          },
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "me", "list"],
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

  const deterministicSlackErrorCases: Array<{
    title: string;
    clientErrorArgs: Parameters<typeof createSlackClientError>[0];
    expectedCliCode: "INVALID_ARGUMENT" | "INTERNAL_ERROR";
    expectedHint?: string;
    expectedDetail?: string;
  }> = [
    {
      title: "maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_CONFIG_ERROR",
        message: "Slack token is not configured.",
        hint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Set SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN in environment.",
    },
    {
      title: "maps SLACK_AUTH_ERROR to INVALID_ARGUMENT without marker",
      clientErrorArgs: {
        code: "SLACK_AUTH_ERROR",
        message: "Slack authentication failed: invalid_auth.",
        hint: "Use valid Slack token.",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Use valid Slack token.",
    },
    {
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT without marker and detail suffix",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Slack API request failed.",
        hint: "Check arguments and retry usergroups.me.list.",
        details: "invalid_arguments",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Check arguments and retry usergroups.me.list.",
      expectedDetail: "invalid_arguments",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Slack HTTP transport failed with status 503.",
        hint: "Check network path and retry.",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Check network path and retry.",
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack response payload missing usergroups.",
        hint: "Capture raw response and validate schema assumptions.",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Capture raw response and validate schema assumptions.",
    },
  ];

  deterministicSlackErrorCases.forEach(
    ({ title, clientErrorArgs, expectedCliCode, expectedHint, expectedDetail }) => {
      test(title, async () => {
        const handler = createUsergroupsMeHandler({
          createClient: () =>
            createMockClient({
              getCurrentUserId: async () => {
                throw createSlackClientError(clientErrorArgs);
              },
            }),
        });

        const result = await handler({
          commandPath: ["usergroups", "me", "list"],
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

        expect(result.error.code).toBe(expectedCliCode);
        expect(result.error.message).toBe(clientErrorArgs.message);
        expect(result.error.hint).toBe(expectedHint);
        expect(result.error.message).not.toContain("[AUTH_ERROR]");
        expect(result.error.message).not.toContain("[SLACK_API_ERROR]");

        if (expectedDetail !== undefined) {
          expect(result.error.message).not.toContain(expectedDetail);
        }
      });
    },
  );
});
