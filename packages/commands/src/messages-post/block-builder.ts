import type { BlockBuilder } from "@exodus/slack-block-builder";
import { Blocks, Message } from "@exodus/slack-block-builder";

import { convertMarkdownToSlackMrkdwn } from "./markdown";

export type SlackBlockObject = Record<string, unknown>;
export type SlackAttachmentObject = Record<string, unknown>;

const MAX_HEADER_CHARS = 150;
const MAX_MARKDOWN_CHARS = 12000;
const MAX_BLOCKS = 50;
const MAX_TABLE_CELLS = 20;
const MAX_TABLE_ROWS = 100;
const TABLE_EMPTY_PLACEHOLDER = "\u200B";

type BuildBlocksResult = {
  blocks: SlackBlockObject[];
  attachments: SlackAttachmentObject[];
};

const isFenceStart = (line: string): boolean => {
  return line.trimStart().startsWith("```");
};

const isTableLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
};

const isTableDividerLine = (line: string): boolean => {
  const trimmed = line.trim().replaceAll(" ", "");
  return /^\|[:\-|]+\|$/.test(trimmed);
};

const parseTableRow = (line: string): string[] => {
  const trimmed = line.trim();
  const content = trimmed.slice(1, -1);
  return content.split("|").map((cell) => cell.trim());
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const buildBlockFromBuilder = (builder: BlockBuilder): SlackBlockObject => {
  const built = Message({ text: "block builder placeholder" }).blocks(builder).buildToObject();
  const blocksValue = built.blocks;
  if (!Array.isArray(blocksValue)) {
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "",
      },
    };
  }

  const first = blocksValue[0];
  if (!isRecord(first)) {
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "",
      },
    };
  }

  return first;
};

const buildSectionBlock = (markdownText: string): SlackBlockObject => {
  return buildBlockFromBuilder(
    Blocks.Section({ text: convertMarkdownToSlackMrkdwn(markdownText) }),
  );
};

const buildHeaderBlock = (plainText: string): SlackBlockObject => {
  return buildBlockFromBuilder(Blocks.Header({ text: plainText }));
};

const createTableAttachment = (rows: string[][]): SlackAttachmentObject => {
  const boundedRows = rows.slice(0, MAX_TABLE_ROWS).map((row) => {
    const boundedCells = row.slice(0, MAX_TABLE_CELLS).map((cell) => {
      return cell.length === 0 ? TABLE_EMPTY_PLACEHOLDER : cell;
    });
    return boundedCells;
  });

  const tableWidth = boundedRows.reduce((max, row) => {
    return row.length > max ? row.length : max;
  }, 0);

  const normalizedRows = boundedRows.map((row) => {
    const padded = [...row];
    while (padded.length < tableWidth) {
      padded.push(TABLE_EMPTY_PLACEHOLDER);
    }
    return padded;
  });

  const rowElements = normalizedRows.map((row) => {
    return row.map((cell) => {
      return {
        type: "raw_text",
        text: cell,
      };
    });
  });

  return {
    blocks: [
      {
        type: "table",
        rows: rowElements,
      },
    ],
  };
};

const buildTableFallbackSection = (tableLines: string[]): SlackBlockObject => {
  const codeBlock = `\`\`\`\n${tableLines.join("\n")}\n\`\`\``;
  return buildBlockFromBuilder(Blocks.Section({ text: codeBlock }));
};

const splitMarkdownByParagraph = (markdownText: string): string[] => {
  if (markdownText.length <= MAX_MARKDOWN_CHARS) {
    return [markdownText];
  }

  const paragraphs = markdownText.split("\n\n");
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_MARKDOWN_CHARS) {
      if (current.length > 0) {
        chunks.push(current);
        current = "";
      }

      let offset = 0;
      while (offset < paragraph.length) {
        const nextOffset = offset + MAX_MARKDOWN_CHARS;
        chunks.push(paragraph.slice(offset, nextOffset));
        offset = nextOffset;
      }

      continue;
    }

    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length > MAX_MARKDOWN_CHARS) {
      if (current.length > 0) {
        chunks.push(current);
      }
      current = paragraph;
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

export const buildBlocksFromMarkdown = (input: string): BuildBlocksResult => {
  // Unescape backslash-escaped backticks that shells produce in heredocs (e.g. \` → `).
  const lines = input.replaceAll("\\`", "`").split("\n");
  const blocks: SlackBlockObject[] = [];
  const attachments: SlackAttachmentObject[] = [];
  let cursor = 0;
  let tableIncluded = false;

  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      cursor += 1;
      continue;
    }

    if (isFenceStart(line)) {
      const chunk: string[] = [line];
      cursor += 1;
      while (cursor < lines.length) {
        const current = lines[cursor] ?? "";
        chunk.push(current);
        cursor += 1;
        if (isFenceStart(current)) {
          break;
        }
      }
      blocks.push(buildSectionBlock(chunk.join("\n")));
      continue;
    }

    const nextLine = lines[cursor + 1] ?? "";
    if (isTableLine(line) && isTableDividerLine(nextLine)) {
      const tableLines: string[] = [line, nextLine];
      cursor += 2;
      while (cursor < lines.length) {
        const current = lines[cursor] ?? "";
        if (!isTableLine(current)) {
          break;
        }
        tableLines.push(current);
        cursor += 1;
      }

      if (!tableIncluded) {
        const parsedRows = tableLines
          .filter((_value, index) => index !== 1)
          .map((value) => parseTableRow(value));
        attachments.push(createTableAttachment(parsedRows));
        tableIncluded = true;
      } else {
        blocks.push(buildTableFallbackSection(tableLines));
      }

      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch !== null) {
      const headingText = headingMatch[2] ?? "";
      if (headingText.length <= MAX_HEADER_CHARS) {
        blocks.push(buildHeaderBlock(headingText));
      } else {
        const clippedHeader = `${headingText.slice(0, MAX_HEADER_CHARS - 1)}…`;
        const overflowText = headingText.slice(MAX_HEADER_CHARS - 1);
        blocks.push(buildHeaderBlock(clippedHeader));
        if (overflowText.length > 0) {
          blocks.push(buildSectionBlock(overflowText));
        }
      }
      cursor += 1;
      continue;
    }

    const paragraphLines: string[] = [line];
    cursor += 1;
    while (cursor < lines.length) {
      const current = lines[cursor] ?? "";
      const currentTrimmed = current.trim();
      const followingLine = lines[cursor + 1] ?? "";

      if (currentTrimmed.length === 0) {
        break;
      }

      if (isFenceStart(current)) {
        break;
      }

      if (isTableLine(current) && isTableDividerLine(followingLine)) {
        break;
      }

      if (/^(#{1,3})\s+(.+)$/.test(currentTrimmed)) {
        break;
      }

      paragraphLines.push(current);
      cursor += 1;
    }

    const paragraphText = paragraphLines.join("\n");
    const chunks = splitMarkdownByParagraph(paragraphText);
    for (const chunk of chunks) {
      blocks.push(buildSectionBlock(chunk));
    }
  }

  if (blocks.length === 0) {
    const chunks = splitMarkdownByParagraph(input);
    for (const chunk of chunks) {
      blocks.push(buildSectionBlock(chunk));
    }
  }

  return {
    blocks: blocks.slice(0, MAX_BLOCKS),
    attachments,
  };
};
