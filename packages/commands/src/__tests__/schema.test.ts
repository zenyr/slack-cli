import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("schema command", () => {
  test("guides unknown targets through narrow help discovery", async () => {
    const result = await runCliWithBuffer(["schema", "messages", "missing"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain(
      "Run 'slack --help' for namespaces, then 'slack <namespace> --help' for operations.",
    );
    expect(result.stderr.join("\n")).not.toContain("slack schema --json");
  });

  test("lists command schemas in json mode", async () => {
    const result = await runCliWithBuffer(["schema", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.command).toBe("schema");
    expect(Array.isArray(parsed.data.commands)).toBe(true);
  });

  test("supports a compact namespace index", async () => {
    const result = await runCliWithBuffer(["schema", "messages"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("- messages post:");
    expect(output).toContain("- messages search:");
    expect(output).not.toContain("supportsJsonOutput");
    expect(output).not.toContain("--thread-ts");
  });

  test("renders exact schema as a YAML-like whitelist with MCP alignment", async () => {
    const result = await runCliWithBuffer(["schema", "messages", "post"]);
    const output = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("command: messages post");
    expect(output).toContain("effect: mutate");
    expect(output).toContain("io: [json, stdin, payload, dry-run]");
    expect(output).toContain("auth: explicit[xoxp, xoxb]");
    expect(output).toContain("mcp: [conversations_add_message]");
    expect(output).toContain('  - slack messages post C123 "Hello" --dry-run --xoxb');
    expect(output).not.toContain("supportsJsonOutput");
    expect(output).not.toContain("conditionalSideEffects: []");
  });

  test("shows payload and dry-run capability for messages post", async () => {
    const result = await runCliWithBuffer(["schema", "messages", "post", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.name).toBe("messages post");
    expect(parsed.data.schema.supportsRawPayload).toBe(true);
    expect(parsed.data.schema.supportsDryRun).toBe(true);
    expect(parsed.data.schema.mutating).toBe(true);
    expect(parsed.data.schema.description).toContain(
      "payload text optional only with non-empty blocks",
    );
  });

  test("marks messages post-ephemeral as mutating", async () => {
    const result = await runCliWithBuffer(["schema", "messages", "post-ephemeral", "--json"]);
    const parsed = parseJsonOutput(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.mutating).toBe(true);
  });

  test("shows required users search query", async () => {
    const result = await runCliWithBuffer(["schema", "users", "search", "--json"]);
    const parsed = parseJsonOutput(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.args).toBe(
      "<query(required,non-empty)> [--cursor=<cursor>] [--limit=<n>] [--json]",
    );
  });

  test("shows channels list query metadata", async () => {
    const result = await runCliWithBuffer(["schema", "channels", "list", "--json"]);
    const parsed = parseJsonOutput(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.args).toContain("[--query=<text>]");
    expect(parsed.data.schema.args).toContain("[--query-targets=<name,topic,purpose>]");
  });

  test("shows payload and dry-run capability for views publish", async () => {
    const result = await runCliWithBuffer(["schema", "views", "publish", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.name).toBe("views publish");
    expect(parsed.data.schema.supportsRawPayload).toBe(true);
    expect(parsed.data.schema.supportsDryRun).toBe(true);
    expect(parsed.data.schema.supportsStdin).toBe(true);
    expect(parsed.data.schema.mutating).toBe(true);
  });

  test("shows dry-run capability for views clear", async () => {
    const result = await runCliWithBuffer(["schema", "views", "clear", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.name).toBe("views clear");
    expect(parsed.data.schema.supportsRawPayload).toBe(false);
    expect(parsed.data.schema.supportsDryRun).toBe(true);
    expect(parsed.data.schema.mutating).toBe(true);
  });

  test("shows attachment content and save modes", async () => {
    const result = await runCliWithBuffer(["schema", "attachment", "get", "--json"]);
    const parsed = parseJsonOutput(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.args).toBe(
      "<file-id> [--content[=<bool>]] [--save[=<bool>]] [--json]",
    );
    expect(parsed.data.schema.conditionalSideEffects).toEqual([
      {
        kind: "filesystem-write",
        when: "--save resolves to true and attachment download succeeds",
        description:
          "Creates a restricted temporary directory and writes the downloaded attachment to a restricted file.",
      },
    ]);
  });

  test("describes batch side effects as delegated and conditional", async () => {
    const result = await runCliWithBuffer(["schema", "batch", "--json"]);
    const parsed = parseJsonOutput(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.schema)) {
      return;
    }

    expect(parsed.data.schema.mutating).toBe(false);
    expect(parsed.data.schema.conditionalSideEffects).toEqual([
      {
        kind: "delegated-command",
        when: "one or more non-batch nested commands execute",
        description:
          "May perform every side effect of each nested command; nested batch commands are rejected.",
      },
    ]);
  });
});
