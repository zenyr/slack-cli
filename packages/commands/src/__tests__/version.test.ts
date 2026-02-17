import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("version command", () => {
  test("prints version", async () => {
    const result = await runCliWithBuffer(["version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1.2.3");
    expect(result.stderr.length).toBe(0);
  });
});
