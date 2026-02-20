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
                user_count: 2,
                users: ["U001", "U002"],
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
    expect(first.userCount).toBe(2);
    expect(Array.isArray(first.users)).toBe(true);
    if (!Array.isArray(first.users)) {
      return;
    }
    expect(first.users).toEqual(["U001", "U002"]);
    expect(second.description).toBeUndefined();

    expect(Array.isArray(parsed.textLines)).toBe(true);
    if (!Array.isArray(parsed.textLines)) {
      return;
    }

    expect(parsed.textLines[0]).toBe("Found 2 user groups.");
    expect(parsed.textLines).toContain(
      "- @oncall (S001) On-call - Primary incident responders [members: 2] [users: U001,U002]",
    );
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
        hint: "Check arguments and retry usergroups.list.",
        details: "invalid_arguments",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Check arguments and retry usergroups.list.",
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
        const handler = createUsergroupsListHandler({
          createClient: () => {
            throw createSlackClientError(clientErrorArgs);
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
            xoxp: false,
            xoxb: false,
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
        xoxp: false,
        xoxb: false,
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

  test("renders bounded users list in text output", async () => {
    const handler = createUsergroupsListHandler({
      createClient: () =>
        createMockClient({
          listUsergroups: async () => ({
            usergroups: [
              {
                id: "S003",
                handle: "ops",
                name: "Operations",
                users: ["U001", "U002", "U003", "U004", "U005", "U006", "U007"],
              },
            ],
          }),
        }),
    });

    const result = await handler({
      commandPath: ["usergroups", "list"],
      positionals: [],
      options: {
        "include-users": true,
      },
      flags: {
        json: false,
        help: false,
        version: false,
        xoxp: false,
        xoxb: false,
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.textLines).toContain(
      "- @ops (S003) Operations [users: U001,U002,U003,U004,U005, +2 more]",
    );
  });
});
