import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("help command", () => {
  test("prints help when no args", async () => {
    const result = await runCliWithBuffer([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("slack - Bun CLI for Slack workflows");
    expect(result.stderr.length).toBe(0);
  });
});
