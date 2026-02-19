import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("batch command", () => {
  test("runs multiple commands and returns per-command results", async () => {
    const result = await runCliWithBuffer(["batch", "version", "help users", "tools", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) {
      return;
    }

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("batch");

    if (!isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.total).toBe(3);
    expect(parsed.data.succeeded).toBe(3);
    expect(parsed.data.failed).toBe(0);

    const results = Array.isArray(parsed.data.results) ? parsed.data.results : [];
    expect(results.length).toBe(3);
  });

  test("continues by default when one command fails", async () => {
    const result = await runCliWithBuffer([
      "batch",
      "version",
      "unknown command",
      "help",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.total).toBe(3);
    expect(parsed.data.succeeded).toBe(2);
    expect(parsed.data.failed).toBe(1);
  });

  test("stops when --stop-on-error is true", async () => {
    const result = await runCliWithBuffer([
      "batch",
      "version",
      "unknown command",
      "help",
      "--stop-on-error=true",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.total).toBe(2);
    expect(parsed.data.succeeded).toBe(1);
    expect(parsed.data.failed).toBe(1);
  });

  test("returns non-zero when --fail-on-error is true and a subcommand fails", async () => {
    const result = await runCliWithBuffer([
      "batch",
      "version",
      "unknown command",
      "--fail-on-error=true",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.total).toBe(2);
    expect(parsed.data.succeeded).toBe(1);
    expect(parsed.data.failed).toBe(1);
  });

  test("rejects nested batch command", async () => {
    const result = await runCliWithBuffer(["batch", 'batch "version"', "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBe(0);

    const parsed = parseJsonOutput(result.stdout);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return;
    }

    expect(parsed.data.failed).toBe(1);
    const entries = Array.isArray(parsed.data.results) ? parsed.data.results : [];
    const first = entries[0];
    if (!isRecord(first) || !isRecord(first.result)) {
      return;
    }

    expect(first.result.ok).toBe(false);
  });
});
