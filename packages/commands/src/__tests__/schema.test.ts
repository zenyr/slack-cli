import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("schema command", () => {
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
  });
});
