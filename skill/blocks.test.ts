import { describe, expect, test } from "bun:test";

import { b, blocks, createSendHelpers } from "./blocks";

const processFor = (value: unknown) => ({
  stdout: new Response(JSON.stringify(value)).body,
  stderr: new Response("").body,
  exited: Promise.resolve(0),
});

describe("typed send helper results", () => {
  test("sendPost exposes top-level channel and ts while preserving the envelope", async () => {
    const envelope = {
      ok: true,
      command: "messages.post",
      message: "posted",
      data: { channel: "C123", ts: "1712345678.123456", message: { text: "hello" } },
    };
    const { sendPost } = createSendHelpers({ runSlack: () => processFor(envelope) });

    const result = await sendPost(
      blocks([b.section("hello")]),
      { channel: "#product" },
      { token: "xoxp" },
    );

    expect(result.channel).toBe("C123");
    expect(result.ts).toBe("1712345678.123456");
    expect(result.data).toEqual(envelope);
  });
});
