import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("unknown command handling", () => {
  test("returns unknown command error", async () => {
    const result = await runCliWithBuffer(["nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr[0]).toBe("Unknown command: nope");
  });

  test("returns namespace-scoped hint for unknown subcommand", async () => {
    const result = await runCliWithBuffer(["auth", "foo"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr[0]).toBe("Unknown command: auth foo");
    expect(result.stderr[1]).toBe(
      "Available subcommands: check, whoami, login, logout, use. Run 'slack auth --help' to see details.",
    );
  });

  test("supports namespace alias: message -> messages", async () => {
    const result = await runCliWithBuffer(["message", "reply", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("messages reply requires <channel-id-or-permalink>");
  });

  test("routes bare messages subcommand by implicit messages namespace", async () => {
    const result = await runCliWithBuffer(["reply", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toContain("messages reply requires <channel-id-or-permalink>");
  });
});
