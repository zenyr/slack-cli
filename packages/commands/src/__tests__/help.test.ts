import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("help command", () => {
  test("root help shows top-level namespaces only", async () => {
    const result = await runCliWithBuffer([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("slack - Bun CLI for Slack workflows");

    // Top-level namespaces should be present
    expect(result.stdout.some((line) => line.includes("help"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("auth"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("channels"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("users"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("messages"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("resources"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("tools"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("version"))).toBe(true);

    // Specific subcommands should NOT be listed at root level
    expect(result.stdout.some((line) => line.includes("auth check"))).toBe(false);
    expect(result.stdout.some((line) => line.includes("auth whoami"))).toBe(false);

    expect(result.stderr.length).toBe(0);
  });

  test("--help flag shows root help", async () => {
    const result = await runCliWithBuffer(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("slack - Bun CLI for Slack workflows");
    expect(result.stderr.length).toBe(0);
  });

  test("namespace help shows scoped commands", async () => {
    const result = await runCliWithBuffer(["auth", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes("auth commands"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("check"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("whoami"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("login"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("logout"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("use"))).toBe(true);

    expect(result.stderr.length).toBe(0);
  });

  test("messages namespace help includes search filters", async () => {
    const result = await runCliWithBuffer(["messages", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes("search <query> [--channel"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("--after YYYY-MM-DD"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("--threads"))).toBe(true);
    expect(result.stderr.length).toBe(0);
  });

  test("users namespace help shows optional query syntax", async () => {
    const result = await runCliWithBuffer(["users", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes("list [<query>] [--json]"))).toBe(true);
    expect(result.stderr.length).toBe(0);
  });

  test("unknown namespace returns error", async () => {
    const result = await runCliWithBuffer(["nope", "--help"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.some((line) => line.includes("Unknown namespace"))).toBe(true);
    expect(result.stderr.some((line) => line.includes("slack --help"))).toBe(true);
  });
});
