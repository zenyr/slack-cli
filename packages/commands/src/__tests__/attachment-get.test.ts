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
  });

  test("maps SLACK_API_ERROR to invalid argument with marker", async () => {
    const handler = createAttachmentGetHandler({
      env: {},
      createClient: () => ({
        fetchFileInfo: async () => {
          throw createSlackClientError({
            code: "SLACK_API_ERROR",
            message: "Slack API request failed: file_not_found.",
            hint: "Verify file id and scopes.",
            details: "file_not_found",
          });
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
