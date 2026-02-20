import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createAttachmentGetHandler } from "../handlers/attachment-get";
import { createSlackClientError } from "../slack";

describe("attachment get command", () => {
  const createHandlerThrowingSlackError = (errorOptions: {
    code:
      | "SLACK_CONFIG_ERROR"
      | "SLACK_AUTH_ERROR"
      | "SLACK_API_ERROR"
      | "SLACK_HTTP_ERROR"
      | "SLACK_RESPONSE_ERROR";
    message: string;
    hint: string;
    details?: string;
  }) => {
    return createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async () => {
          throw createSlackClientError(errorOptions);
        },
        fetchFileBinary: async () => {
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });
  };

  const runAttachmentGet = async (
    handler: ReturnType<typeof createAttachmentGetHandler>,
    options: Record<string, string | boolean> = {},
  ) => {
    return handler({
      commandPath: ["attachment", "get"],
      positionals: ["F404"],
      options,
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
  };

  test("routes command and returns missing argument when file id is absent", async () => {
    const result = await runCliWithBuffer(["attachment", "get", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(false);
    expect(isRecord(parsed.error)).toBe(true);
    if (!isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("MISSING_ARGUMENT");
    expect(parsed.error.message).toContain("<file-id>");
  });

  test("returns metadata only by default without private URL", async () => {
    let fetchBinaryCalled = false;
    const calls: string[] = [];

    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async (fileId: string) => {
          calls.push(fileId);
          return {
            id: "F999",
            name: "incident-log.txt",
            mimetype: "text/plain",
            filetype: "text",
            size: 128,
            urlPrivate: "https://files.slack.com/files-pri/T123-F999/download",
          };
        },
        fetchFileBinary: async () => {
          fetchBinaryCalled = true;
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["attachment", "get"],
      positionals: ["  F999  "],
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(calls).toEqual(["F999"]);
    expect(fetchBinaryCalled).toBe(false);
    expect(result.command).toBe("attachment.get");
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.saved).toBe(false);
    expect(isRecord(result.data.file)).toBe(true);
    if (!isRecord(result.data.file)) {
      return;
    }

    expect(result.data.file.id).toBe("F999");
    expect(result.data.file.name).toBe("incident-log.txt");
    expect(result.data.file.mimetype).toBe("text/plain");
    expect(result.data.file.filetype).toBe("text");
    expect(result.data.file.size).toBe(128);
    expect(result.data.file.url_private).toBeUndefined();
  });

  test("returns INVALID_ARGUMENT for invalid --save option value", async () => {
    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async () => {
          throw new Error("should not be called");
        },
        fetchFileBinary: async () => {
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await runAttachmentGet(handler, { save: "maybe" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("--save");
    expect(result.error.hint).toContain("true|false|1|0|yes|no|on|off");
  });

  test("returns INVALID_ARGUMENT when --save is enabled and private URL is missing", async () => {
    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async () => {
          return {
            id: "F-NO-URL",
            name: "attachment.bin",
            mimetype: "application/octet-stream",
            filetype: "bin",
            size: 16,
          };
        },
        fetchFileBinary: async () => {
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await runAttachmentGet(handler, { save: true });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("ATTACHMENT_DOWNLOAD_UNAVAILABLE");
  });

  test("saves attachment to generated temp path with hardened permissions", async () => {
    const writeCalls: Array<{ filePath: string; data: Uint8Array }> = [];
    const chmodCalls: Array<{ filePath: string; mode: number }> = [];

    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async () => {
          return {
            id: "F-BINARY",
            name: "diagram.png",
            mimetype: "image/png",
            filetype: "png",
            size: 256,
            urlPrivate: "https://files.slack.com/files-pri/T123-F-BINARY/download",
          };
        },
        fetchFileBinary: async (urlPrivate: string, maxBytes: number) => {
          expect(urlPrivate).toBe("https://files.slack.com/files-pri/T123-F-BINARY/download");
          expect(maxBytes).toBe(256 * 1024 * 1024);
          return {
            contentBase64: "AP9/",
            byteLength: 3,
            contentType: "image/png",
            encoding: "base64",
          };
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createTempDirectory: async () => "/tmp/slack-attachment-test-0001",
      generateUlid: () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      writeBinaryFile: async (filePath: string, data: Uint8Array) => {
        writeCalls.push({ filePath, data });
      },
      setPathPermissions: async (filePath: string, mode: number) => {
        chmodCalls.push({ filePath, mode });
      },
    });

    const result = await runAttachmentGet(handler, { save: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("attachment.get");
    expect(writeCalls.length).toBe(1);
    expect(writeCalls[0]?.filePath).toBe(
      "/tmp/slack-attachment-test-0001/01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    expect(Array.from(writeCalls[0]?.data ?? [])).toEqual([0, 255, 127]);
    expect(chmodCalls).toEqual([
      { filePath: "/tmp/slack-attachment-test-0001", mode: 0o700 },
      { filePath: "/tmp/slack-attachment-test-0001/01ARZ3NDEKTSV4RRFFQ69G5FAV", mode: 0o600 },
    ]);

    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(result.data.saved).toBe(true);
    expect(result.data.saved_path).toBe(
      "/tmp/slack-attachment-test-0001/01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    expect(result.data.saved_bytes).toBe(3);
    expect(result.data.saved_content_type).toBe("image/png");
  });

  test("maps SLACK_CONFIG_ERROR to INVALID_ARGUMENT without marker or details", async () => {
    const handler = createHandlerThrowingSlackError({
      code: "SLACK_CONFIG_ERROR",
      message: "Slack token is required.",
      hint: "Set SLACK_BOT_TOKEN.",
      details: "config-details-must-not-appear",
    });

    const result = await runAttachmentGet(handler);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("Slack token is required.");
    expect(result.error.message).not.toContain("[AUTH_ERROR]");
    expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
    expect(result.error.message).not.toContain("config-details-must-not-appear");
    expect(result.error.hint).toBe("Set SLACK_BOT_TOKEN.");
  });

  test("maps SLACK_AUTH_ERROR to INVALID_ARGUMENT with AUTH marker", async () => {
    const handler = createHandlerThrowingSlackError({
      code: "SLACK_AUTH_ERROR",
      message: "Slack auth rejected token.",
      hint: "Use a valid token.",
      details: "auth-details-must-not-appear",
    });

    const result = await runAttachmentGet(handler);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe("Slack auth rejected token. [AUTH_ERROR]");
    expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
    expect(result.error.message).not.toContain("auth-details-must-not-appear");
    expect(result.error.hint).toBe("Use a valid token.");
  });

  test("maps SLACK_API_ERROR to INVALID_ARGUMENT with API marker and details", async () => {
    const handler = createHandlerThrowingSlackError({
      code: "SLACK_API_ERROR",
      message: "Slack API request failed: file_not_found.",
      hint: "Verify file id and scopes.",
      details: "file_not_found",
    });

    const result = await runAttachmentGet(handler);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toBe(
      "Slack API request failed: file_not_found. file_not_found [SLACK_API_ERROR]",
    );
    expect(result.error.message).toContain("[SLACK_API_ERROR]");
    expect(result.error.message).toContain("file_not_found");
    expect(result.error.hint).toBe("Verify file id and scopes.");
  });

  test("maps SLACK_HTTP_ERROR to INTERNAL_ERROR without marker or details", async () => {
    const handler = createHandlerThrowingSlackError({
      code: "SLACK_HTTP_ERROR",
      message: "Slack HTTP transport failed with status 503.",
      hint: "Retry after backoff.",
      details: "http-details-must-not-appear",
    });

    const result = await runAttachmentGet(handler);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toBe("Slack HTTP transport failed with status 503.");
    expect(result.error.message).not.toContain("[AUTH_ERROR]");
    expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
    expect(result.error.message).not.toContain("http-details-must-not-appear");
    expect(result.error.hint).toBe("Retry after backoff.");
  });

  test("maps SLACK_RESPONSE_ERROR to INTERNAL_ERROR without marker or details", async () => {
    const handler = createHandlerThrowingSlackError({
      code: "SLACK_RESPONSE_ERROR",
      message: "Slack response payload is malformed.",
      hint: "Retry after validation fix.",
      details: "response-details-must-not-appear",
    });

    const result = await runAttachmentGet(handler);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toBe("Slack response payload is malformed.");
    expect(result.error.message).not.toContain("[AUTH_ERROR]");
    expect(result.error.message).not.toContain("[SLACK_API_ERROR]");
    expect(result.error.message).not.toContain("response-details-must-not-appear");
    expect(result.error.hint).toBe("Retry after validation fix.");
  });

  test("returns internal error when attachment client contract is unavailable", async () => {
    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({ listChannels: async () => ({ channels: [] }) }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["attachment", "get"],
      positionals: ["F123"],
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

    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toContain("client contract is unavailable");
  });
});
