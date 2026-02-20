import { describe, expect, test } from "bun:test";

import { buildBlocksFromMarkdown } from "../messages-post/block-builder";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

describe("messages post block builder limits", () => {
  test("truncates long header and appends overflow section", () => {
    const longHeader = `# ${"A".repeat(200)}`;
    const result = buildBlocksFromMarkdown(longHeader);

    expect(result.blocks.length).toBeGreaterThan(1);
    const firstBlock = result.blocks[0];
    expect(isRecord(firstBlock)).toBe(true);
    if (!isRecord(firstBlock)) {
      return;
    }
    expect(firstBlock.type).toBe("header");
  });

  test("splits long markdown section into multiple blocks", () => {
    const result = buildBlocksFromMarkdown("A".repeat(13000));
    expect(result.blocks.length).toBeGreaterThan(1);
  });

  test("caps rendered blocks to 50", () => {
    const markdown = Array.from({ length: 60 }, (_value, index) => `paragraph-${index}`).join(
      "\n\n",
    );
    const result = buildBlocksFromMarkdown(markdown);
    expect(result.blocks.length).toBe(50);
  });

  test("caps table rows and columns", () => {
    const headerCells = Array.from({ length: 25 }, (_value, index) => `h${index + 1}`);
    const dividerCells = Array.from({ length: 25 }, () => "---");
    const bodyRows = Array.from({ length: 120 }, (_value, rowIndex) => {
      return Array.from({ length: 25 }, (_inner, cellIndex) => `r${rowIndex + 1}c${cellIndex + 1}`);
    });

    const tableMarkdown = [
      `| ${headerCells.join(" | ")} |`,
      `| ${dividerCells.join(" | ")} |`,
      ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");

    const result = buildBlocksFromMarkdown(tableMarkdown);
    expect(result.attachments.length).toBe(1);

    const firstAttachment = result.attachments[0];
    expect(isRecord(firstAttachment)).toBe(true);
    if (!isRecord(firstAttachment)) {
      return;
    }

    const blocks = firstAttachment.blocks;
    expect(Array.isArray(blocks)).toBe(true);
    if (!Array.isArray(blocks)) {
      return;
    }

    const tableBlock = blocks[0];
    expect(isRecord(tableBlock)).toBe(true);
    if (!isRecord(tableBlock)) {
      return;
    }

    const rows = tableBlock.rows;
    expect(Array.isArray(rows)).toBe(true);
    if (!Array.isArray(rows)) {
      return;
    }

    expect(rows.length).toBe(100);
    for (const row of rows) {
      expect(Array.isArray(row)).toBe(true);
      if (!Array.isArray(row)) {
        return;
      }
      expect(row.length).toBe(20);
    }
  });
});
