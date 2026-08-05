import { describe, expect, test } from "bun:test";

import { isRecord, parseJsonOutput, runCliWithBuffer } from "./test-utils";

describe("messages post payload artifact", () => {
  test("dry-run writes normalized payload that can be reused without reconversion", async () => {
    const path = `/var/folders/h0/gssn243n1pq7hr1v3lp2wbl00000gn/T/opencode/slack-payload-${crypto.randomUUID()}.json`;
    try {
      const prepared = await runCliWithBuffer([
        "messages",
        "post",
        "C123",
        "**release**",
        "--dry-run",
        `--payload-out=${path}`,
        "--json",
        "--xoxb",
      ]);
      expect(prepared.exitCode).toBe(0);
      expect(await Bun.file(path).exists()).toBe(true);

      const consumed = await runCliWithBuffer([
        "messages",
        "post",
        `--payload=@${path}`,
        "--dry-run",
        "--json",
        "--xoxb",
      ]);
      expect(consumed.exitCode).toBe(0);

      const preparedJson = parseJsonOutput(prepared.stdout);
      const consumedJson = parseJsonOutput(consumed.stdout);
      if (
        !isRecord(preparedJson) ||
        !isRecord(preparedJson.data) ||
        !isRecord(consumedJson) ||
        !isRecord(consumedJson.data)
      ) {
        throw new Error("expected structured dry-run output");
      }
      expect(consumedJson.data.request).toEqual(preparedJson.data.request);
    } finally {
      await Bun.file(path).delete();
    }
  });
});
