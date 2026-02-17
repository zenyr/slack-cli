import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("help command", () => {
  test("prints help when no args", async () => {
    const result = await runCliWithBuffer([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("slack - Bun CLI for Slack workflows");
    expect(result.stdout.some((line) => line.includes("auth check"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("auth whoami"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("auth login"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("auth logout"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("auth use"))).toBe(true);
    expect(result.stderr.length).toBe(0);
  });
});
