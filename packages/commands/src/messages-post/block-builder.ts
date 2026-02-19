import type { BlockBuilder } from "@exodus/slack-block-builder";
import { Blocks, Message } from "@exodus/slack-block-builder";

import { convertMarkdownToSlackMrkdwn } from "./markdown";

export type SlackBlockObject = Record<string, unknown>;
export type SlackAttachmentObject = Record<string, unknown>;

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
  const rowElements = rows.map((row) => {
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

export const buildBlocksFromMarkdown = (input: string): BuildBlocksResult => {
  const lines = input.split("\n");
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
      blocks.push(buildHeaderBlock(headingText));
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

    blocks.push(buildSectionBlock(paragraphLines.join("\n")));
  }

  if (blocks.length === 0) {
    blocks.push(buildSectionBlock(input));
  }

  return {
    blocks,
    attachments,
  };
};
