import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";
import { createAttachmentGetHandler } from "../handlers/attachment-get";
import { createSlackClientError } from "../slack";

describe("attachment get command", () => {
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

  test("returns metadata envelope using i10 files.info client contract", async () => {
    const calls: string[] = [];

    const handler = createAttachmentGetHandler({
      env: {
        SLACK_MCP_ATTACHMENT_TOOL: "true",
      },
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
        fetchFileText: async (urlPrivate: string, maxBytes: number) => {
          expect(urlPrivate).toBe("https://files.slack.com/files-pri/T123-F999/download");
          expect(maxBytes).toBe(5 * 1024 * 1024);
          return {
            content: "incident line 1\nincident line 2",
            byteLength: 31,
            contentType: "text/plain",
          };
        },
        fetchFileBinary: async () => {
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
      },
      context: {
        version: "1.2.3",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("attachment.get");
    expect(calls).toEqual(["F999"]);
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(isRecord(result.data.file)).toBe(true);
    if (!isRecord(result.data.file)) {
      return;
    }

    expect(result.data.file.id).toBe("F999");
    expect(result.data.file.name).toBe("incident-log.txt");
    expect(result.data.file.mimetype).toBe("text/plain");
    expect(result.data.file.filetype).toBe("text");
    expect(result.data.file.size).toBe(128);
    expect(result.data.file.url_private).toBe(
      "https://files.slack.com/files-pri/T123-F999/download",
    );
    expect(isRecord(result.data.text)).toBe(true);
    if (!isRecord(result.data.text)) {
      return;
    }

    expect(result.data.text.content).toBe("incident line 1\nincident line 2");
    expect(result.data.text.byte_length).toBe(31);
    expect(result.data.text.content_type).toBe("text/plain");
  });

  test("returns deterministic INVALID_ARGUMENT when attachment tool env is disabled", async () => {
    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async () => {
          throw new Error("should not be called");
        },
        fetchFileText: async () => {
          throw new Error("should not be called");
        },
        fetchFileBinary: async () => {
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["attachment", "get"],
      positionals: ["F999"],
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
    expect(result.error.message).toContain("ATTACHMENT_TOOL_DISABLED");
    expect(result.error.hint).toContain("SLACK_MCP_ATTACHMENT_TOOL=true");
  });

  test("returns INVALID_ARGUMENT when metadata size exceeds text limit", async () => {
    const handler = createAttachmentGetHandler({
      env: {
        SLACK_MCP_ATTACHMENT_TOOL: "1",
      },
      createClient: () => ({
        fetchFileInfo: async () => {
          return {
            id: "F-LARGE",
            name: "huge-log.txt",
            size: 6 * 1024 * 1024,
            urlPrivate: "https://files.slack.com/files-pri/T123-F-LARGE/download",
          };
        },
        fetchFileText: async () => {
          throw new Error("should not be called");
        },
        fetchFileBinary: async () => {
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["attachment", "get"],
      positionals: ["F-LARGE"],
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
    expect(result.error.message).toContain("ATTACHMENT_TEXT_TOO_LARGE");
  });

  test("maps SLACK_API_ERROR to invalid argument with marker", async () => {
    const handler = createAttachmentGetHandler({
      env: {
        SLACK_MCP_ATTACHMENT_TOOL: "true",
      },
      createClient: () => ({
        fetchFileInfo: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: file_not_found.",
            hint: "Verify file id and scopes.",
            details: "file_not_found",
          });
        },
        fetchFileText: async () => {
          throw new Error("should not be called");
        },
        fetchFileBinary: async () => {
          throw new Error("should not be called");
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["attachment", "get"],
      positionals: ["F404"],
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
    expect(result.error.message).toContain("SLACK_API_ERROR");
    expect(result.error.message).toContain("file_not_found");
  });

  test("returns base64 payload for non-text MIME attachments", async () => {
    const handler = createAttachmentGetHandler({
      env: {
        SLACK_MCP_ATTACHMENT_TOOL: "true",
      },
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
        fetchFileText: async () => {
          throw new Error("should not be called");
        },
        fetchFileBinary: async (urlPrivate: string, maxBytes: number) => {
          expect(urlPrivate).toBe("https://files.slack.com/files-pri/T123-F-BINARY/download");
          expect(maxBytes).toBe(5 * 1024 * 1024);
          return {
            contentBase64: "AP9/",
            byteLength: 3,
            contentType: "image/png",
            encoding: "base64",
          };
        },
      }),
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
    });

    const result = await handler({
      commandPath: ["attachment", "get"],
      positionals: ["F-BINARY"],
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
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe("attachment.get");
    expect(isRecord(result.data)).toBe(true);
    if (!isRecord(result.data)) {
      return;
    }

    expect(isRecord(result.data.file)).toBe(true);
    if (!isRecord(result.data.file)) {
      return;
    }

    expect(result.data.file.id).toBe("F-BINARY");
    expect(result.data.file.mimetype).toBe("image/png");
    expect(isRecord(result.data.binary)).toBe(true);
    if (!isRecord(result.data.binary)) {
      return;
    }

    expect(result.data.binary.content_base64).toBe("AP9/");
    expect(result.data.binary.byte_length).toBe(3);
    expect(result.data.binary.content_type).toBe("image/png");
    expect(result.data.binary.encoding).toBe("base64");
  });

  test("returns internal error when attachment client contract is unavailable", async () => {
    const handler = createAttachmentGetHandler({
      env: {
        SLACK_MCP_ATTACHMENT_TOOL: "true",
      },
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
