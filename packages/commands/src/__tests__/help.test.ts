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

  test("messages namespace help includes supported search and replies options", async () => {
    const result = await runCliWithBuffer(["messages", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.some((line) =>
        line.includes("post <channel-id> <text> [--thread-ts=<ts>] [--json]"),
      ),
    ).toBe(true);
    expect(result.stdout.some((line) => line.includes("search <query> [--channel"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("--after <YYYY-MM-DD|1d|1w|30d|90d>"))).toBe(
      true,
    );
    expect(result.stdout.some((line) => line.includes("--before <YYYY-MM-DD|1d|1w|30d|90d>"))).toBe(
      true,
    );
    expect(result.stdout.some((line) => line.includes("--threads"))).toBe(true);
    expect(
      result.stdout.some((line) =>
        line.includes(
          "replies <channel-id> <thread-ts> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--json]",
        ),
      ),
    ).toBe(true);
    expect(result.stdout.some((line) => line.includes("--sort=<oldest|newest>"))).toBe(false);
    expect(result.stdout.some((line) => line.includes("--filter-text=<text>"))).toBe(false);
    expect(result.stderr.length).toBe(0);
  });

  test("users namespace help shows optional query syntax", async () => {
    const result = await runCliWithBuffer(["users", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.some((line) =>
        line.includes("list [<query>] [--cursor=<cursor>] [--limit=<n>] [--json]"),
      ),
    ).toBe(true);
    expect(
      result.stdout.some((line) =>
        line.includes("search [<query>] [--cursor=<cursor>] [--limit=<n>] [--json]"),
      ),
    ).toBe(true);
    expect(result.stdout.some((line) => line.includes("xoxc"))).toBe(false);
    expect(result.stdout.some((line) => line.includes("xoxd"))).toBe(false);
    expect(result.stdout.some((line) => line.includes("list [<query>] [--json]"))).toBe(false);
    expect(result.stderr.length).toBe(0);
  });

  test("users list pagination options are exposed in command diagnostics", async () => {
    const cursorResult = await runCliWithBuffer(["users", "list", "--cursor"]);
    const limitResult = await runCliWithBuffer(["users", "list", "--limit"]);

    expect(cursorResult.exitCode).toBe(2);
    expect(cursorResult.stderr.some((line) => line.includes("--cursor=<cursor>"))).toBe(true);

    expect(limitResult.exitCode).toBe(2);
    expect(limitResult.stderr.some((line) => line.includes("--limit=<n>"))).toBe(true);
  });

  test("usergroups namespace help shows extended list and users update syntax", async () => {
    const result = await runCliWithBuffer(["usergroups", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.some((line) =>
        line.includes(
          "list [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]",
        ),
      ),
    ).toBe(true);
    expect(
      result.stdout.some((line) =>
        line.includes("users update <usergroup-id> <user-id> [user-id ...] --yes [--json]"),
      ),
    ).toBe(true);
    expect(result.stderr.length).toBe(0);
  });

  test("unknown namespace returns error", async () => {
    const result = await runCliWithBuffer(["nope", "--help"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.some((line) => line.includes("Unknown namespace"))).toBe(true);
    expect(result.stderr.some((line) => line.includes("slack --help"))).toBe(true);
  });
});
