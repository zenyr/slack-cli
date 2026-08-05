import { describe, expect, test } from "bun:test";

import { resolveChannelReference } from "../channels/resolve";

describe("channel reference resolution", () => {
  test("returns IDs without listing channels", async () => {
    let listed = false;
    const channel = await resolveChannelReference("C123", {
      listChannels: async () => {
        listed = true;
        return { channels: [] };
      },
    });

    expect(channel).toBe("C123");
    expect(listed).toBe(false);
  });

  test("resolves #name exactly across pages", async () => {
    const cursors: (string | undefined)[] = [];
    const channel = await resolveChannelReference("#product", {
      listChannels: async (options) => {
        cursors.push(options.cursor);
        if (options.cursor === undefined) {
          return {
            channels: [{ id: "C1", name: "product-help", isPrivate: false, isArchived: false }],
            nextCursor: "page-2",
          };
        }
        return {
          channels: [{ id: "C2", name: "product", isPrivate: false, isArchived: false }],
        };
      },
    });

    expect(channel).toBe("C2");
    expect(cursors).toEqual([undefined, "page-2"]);
  });
});
