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
    const createLine = lines.find((line) =>
      line.includes(
        "create <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]",
      ),
    );
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
        expect(params.get("description")).toBeNull();
        expect(params.get("channels")).toBeNull();

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

  test("forwards optional metadata to usergroups.create payload", async () => {
    process.env[XOXP_ENV_KEY] = "xoxp-test-token";
    delete process.env[XOXB_ENV_KEY];

    const mockFetch: typeof fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof URL ? input.toString() : String(input);
        expect(requestUrl).toContain("/usergroups.create");
        expect(init?.method).toBe("POST");

        const body = String(init?.body);
        const params = new URLSearchParams(body);
        expect(params.get("name")).toBe("On-call");
        expect(params.get("handle")).toBe("oncall");
        expect(params.get("description")).toBe("Primary incident responders");
        expect(params.get("channels")).toBe("C111,C222");

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

    const result = await runCliWithBuffer([
      "usergroups",
      "create",
      "On-call",
      "oncall",
      "--description=Primary incident responders",
      "--channels=C111,C222",
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
    expect(parsed.command).toBe("usergroups.create");
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
    expect(parsed.error.hint).toBe(
      "Usage: slack usergroups create <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]",
    );
  });

  test("returns invalid argument when --description value is empty", async () => {
    const handler = createUsergroupsCreateHandler({
      createClient: () => createMockClient(),
    });

    const result = await handler({
      commandPath: ["usergroups", "create"],
      positionals: ["On-call", "oncall"],
      options: {
        description: "",
      },
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
    expect(result.error.message).toBe(
      "usergroups create --description value cannot be empty. [MISSING_ARGUMENT]",
    );
  });

  test("returns invalid argument when --channels value is empty", async () => {
    const handler = createUsergroupsCreateHandler({
      createClient: () => createMockClient(),
    });

    const result = await handler({
      commandPath: ["usergroups", "create"],
      positionals: ["On-call", "oncall"],
      options: {
        channels: "",
      },
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
    expect(result.error.message).toBe(
      "usergroups create --channels must be comma-separated non-empty channel ids.",
    );
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
      title: "maps SLACK_API_ERROR to INVALID_ARGUMENT without marker or detail suffix",
      clientErrorArgs: {
        code: "SLACK_API_ERROR",
        message: "Slack API request failed: invalid_name.",
        hint: "Use a unique name and handle.",
        details: "api-detail-must-not-appear",
      },
      expectedCliCode: "INVALID_ARGUMENT",
      expectedHint: "Use a unique name and handle.",
      expectedDetail: "api-detail-must-not-appear",
    },
    {
      title: "maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_HTTP_ERROR",
        message: "Slack HTTP transport failed with status 503.",
        hint: "Check network path and retry.",
        details: "http-detail-must-not-appear",
      },
      expectedCliCode: "INTERNAL_ERROR",
      expectedHint: "Check network path and retry.",
      expectedDetail: "http-detail-must-not-appear",
    },
    {
      title: "maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker",
      clientErrorArgs: {
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack response payload missing usergroup object.",
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
        const handler = createUsergroupsCreateHandler({
          createClient: () =>
            createMockClient({
              createUsergroup: async () => {
                throw createSlackClientError(clientErrorArgs);
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
