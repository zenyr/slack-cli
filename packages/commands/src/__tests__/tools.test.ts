import { describe, expect, test } from "bun:test";
import { TOOLS } from "@zenyr/slack-cli-config";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

const AUTHORITATIVE_UPSTREAM_TOOLS = [
  "conversations_history",
  "conversations_replies",
  "conversations_add_message",
  "reactions_add",
  "reactions_remove",
  "attachment_get_data",
  "conversations_search_messages",
  "conversations_unreads",
  "conversations_mark",
  "conversations_leave",
  "conversations_join",
  "channels_list",
  "channels_me",
  "usergroups_list",
  "usergroups_me",
  "usergroups_create",
  "usergroups_update",
  "usergroups_users_update",
  "users_search",
  "saved_list",
  "saved_update",
  "saved_clear_completed",
];

describe("tools command", () => {
  test("returns json for tools --json", async () => {
    const result = await runCliWithBuffer(["tools", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("tools");
    expect(parsed.data).toEqual(AUTHORITATIVE_UPSTREAM_TOOLS);
    expect(TOOLS).toEqual(AUTHORITATIVE_UPSTREAM_TOOLS);
  });
});
