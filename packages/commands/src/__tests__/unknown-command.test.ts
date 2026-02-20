import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

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
    expect(result.stderr[1]).toBe("Run 'slack auth --help' to see available subcommands.");
  });
});
