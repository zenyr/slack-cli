import { describe, expect, test } from "bun:test";

import { runCliWithBuffer } from "./test-utils";

describe("help command", () => {
  test("root help shows top-level namespaces only", async () => {
    const result = await runCliWithBuffer([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("slack - Bun CLI for Slack workflows");

    // Top-level namespaces should be present
    expect(result.stdout.some((line) => line.includes("help"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("schema"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("batch"))).toBe(true);
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
    expect(result.stdout.some((line) => line.includes("slack auth"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("check"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("whoami"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("login"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("logout"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("use"))).toBe(true);
    expect(
      result.stdout.some((line) => line.includes("auth login requires --type <xoxp|xoxb>.")),
    ).toBe(true);
    expect(
      result.stdout.some((line) => line.includes("Use --xoxp/--xoxb on target commands")),
    ).toBe(true);

    expect(result.stderr.length).toBe(0);
  });

  test("namespace token without help flag routes to namespace help", async () => {
    const result = await runCliWithBuffer(["channels"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes("slack channels"))).toBe(true);
    expect(result.stdout.some((line) => line.includes("list"))).toBe(true);
    expect(result.stderr.length).toBe(0);
  });

  test("channels help shows list query options", async () => {
    const result = await runCliWithBuffer(["channels", "list", "--help"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("[--query=<text>]");
    expect(output).toContain("[--query-targets=<name,topic,purpose>]");
  });

  test("exact messages replies help exposes its supported options", async () => {
    const result = await runCliWithBuffer(["messages", "replies", "--help"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("replies <channel-id(required,non-empty)>");
    expect(output).toContain("[--resolve-users[=<bool>]]");
    expect(output).not.toContain("messages search");
  });

  test("users namespace is compact and exact search help carries syntax", async () => {
    const index = await runCliWithBuffer(["users", "--help"]);
    const detail = await runCliWithBuffer(["users", "search", "--help"]);

    expect(index.exitCode).toBe(0);
    expect(index.stdout.join("\n")).not.toContain("--cursor");
    expect(detail.stdout.join("\n")).toContain(
      "search <query(required,non-empty)> [--cursor=<cursor>] [--limit=<n>] [--json]",
    );
    expect(detail.stdout.join("\n")).toContain('slack users search "Jane Doe"');
  });

  test("messages namespace help shows blocks-only payload rule", async () => {
    const result = await runCliWithBuffer(["messages", "post", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.some((line) =>
        line.includes("payload text optional only with non-empty blocks"),
      ),
    ).toBe(true);
  });

  test("attachment namespace help shows content and save modes", async () => {
    const result = await runCliWithBuffer(["attachment", "get", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.some((line) =>
        line.includes("get <file-id> [--content[=<bool>]] [--save[=<bool>]] [--json]"),
      ),
    ).toBe(true);
  });

  test("users list pagination options are exposed in command diagnostics", async () => {
    const cursorResult = await runCliWithBuffer(["users", "list", "--cursor"]);
    const limitResult = await runCliWithBuffer(["users", "list", "--limit"]);

    expect(cursorResult.exitCode).toBe(2);
    expect(cursorResult.stderr.some((line) => line.includes("--cursor=<cursor>"))).toBe(true);

    expect(limitResult.exitCode).toBe(2);
    expect(limitResult.stderr.some((line) => line.includes("--limit=<n>"))).toBe(true);
  });

  test("nested exact command help resolves the full path", async () => {
    const result = await runCliWithBuffer(["usergroups", "users", "update", "--help"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain(
      "users update <usergroup-id(required,non-empty)> <user-id(required,non-empty)> [user-id ...] --yes [--json]",
    );
    expect(output).not.toContain("include-disabled");
  });

  test("exact command help excludes sibling operations and exposes hot-path examples", async () => {
    const result = await runCliWithBuffer(["messages", "post", "--help"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("usage: slack messages post");
    expect(output).toContain('slack messages post C123 "Hello" --dry-run --xoxb');
    expect(output).toContain("details: slack schema messages post");
    expect(output).not.toContain("messages search");
    expect(output).not.toContain("messages replies");
  });

  test("namespace help is an operation index without option signatures", async () => {
    const result = await runCliWithBuffer(["messages", "--help"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("post");
    expect(output).toContain("search");
    expect(output).not.toContain("--thread-ts");
    expect(output).not.toContain("--resolve-users");
    expect(output).toContain("details: slack messages <command> --help");
  });

  test("unknown namespace returns error", async () => {
    const result = await runCliWithBuffer(["nope", "--help"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.some((line) => line.includes("Unknown namespace"))).toBe(true);
    expect(result.stderr.some((line) => line.includes("slack --help"))).toBe(true);
  });
});
