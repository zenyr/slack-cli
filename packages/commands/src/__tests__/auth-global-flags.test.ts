import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("auth global token flags", () => {
  test("rejects auth login with --xoxb and suggests correct paths", async () => {
    const result = await runCliWithBuffer(["auth", "login", "--xoxb", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toBe("'auth' commands do not accept --xoxb.");
    expect(parsed.error.hint).toContain("slack auth login --type xoxb --token <token>");
    expect(parsed.error.hint).toContain("slack auth use xoxb");
    expect(parsed.error.hint).toContain("slack messages post <channel-id> <text> --xoxb");
  });

  test("rejects auth use with --xoxp and suggests positional target", async () => {
    const result = await runCliWithBuffer(["auth", "use", "--xoxp", "--json"]);

    expect(result.exitCode).toBe(2);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return;
    }

    expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error.message).toBe("'auth' commands do not accept --xoxp.");
    expect(parsed.error.hint).toContain("slack auth use xoxp");
    expect(parsed.error.hint).toContain("Use --xoxp only on target commands");
  });

  test("allows auth help even when token override flag is present", async () => {
    const result = await runCliWithBuffer(["auth", "--help", "--xoxb"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes("slack auth"))).toBe(true);
    expect(result.stderr.length).toBe(0);
  });
});
