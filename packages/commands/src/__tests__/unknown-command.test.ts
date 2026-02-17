import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("unknown command handling", () => {
  test("returns unknown command error", async () => {
    const result = await runCliWithBuffer(["nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr[0]).toBe("Unknown command: nope");
  });
});
