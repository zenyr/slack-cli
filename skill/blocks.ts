/**
 * local slack skill — blocks.ts
 * Typed Block Kit builder helpers backed by @slack/types.
 *
 * Usage (inline bun script):
 *   bun ./skill/blocks.ts
 *
 * Or import in a one-off script:
 *   import { b, el, txt, blocks } from './skill/blocks.ts'
 *   const payload = blocks([b.header("Hello"), b.section("World")]);
 *   console.log(JSON.stringify(payload));
 */

import type {
  ActionsBlock,
  AnyBlock,
  Button,
  ContextActionsBlock,
  ContextBlock,
  DividerBlock,
  FeedbackButtons,
  HeaderBlock,
  IconButton,
  ImageBlock,
  ImageElement,
  InputBlock,
  MarkdownBlock,
  MrkdwnElement,
  Overflow,
  PlainTextElement,
  PlainTextOption,
  PlanBlock,
  RichTextBlock,
  RichTextElement,
  RichTextList,
  RichTextSection,
  RichTextText,
  SectionBlock,
  TableBlock,
  TaskCardBlock,
  VideoBlock,
} from "@slack/types";

// ── Runtime auto-fix helpers ───────────────────────────────────────────────

const _warn = (msg: string): void => {
  process.stderr.write(
    `[slack-skill] WARN: ${msg} No retry needed. Check final exit code for send result.\n`,
  );
};

type RawTextTableCell = { type: "raw_text"; text: string };
type TableCell = RawTextTableCell | RichTextBlock;
type TableColumnSetting = { align?: "left" | "center" | "right"; is_wrapped?: boolean };
type TableCellRendering = "auto" | "plain";
type BlockIdInput = string | { block_id?: unknown; blockId?: unknown };

const _truncate = (text: string, max: number, label: string): string => {
  if (text.length <= max) return text;
  _warn(`${label} truncated ${text.length}→${max} chars.`);
  return `${text.slice(0, max - 1)}…`;
};

const _slice = <T>(arr: T[], max: number, label: string): T[] => {
  if (arr.length <= max) return arr;
  _warn(`${label} sliced ${arr.length}→${max} items.`);
  return arr.slice(0, max);
};

const _isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const _readBlockIdValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (!_isRecord(value)) return undefined;
  if (typeof value.block_id === "string") return value.block_id;
  if (typeof value.blockId === "string") return value.blockId;
  return undefined;
};

const _normalizeBlockId = (value: BlockIdInput | undefined, label: string): string | undefined => {
  if (typeof value === "string") return value;
  if (!_isRecord(value)) return undefined;
  if (typeof value.block_id === "string") {
    if ("blockId" in value) {
      _warn(`${label} got both block_id and blockId; using block_id.`);
    }
    return value.block_id;
  }
  const block_id = _readBlockIdValue(value.block_id);
  if (block_id !== undefined) {
    _warn(`${label} auto-fixed nested block_id object -> string.`);
    return block_id;
  }
  if (typeof value.blockId === "string") {
    _warn(`${label} auto-fixed blockId -> block_id.`);
    return value.blockId;
  }
  if ("block_id" in value || "blockId" in value) {
    _warn(`${label} dropped invalid block_id; expected string.`);
  }
  return undefined;
};

const _normalizeBlockOpts = (
  opts: Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  const block_id = _normalizeBlockId(opts, label);
  const next: Record<string, unknown> = { ...opts };
  delete next.blockId;
  if (block_id === undefined) {
    delete next.block_id;
  } else {
    next.block_id = block_id;
  }
  return next;
};

const _withBlockId = (value: BlockIdInput | undefined, label: string): { block_id?: string } => {
  const block_id = _normalizeBlockId(value, label);
  return block_id ? { block_id } : {};
};

const _normalizeBlocks = (blockList: AnyBlock[], label: string): AnyBlock[] => {
  return blockList.map((block, index) => {
    if (!_isRecord(block)) return block;
    const block_id = _normalizeBlockId(block, `${label}[${index}]`);
    if (block_id === undefined && !("block_id" in block) && !("blockId" in block)) {
      return block;
    }
    const next: Record<string, unknown> = { ...block };
    delete next.blockId;
    if (block_id === undefined) {
      delete next.block_id;
    } else {
      next.block_id = block_id;
    }
    return next as unknown as AnyBlock;
  });
};

// ── Composition helpers ────────────────────────────────────────────────────

export const txt = {
  plain: (text: string, emoji = true): PlainTextElement => ({
    type: "plain_text",
    text,
    emoji,
  }),
  md: (text: string): MrkdwnElement => ({ type: "mrkdwn", text }),
};

// ── Element helpers ────────────────────────────────────────────────────────

export const el = {
  button: (
    text: string,
    action_id: string,
    opts: Partial<Pick<Button, "value" | "style" | "url" | "confirm">> = {},
  ): Button => ({ type: "button", text: txt.plain(text), action_id, ...opts }),

  imgEl: (image_url: string, alt_text: string): ImageElement => ({
    type: "image",
    image_url,
    alt_text,
  }),

  overflow: (action_id: string, options: PlainTextOption[]): Overflow => ({
    type: "overflow",
    action_id,
    options,
  }),

  option: (label: string, value: string, description?: string): PlainTextOption => ({
    text: txt.plain(label),
    value,
    ...(description ? { description: txt.plain(description) } : {}),
  }),

  // context_actions elements: FeedbackButtons | IconButton ONLY; confirmed working (xoxb, 2026-02-25)
  feedbackButtons: (
    action_id: string,
    posValue = "positive",
    negValue = "negative",
    posLabel = "👍",
    negLabel = "👎",
  ): FeedbackButtons => ({
    type: "feedback_buttons",
    action_id,
    positive_button: { text: txt.plain(posLabel), value: posValue },
    negative_button: { text: txt.plain(negLabel), value: negValue },
  }),

  // icon: currently only "trash" is supported by Slack API
  iconButton: (
    action_id: string,
    icon: string,
    accessibility_label: string,
    opts: Partial<Pick<IconButton, "value" | "visible_to_user_ids" | "confirm">> = {},
  ): IconButton => ({
    type: "icon_button",
    action_id,
    icon,
    text: txt.plain(accessibility_label),
    accessibility_label,
    ...opts,
  }),

  // rich_text helpers
  rtText: (text: string, opts: Partial<RichTextText> = {}): RichTextText => ({
    type: "text",
    text,
    ...opts,
  }),

  rtSection: (elements: RichTextSection["elements"]): RichTextSection => ({
    type: "rich_text_section",
    elements,
  }),

  rtList: (
    elements: RichTextList["elements"],
    style: "bullet" | "ordered" = "bullet",
  ): RichTextList => ({
    type: "rich_text_list",
    style,
    elements,
  }),
};

// ── plan / taskCard helpers ────────────────────────────────────────────────

type PlanTaskShorthand = {
  id?: string;
  task_id?: string;
  title: string;
  status?: string;
  details?: TaskCardBlock["details"];
  output?: TaskCardBlock["output"];
  sources?: TaskCardBlock["sources"];
  block_id?: string;
};

const STATUS_ALIASES: Record<string, TaskCardBlock["status"]> = {
  completed: "complete",
  done: "complete",
  failed: "error",
  running: "in_progress",
  progress: "in_progress",
};

const _normalizeStatus = (raw: string | undefined): TaskCardBlock["status"] => {
  const s = raw ?? "pending";
  return STATUS_ALIASES[s] ?? (s as TaskCardBlock["status"]);
};

const _normalizePlanTask = (t: TaskCardBlock | PlanTaskShorthand): TaskCardBlock => {
  if ("type" in t && t.type === "task_card") return t as TaskCardBlock;
  const task_id =
    ("task_id" in t ? t.task_id : undefined) ||
    ("id" in t ? (t as { id?: string }).id : undefined) ||
    `task_${Math.random().toString(36).slice(2, 8)}`;
  const status = _normalizeStatus((t as PlanTaskShorthand).status);
  const result: TaskCardBlock = { type: "task_card", task_id, title: t.title, status };
  if (t.details) result.details = t.details;
  if (t.output) result.output = t.output;
  if (t.sources) result.sources = t.sources;
  if (t.block_id) result.block_id = t.block_id;
  return result;
};

// ── Block helpers ──────────────────────────────────────────────────────────

export const b = {
  header: (text: string, block_id?: BlockIdInput): HeaderBlock => ({
    type: "header",
    text: txt.plain(_truncate(text, 150, "b.header()")),
    ..._withBlockId(block_id, "b.header()"),
  }),

  section: (
    text: string,
    opts: Partial<Pick<SectionBlock, "block_id" | "accessory" | "fields" | "expand">> & {
      blockId?: string;
    } = {},
  ): SectionBlock => ({
    type: "section",
    text: txt.md(_truncate(text, 3000, "b.section()")),
    expand: true,
    ..._normalizeBlockOpts(opts, "b.section()"),
  }),

  sectionFields: (
    fields: string[],
    optsOrBlockId:
      | BlockIdInput
      | (Partial<Pick<SectionBlock, "block_id" | "expand">> & { blockId?: string }) = {},
  ): SectionBlock => {
    const opts =
      typeof optsOrBlockId === "string"
        ? { block_id: optsOrBlockId }
        : _normalizeBlockOpts(optsOrBlockId, "b.sectionFields()");
    return {
      type: "section",
      fields: _slice(fields, 10, "b.sectionFields()").map((f) =>
        txt.md(_truncate(f, 2000, "b.sectionFields() field")),
      ),
      expand: true,
      ...opts,
    };
  },

  divider: (block_id?: BlockIdInput): DividerBlock => ({
    type: "divider",
    ..._withBlockId(block_id, "b.divider()"),
  }),

  // elements: ImageElement | PlainTextElement | MrkdwnElement only
  context: (
    elements: (ContextBlock["elements"][number] | string)[],
    optsOrBlockId: BlockIdInput | Partial<Pick<ContextBlock, "block_id">> = {},
  ): ContextBlock => {
    const opts =
      typeof optsOrBlockId === "string"
        ? { block_id: optsOrBlockId }
        : _normalizeBlockOpts(optsOrBlockId, "b.context()");
    return {
      type: "context",
      elements: _slice(elements, 10, "b.context()").map((el) => {
        if (typeof el === "string") {
          _warn(`b.context() got string, auto-fixed to txt.md().`);
          return txt.md(el);
        }
        return el;
      }),
      ...opts,
    };
  },

  // elements: FeedbackButtons | IconButton ONLY — any other type → invalid_blocks
  // confirmed working (xoxb, 2026-02-25)
  contextActions: (
    elements: ContextActionsBlock["elements"],
    block_id?: BlockIdInput,
  ): ContextActionsBlock => ({
    type: "context_actions",
    elements,
    ..._withBlockId(block_id, "b.contextActions()"),
  }),

  actions: (elements: ActionsBlock["elements"], block_id?: BlockIdInput): ActionsBlock => ({
    type: "actions",
    elements,
    ..._withBlockId(block_id, "b.actions()"),
  }),

  image: (
    image_url: string,
    alt_text: string,
    opts: Partial<Pick<ImageBlock, "title" | "block_id">> & { blockId?: string } = {},
  ): ImageBlock => ({
    type: "image",
    image_url,
    alt_text,
    ..._normalizeBlockOpts(opts, "b.image()"),
  }),

  markdown: (text: string, block_id?: BlockIdInput): MarkdownBlock => ({
    type: "markdown",
    text,
    ..._withBlockId(block_id, "b.markdown()"),
  }),

  richText: (elements: RichTextBlock["elements"], block_id?: BlockIdInput): RichTextBlock => ({
    type: "rich_text",
    elements,
    ..._withBlockId(block_id, "b.richText()"),
  }),

  input: (
    label: string,
    element: InputBlock["element"],
    opts: Partial<Pick<InputBlock, "block_id" | "hint" | "optional" | "dispatch_action">> & {
      blockId?: string;
    } = {},
  ): InputBlock => ({
    type: "input",
    label: txt.plain(label),
    element,
    ..._normalizeBlockOpts(opts, "b.input()"),
  }),

  // status is required per SDK type; default to "pending". Accepts aliases: "completed"→"complete", "done"→"complete", "failed"→"error", "running"/"progress"→"in_progress"
  taskCard: (
    task_id: string,
    title: string,
    status: TaskCardBlock["status"] | keyof typeof STATUS_ALIASES = "pending",
    opts: Partial<Pick<TaskCardBlock, "details" | "output" | "sources" | "block_id">> & {
      blockId?: string;
    } = {},
  ): TaskCardBlock => ({
    type: "task_card",
    task_id,
    title,
    status: _normalizeStatus(status),
    ..._normalizeBlockOpts(opts, "b.taskCard()"),
  }),

  plan: (
    title: string,
    tasks: (TaskCardBlock | PlanTaskShorthand)[] = [],
    block_id?: BlockIdInput,
  ): PlanBlock => ({
    type: "plan",
    title,
    tasks: tasks.map(_normalizePlanTask),
    ..._withBlockId(block_id, "b.plan()"),
  }),

  /**
   * Native Slack table block.
   *
   * @param headers - column header texts (max 20)
   * @param rows    - 2D array of cell texts (max 100 rows incl. header)
   * @param opts    - optional block_id, column_settings, cell_rendering
   *
   * Plain cells use `raw_text`. In the default `auto` mode, cells containing simple inline markdown become
   * `rich_text` cells. Use `cell_rendering: "plain"` when underscores or other mrkdwn markers are literal text.
   * Empty cells are auto-padded with ZWSP. Rows shorter than header count are padded.
   *
   * @example
   * b.table(
   *   ["Name", "Status", "Role"],
   *   [
   *     ["Alice", "Active", "Admin"],
   *     ["Bob", "Inactive", "Member"],
   *   ],
   * )
   */
  table: (
    headers: string[],
    rows: string[][],
    opts: {
      block_id?: string;
      blockId?: string;
      column_settings?: TableColumnSetting[];
      cell_rendering?: TableCellRendering;
    } = {},
  ): TableBlock => {
    const MAX_TABLE_CELLS = 20;
    const MAX_TABLE_ROWS = 100;

    const colCount = Math.min(
      _slice(headers, MAX_TABLE_CELLS, "b.table() headers").length,
      MAX_TABLE_CELLS,
    );

    const normalizeCell = (cell: string): TableCell => {
      const trimmed = cell.trim();
      if (trimmed.length === 0) return { type: "raw_text", text: "\u200B" };
      if (opts.cell_rendering === "plain") return { type: "raw_text", text: trimmed };
      return inlineRichTextCell(trimmed) ?? { type: "raw_text", text: trimmed };
    };

    const normalizeRow = (row: string[]) => {
      const sliced = row.slice(0, colCount);
      while (sliced.length < colCount) sliced.push("");
      return sliced.map(normalizeCell);
    };

    const allRows = [
      normalizeRow(headers),
      ..._slice(rows, MAX_TABLE_ROWS - 1, "b.table() rows").map(normalizeRow),
    ];

    return {
      type: "table",
      rows: allRows,
      ..._withBlockId(opts, "b.table()"),
      ...(opts.column_settings ? { column_settings: opts.column_settings } : {}),
    };
  },

  video: (
    video_url: string,
    thumbnail_url: string,
    title: string,
    alt_text: string,
    opts: Partial<
      Pick<
        VideoBlock,
        | "title_url"
        | "author_name"
        | "provider_name"
        | "provider_icon_url"
        | "description"
        | "block_id"
      >
    > & { blockId?: string } = {},
  ): VideoBlock => ({
    type: "video",
    video_url,
    thumbnail_url,
    title: txt.plain(title),
    alt_text,
    ..._normalizeBlockOpts(opts, "b.video()"),
  }),
};

const inlineRichTextCell = (text: string): RichTextBlock | undefined => {
  const elements: RichTextElement[] = [];
  const pattern =
    /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|<((?:https?:\/\/)[^>|]+)\|([^>]+)>|:([a-z0-9_+-]+):)/gi;
  let lastIndex = 0;
  let matched = false;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      elements.push({ type: "text", text: text.slice(lastIndex, index) });
    }

    if (match[2] !== undefined || match[3] !== undefined) {
      elements.push({ type: "text", text: match[2] ?? match[3] ?? "", style: { bold: true } });
    } else if (match[4] !== undefined) {
      elements.push({ type: "text", text: match[4], style: { italic: true } });
    } else if (match[5] !== undefined) {
      elements.push({ type: "text", text: match[5], style: { italic: true } });
    } else if (match[6] !== undefined) {
      elements.push({ type: "text", text: match[6], style: { strike: true } });
    } else if (match[7] !== undefined) {
      elements.push({ type: "text", text: match[7], style: { code: true } });
    } else if (match[8] !== undefined && match[9] !== undefined) {
      elements.push({ type: "link", text: match[8], url: match[9] });
    } else if (match[10] !== undefined && match[11] !== undefined) {
      elements.push({ type: "link", text: match[11], url: match[10] });
    } else if (match[12] !== undefined) {
      elements.push({ type: "emoji", name: match[12] });
    }

    matched = true;
    lastIndex = index + match[0].length;
  }

  if (!matched) return undefined;
  if (lastIndex < text.length) {
    elements.push({ type: "text", text: text.slice(lastIndex) });
  }

  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements }],
  };
};

// ── Payload assembler ──────────────────────────────────────────────────────

export const blocks = (
  blockList: AnyBlock[],
  opts?: { text?: string },
): { text: string; blocks: AnyBlock[] } => {
  const safe = _normalizeBlocks(_slice(blockList, 50, "blocks()"), "blocks()");
  return {
    text: opts?.text ?? deriveText(safe),
    blocks: safe,
  };
};

export type MessagePayload = {
  text: string;
  blocks?: AnyBlock[];
  attachments?: Record<string, unknown>[];
};

export const payload = (
  value: AnyBlock[] | MessagePayload,
  overrides: Partial<MessagePayload> = {},
): MessagePayload => {
  const base: MessagePayload = Array.isArray(value) ? blocks(value) : value;
  const blockList = overrides.blocks ?? base.blocks;
  const attachmentList = overrides.attachments ?? base.attachments;
  const normalizedBlocks =
    blockList !== undefined
      ? _normalizeBlocks(_slice(blockList, 50, "payload.blocks"), "payload.blocks")
      : undefined;

  return {
    text: overrides.text ?? base.text,
    ...(normalizedBlocks !== undefined ? { blocks: normalizedBlocks } : {}),
    ...(attachmentList !== undefined ? { attachments: attachmentList } : {}),
  };
};

/** Strip mrkdwn symbols for plaintext fallback */
const _stripMrkdwn = (s: string): string => s.replace(/\u200B/g, "").replace(/[*_~`]/g, "");

const richTextToPlain = (block: RichTextBlock): string => {
  const parts: string[] = [];
  for (const item of block.elements) {
    if (item.type !== "rich_text_section") continue;
    for (const element of item.elements) {
      if (element.type === "text") {
        parts.push(element.text);
      } else if (element.type === "link") {
        parts.push(element.text ?? element.url);
      } else if (element.type === "emoji") {
        parts.push(`:${element.name}:`);
      } else if (element.type === "user") {
        parts.push(`<@${element.user_id}>`);
      } else if (element.type === "channel") {
        parts.push(`<#${element.channel_id}>`);
      } else if (element.type === "usergroup") {
        parts.push(`<!subteam^${element.usergroup_id}>`);
      }
    }
  }
  return parts.join("");
};

const summarizeTableBlock = (block: TableBlock): string => {
  const rows = block.rows.filter((row) => isTableRow(row));
  if (rows.length === 0) return "Slack table";

  const headerRow = rows[0] ?? [];
  const headers = headerRow
    .map((cell) => (cell.type === "raw_text" ? cell.text : richTextToPlain(cell)))
    .map((text) => text.replace(/\u200B/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  const summary = headers.length > 0 ? headers.join(" | ") : "Slack table";
  const rowCount = Math.max(0, rows.length - 1);
  return rowCount > 0 ? `${summary} (${rowCount} row${rowCount === 1 ? "" : "s"})` : summary;
};

/** Extract all readable text from blocks → plaintext fallback */
const deriveText = (blockList: AnyBlock[]): string => {
  const parts: string[] = [];
  for (const blk of blockList) {
    if (blk.type === "header") {
      parts.push((blk as HeaderBlock).text.text);
    } else if (blk.type === "section") {
      const s = blk as SectionBlock;
      if (s.text) parts.push(_stripMrkdwn(s.text.text));
      if (s.fields) parts.push(...s.fields.map((f) => _stripMrkdwn(f.text)));
    } else if (blk.type === "context") {
      const c = blk as ContextBlock;
      for (const el of c.elements) {
        if ("text" in el && typeof el.text === "string") {
          parts.push(_stripMrkdwn(el.text));
        }
      }
    } else if (blk.type === "markdown") {
      parts.push(_stripMrkdwn((blk as MarkdownBlock).text));
    } else if (blk.type === "input") {
      const input = blk as InputBlock;
      parts.push(input.label.text);
      const hint = input.hint;
      if (hint?.text) {
        parts.push(hint.text);
      }
    } else if (blk.type === "actions") {
      for (const element of (blk as ActionsBlock).elements) {
        if ("text" in element && element.text && typeof element.text === "object") {
          parts.push(element.text.text);
        }
      }
    } else if (isTableBlock(blk)) {
      parts.push(summarizeTableBlock(blk));
    } else if (blk.type === "video") {
      parts.push((blk as VideoBlock).title.text);
    }
  }
  return parts.join("\n").slice(0, 3000) || "Slack message";
};

// ── mrkdwn format helpers ──────────────────────────────────────────────────
//
// Slack mrkdwn closing delimiter (*/_/~) followed immediately by CJK chars
// (no whitespace) breaks rendering — the delimiter is treated as literal text.
// Fix: always append ZWSP after closing delimiter. Invisible + safe unconditionally.
//
// Pattern:  `*text*` + ZWSP   → bold
//           `_text_` + ZWSP   → italic
//           `~text~` + ZWSP   → strikethrough
//           `` `text` `` + ZWSP → inline code (same issue)
//
// Usage:  fmt.bold("굵게") + "한글"  →  *굵게*\u200B한글  ✓
//         `${fmt.bold("수정")}완료`   →  *수정*\u200B완료  ✓

const ZWSP = "\u200B";

export const fmt = {
  bold: (text: string): string => `*${text}*${ZWSP}`,
  italic: (text: string): string => `_${text}_${ZWSP}`,
  strike: (text: string): string => `~${text}~${ZWSP}`,
  code: (text: string): string => `\`${text}\`${ZWSP}`,
  /** No ZWSP needed — block-level, always followed by newline */
  pre: (text: string): string => `\`\`\`${text}\`\`\``,
  link: (url: string, label?: string): string => (label ? `<${url}|${label}>` : `<${url}>`),
};

/** @deprecated use fmt.bold */
export const bold = fmt.bold;

// ── send helper ────────────────────────────────────────────────────────────

import * as v from "valibot";

// Runtime schemas
const TokenSchema = v.picklist(["xoxp", "xoxb"] as const);
const TsSchema = v.pipe(v.string(), v.regex(/^\d+\.\d+$/, "ts must be a Slack ts (digits.digits)"));
const UserIdSchema = v.pipe(
  v.string(),
  v.regex(/^U[A-Z0-9]+$/, "user must be a Slack user ID (U...)"),
);

const ChannelIdSchema = v.pipe(
  v.string(),
  v.regex(/^[CGD][A-Z0-9]+$/, "channel must be a Slack channel ID (C.../G.../D...)"),
);
const ChannelReferenceSchema = v.pipe(
  v.string(),
  v.regex(
    /^(?:[CGD][A-Z0-9]+|#?[a-z0-9_-]+)$/i,
    "channel must be a Slack channel ID, #name, or bare name",
  ),
);

const TransportSchema = v.object({
  token: TokenSchema,
  dryRun: v.optional(v.boolean()),
  json: v.optional(v.boolean()),
});

const PostTargetSchema = v.object({ channel: ChannelReferenceSchema });
const ReplyTargetSchema = v.object({ channel: ChannelReferenceSchema, replyTs: TsSchema });
const UpdateTargetSchema = v.object({ channel: ChannelIdSchema, updateTs: TsSchema });
const EphemeralPostTargetSchema = v.object({
  channel: ChannelIdSchema,
  user: UserIdSchema,
});
const EphemeralReplyTargetSchema = v.object({
  channel: ChannelIdSchema,
  replyTs: TsSchema,
  user: UserIdSchema,
});

export type SendTransport = v.InferInput<typeof TransportSchema>;
export type SendPostTarget = v.InferInput<typeof PostTargetSchema>;
export type SendReplyTarget = v.InferInput<typeof ReplyTargetSchema>;
export type SendUpdateTarget = v.InferInput<typeof UpdateTargetSchema>;
export type SendEphemeralPostTarget = v.InferInput<typeof EphemeralPostTargetSchema>;
export type SendEphemeralReplyTarget = v.InferInput<typeof EphemeralReplyTargetSchema>;

export type SendResult<TData = unknown> = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  data?: TData;
};

type MessageRequestData = {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: AnyBlock[];
  attachments?: Record<string, unknown>[];
};

type PostDryRunData = { dryRun: true; request: MessageRequestData };
type PostSuccessData = {
  channel: string;
  ts: string;
  thread_ts?: string;
  message?: unknown;
};
type EphemeralRequestData = MessageRequestData & { user: string };
type EphemeralDryRunData = { dryRun: true; request: EphemeralRequestData };
type EphemeralSuccessData = {
  channel: string;
  user: string;
  message_ts: string;
};
type UpdateRequestData = {
  channel: string;
  ts: string;
  text: string;
  blocks?: AnyBlock[];
  attachments?: Record<string, unknown>[];
};
type UpdateDryRunData = { dryRun: true; request: UpdateRequestData };
type UpdateSuccessData = { channel: string; ts: string };

export type SendPostJson = {
  ok: true;
  command: "messages.post";
  message: string;
  data: PostDryRunData | PostSuccessData;
};

export type SendReplyJson = {
  ok: true;
  command: "messages.post" | "messages.reply";
  message: string;
  data: PostDryRunData | (PostSuccessData & { thread_ts: string });
};

export type SendUpdateJson = {
  ok: true;
  command: "messages.update";
  message: string;
  data: UpdateDryRunData | UpdateSuccessData;
};

export type SendEphemeralPostJson = {
  ok: true;
  command: "messages.post-ephemeral";
  message: string;
  data: EphemeralDryRunData | EphemeralSuccessData;
};

export type SendEphemeralReplyJson = {
  ok: true;
  command: "messages.post-ephemeral";
  message: string;
  data: EphemeralDryRunData;
};

export type SchemaJson = {
  ok: true;
  command: "schema";
  message: string;
  data: unknown;
};

type MessageCoordinates = { channel?: string; ts?: string };

export type SendPostResult = SendResult<SendPostJson> & MessageCoordinates;
export type SendReplyResult = SendResult<SendReplyJson> & MessageCoordinates;
export type SendUpdateResult = SendResult<SendUpdateJson>;
export type SendEphemeralPostResult = SendResult<SendEphemeralPostJson>;
export type SendEphemeralReplyResult = SendResult<SendEphemeralReplyJson>;
export type InspectSchemaResult = SendResult<SchemaJson>;

type SpawnedSlackProcess = {
  stdout: ReadableStream;
  stderr: ReadableStream;
  exited: Promise<number>;
};

type SlackRunner = (argv: string[]) => SpawnedSlackProcess;

type SendDeps = {
  runSlack: SlackRunner;
};

type CliRequestPayload = MessagePayload & {
  channel?: string;
  user?: string;
  ts?: string;
  thread_ts?: string;
};

const defaultRunSlack: SlackRunner = (argv) => {
  return Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
  });
};

const parseJsonIfPossible = (stdout: string): unknown | undefined => {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const _isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const isAnyBlockArray = (value: unknown): value is AnyBlock[] => {
  return Array.isArray(value);
};

const isUnknownRecordArray = (value: unknown): value is Record<string, unknown>[] => {
  return Array.isArray(value) && value.every((item) => isRecord(item));
};

const isTableCell = (value: unknown): value is TableCell => {
  return (
    (isRecord(value) && value.type === "raw_text" && typeof value.text === "string") ||
    (isRecord(value) && value.type === "rich_text" && Array.isArray(value.elements))
  );
};

const isTableRow = (value: unknown): value is TableCell[] => {
  return Array.isArray(value) && value.every((item) => isTableCell(item));
};

const isTableBlock = (value: AnyBlock): value is TableBlock => {
  return value.type === "table" && "rows" in value && Array.isArray(value.rows);
};

const isMessageRequestData = (value: unknown): value is MessageRequestData => {
  if (!isRecord(value) || typeof value.channel !== "string" || typeof value.text !== "string") {
    return false;
  }

  if (value.thread_ts !== undefined && typeof value.thread_ts !== "string") {
    return false;
  }

  if (value.blocks !== undefined && !isAnyBlockArray(value.blocks)) {
    return false;
  }

  if (value.attachments !== undefined && !isUnknownRecordArray(value.attachments)) {
    return false;
  }

  return true;
};

const isPostDryRunData = (value: unknown): value is PostDryRunData => {
  return isRecord(value) && value.dryRun === true && isMessageRequestData(value.request);
};

const isPostSuccessData = (value: unknown): value is PostSuccessData => {
  return (
    isRecord(value) &&
    typeof value.channel === "string" &&
    typeof value.ts === "string" &&
    (value.thread_ts === undefined || typeof value.thread_ts === "string")
  );
};

const isEphemeralRequestData = (value: unknown): value is EphemeralRequestData => {
  return (
    isRecord(value) &&
    typeof value.channel === "string" &&
    typeof value.user === "string" &&
    typeof value.text === "string" &&
    (value.thread_ts === undefined || typeof value.thread_ts === "string") &&
    (value.blocks === undefined || isAnyBlockArray(value.blocks)) &&
    (value.attachments === undefined || isUnknownRecordArray(value.attachments))
  );
};

const isEphemeralDryRunData = (value: unknown): value is EphemeralDryRunData => {
  return isRecord(value) && value.dryRun === true && isEphemeralRequestData(value.request);
};

const isEphemeralSuccessData = (value: unknown): value is EphemeralSuccessData => {
  return (
    isRecord(value) &&
    typeof value.channel === "string" &&
    typeof value.user === "string" &&
    typeof value.message_ts === "string"
  );
};

const isUpdateRequestData = (value: unknown): value is UpdateRequestData => {
  return (
    isRecord(value) &&
    typeof value.channel === "string" &&
    typeof value.ts === "string" &&
    typeof value.text === "string" &&
    (value.blocks === undefined || isAnyBlockArray(value.blocks)) &&
    (value.attachments === undefined || isUnknownRecordArray(value.attachments))
  );
};

const isUpdateDryRunData = (value: unknown): value is UpdateDryRunData => {
  return isRecord(value) && value.dryRun === true && isUpdateRequestData(value.request);
};

const isUpdateSuccessData = (value: unknown): value is UpdateSuccessData => {
  return isRecord(value) && typeof value.channel === "string" && typeof value.ts === "string";
};

const isSendPostJson = (value: unknown): value is SendPostJson => {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.command === "messages.post" &&
    typeof value.message === "string" &&
    (isPostDryRunData(value.data) || isPostSuccessData(value.data))
  );
};

const isSendReplyJson = (value: unknown): value is SendReplyJson => {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.command === "messages.post" || value.command === "messages.reply") &&
    typeof value.message === "string" &&
    (isPostDryRunData(value.data) ||
      (isPostSuccessData(value.data) && typeof value.data.thread_ts === "string"))
  );
};

const withMessageCoordinates = <TData extends SendPostJson | SendReplyJson>(
  result: SendResult<TData>,
): SendResult<TData> & MessageCoordinates => {
  const responseData = result.data?.data;
  if (!isPostSuccessData(responseData)) {
    return result;
  }
  return { ...result, channel: responseData.channel, ts: responseData.ts };
};

const isSendUpdateJson = (value: unknown): value is SendUpdateJson => {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.command === "messages.update" &&
    typeof value.message === "string" &&
    (isUpdateDryRunData(value.data) || isUpdateSuccessData(value.data))
  );
};

const isSendEphemeralPostJson = (value: unknown): value is SendEphemeralPostJson => {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.command === "messages.post-ephemeral" &&
    typeof value.message === "string" &&
    (isEphemeralDryRunData(value.data) || isEphemeralSuccessData(value.data))
  );
};

const isSendEphemeralReplyJson = (value: unknown): value is SendEphemeralReplyJson => {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.command === "messages.post-ephemeral" &&
    typeof value.message === "string" &&
    isEphemeralDryRunData(value.data)
  );
};

const isSchemaJson = (value: unknown): value is SchemaJson => {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.command === "schema" &&
    typeof value.message === "string" &&
    "data" in value
  );
};

const streamToText = async (stream: ReadableStream): Promise<string> => {
  return await new Response(stream).text();
};

const readProcessOutput = async (proc: SpawnedSlackProcess) => {
  const [stdout, stderr, exitCode] = await Promise.all([
    streamToText(proc.stdout),
    streamToText(proc.stderr),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
};

const buildCliRequestPayload = (
  message: MessagePayload,
  extra: Omit<CliRequestPayload, "text" | "blocks" | "attachments">,
): CliRequestPayload => {
  return {
    ...extra,
    ...payload(message),
  };
};

const readTypedJson = <TData>(
  stdout: string,
  guard: ((value: unknown) => value is TData) | undefined,
): TData | undefined => {
  const parsed = parseJsonIfPossible(stdout);
  if (parsed === undefined) {
    return undefined;
  }
  if (guard === undefined) {
    return undefined;
  }
  if (!guard(parsed)) {
    throw new Error(`Unexpected structured output from slack CLI: ${stdout.trim()}`);
  }
  return parsed;
};

/**
 * Build and send a Block Kit payload via `slack` CLI.
 * Fails fast — throws if `slack` exits non-zero, so callers don't silently post broken JSON.
 */
const sendCore = async <TData>(
  message: CliRequestPayload,
  args: string[],
  transport: SendTransport,
  deps: SendDeps,
  guard?: (value: unknown) => value is TData,
): Promise<SendResult<TData>> => {
  const PAYLOAD_SOFT_LIMIT = 35_000;
  const serialized = JSON.stringify(message);
  if (serialized.length > PAYLOAD_SOFT_LIMIT && message.text && message.blocks?.length) {
    const budget = Math.max(
      100,
      message.text.length - (serialized.length - PAYLOAD_SOFT_LIMIT) - 500,
    );
    message.text = `${message.text.slice(0, budget)}…`;
    _warn(
      `text auto-truncated to ${budget} chars (payload ${serialized.length}B exceeded ${PAYLOAD_SOFT_LIMIT}B soft limit). Blocks preserved.`,
    );
  }

  const tokenFlag = `--${transport.token}`;
  const fullArgs = [
    "slack",
    ...args,
    `--payload=${JSON.stringify(message)}`,
    ...(transport.dryRun === true ? ["--dry-run"] : []),
    ...(transport.json === false ? [] : ["--json"]),
    tokenFlag,
  ];

  const proc = deps.runSlack(fullArgs);
  const { stdout, stderr, exitCode } = await readProcessOutput(proc);

  if (exitCode !== 0) {
    throw new Error(
      `slack CLI exited ${exitCode}\nstderr: ${stderr.trim()}\nstdout: ${stdout.trim()}`,
    );
  }

  return { ok: true, stdout, stderr, exitCode, data: readTypedJson(stdout, guard) };
};

export const inspectSchema = async (
  commandPath: string[] = [],
  deps: Partial<SendDeps> = {},
): Promise<InspectSchemaResult> => {
  const runSlack = deps.runSlack ?? defaultRunSlack;
  const proc = runSlack(["slack", "schema", ...commandPath, "--json"]);
  const { stdout, stderr, exitCode } = await readProcessOutput(proc);

  if (exitCode !== 0) {
    throw new Error(
      `slack CLI exited ${exitCode}\nstderr: ${stderr.trim()}\nstdout: ${stdout.trim()}`,
    );
  }

  return { ok: true, stdout, stderr, exitCode, data: readTypedJson(stdout, isSchemaJson) };
};

export const createSendHelpers = (deps: Partial<SendDeps> = {}) => {
  const resolvedDeps: SendDeps = {
    runSlack: deps.runSlack ?? defaultRunSlack,
  };

  const sendPost = async (
    message: MessagePayload,
    target: SendPostTarget,
    transport: SendTransport,
  ): Promise<SendPostResult> => {
    const t = v.parse(PostTargetSchema, target);
    const tr = v.parse(TransportSchema, transport);
    const result = await sendCore(
      buildCliRequestPayload(message, { channel: t.channel }),
      ["messages", "post"],
      {
        ...tr,
        json: true,
      },
      resolvedDeps,
      isSendPostJson,
    );
    return withMessageCoordinates(result);
  };

  const sendReply = async (
    message: MessagePayload,
    target: SendReplyTarget,
    transport: SendTransport,
  ): Promise<SendReplyResult> => {
    const t = v.parse(ReplyTargetSchema, target);
    const tr = v.parse(TransportSchema, transport);
    const result = await sendCore(
      buildCliRequestPayload(message, { channel: t.channel, thread_ts: t.replyTs }),
      ["messages", "post"],
      { ...tr, json: true },
      resolvedDeps,
      isSendReplyJson,
    );
    return withMessageCoordinates(result);
  };

  const sendUpdate = async (
    message: MessagePayload,
    target: SendUpdateTarget,
    transport: SendTransport,
  ): Promise<SendUpdateResult> => {
    const t = v.parse(UpdateTargetSchema, target);
    const tr = v.parse(TransportSchema, transport);
    return sendCore(
      buildCliRequestPayload(message, { channel: t.channel, ts: t.updateTs }),
      ["messages", "update"],
      { json: true, ...tr },
      resolvedDeps,
      isSendUpdateJson,
    );
  };

  const sendEphemeralPost = async (
    message: MessagePayload,
    target: SendEphemeralPostTarget,
    transport: SendTransport,
  ): Promise<SendEphemeralPostResult> => {
    const t = v.parse(EphemeralPostTargetSchema, target);
    const tr = v.parse(TransportSchema, transport);
    return sendCore(
      buildCliRequestPayload(message, { channel: t.channel, user: t.user }),
      ["messages", "post-ephemeral"],
      { json: true, ...tr },
      resolvedDeps,
      isSendEphemeralPostJson,
    );
  };

  const sendEphemeralReply = async (
    message: MessagePayload,
    target: SendEphemeralReplyTarget,
    transport: SendTransport,
  ): Promise<SendEphemeralReplyResult> => {
    const t = v.parse(EphemeralReplyTargetSchema, target);
    const tr = v.parse(TransportSchema, transport);
    return sendCore(
      buildCliRequestPayload(message, {
        channel: t.channel,
        user: t.user,
        thread_ts: t.replyTs,
      }),
      ["messages", "post-ephemeral"],
      { json: true, ...tr },
      resolvedDeps,
      isSendEphemeralReplyJson,
    );
  };

  return { sendPost, sendReply, sendUpdate, sendEphemeralPost, sendEphemeralReply };
};

export const { sendPost, sendReply, sendUpdate, sendEphemeralPost, sendEphemeralReply } =
  createSendHelpers();

/**
 * Top-level error handler for scripts using send* helpers.
 * Catches errors, prints to stderr, and exits with the correct code.
 *
 * @example
 * // script.ts
 * import { b, blocks, sendPost, runMain } from './skill/blocks.ts'
 * runMain(async () => {
 *   await sendPost(blocks([b.header("hi")]), { channel: "C..." }, { token: "xoxp" })
 * })
 */
export const runMain = (fn: () => Promise<void>): void => {
  fn().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    // parse exit code from slack CLI error if available, else 1
    const match = msg.match(/exited (\d+)/);
    const code = match ? parseInt(match[1], 10) : 1;
    process.stderr.write(`error: ${msg}\n`);
    process.exit(code);
  });
};

// ── placehold.co image helper ──────────────────────────────────────────────
//
// Dynamic placeholder images for Slack context/section image elements.
// Slack image proxy only accepts https:// URLs returning raster (PNG/JPG/GIF/WEBP).
// SVG, data: URIs are rejected.
//
// IMPORTANT:
//   - Do NOT use @2x suffix — bug renders text color as #999 instead of specified color
//   - Use 2x pixel dimensions instead (e.g. w=15,h=15 → 30x30 actual pixels)
//   - .png required — placehold.co defaults to SVG which Slack rejects
//   - transparent bg: use "transparent" keyword (not "00000000")
//   - Special chars (●): omit font (default font renders them)
//   - ASCII/latin text: use "PT Sans"
//
// Returns ImageElement ready for context/section accessory.

/**
 * Generate placehold.co image URL for Slack context/section blocks.
 *
 * @param w - logical width (doubled for retina)
 * @param h - logical height (doubled for retina)
 * @param bg - background: 6-digit hex, CSS name, or "transparent"
 * @param fg - foreground: 6-digit hex or CSS name
 * @param text - displayed text
 * @param font - font name; omit for special chars (●), "PT Sans" for ASCII
 */
export const ph = (
  w: number,
  h: number,
  bg: string,
  fg: string,
  text: string,
  font?: string,
): string => {
  let url = `https://placehold.co/${w * 2}x${h * 2}/${bg}/${fg}.png?text=${encodeURIComponent(text)}`;
  if (font) url += `&font=${encodeURIComponent(font)}`;
  return url;
};

/**
 * Shorthand: ph() + ImageElement in one call.
 *
 * @example
 * b.context([phImg(15, 15, "EF4444", "FFFFFF", "X", "PT Sans"), txt.md("Fail")])
 */
export const phImg = (
  w: number,
  h: number,
  bg: string,
  fg: string,
  text: string,
  font?: string,
  alt_text?: string,
): ImageElement => ({
  type: "image",
  image_url: ph(w, h, bg, fg, text, font),
  alt_text: alt_text ?? text,
});

// ── CLI: print JSON when run directly ─────────────────────────────────────

if ((import.meta as { main?: boolean }).main) {
  runMain(async () => {
    const payload = blocks([
      b.header("blocks.ts 예시"),
      b.section(`typed 빌더 사용 예시\n${fmt.bold("굵게")} 텍스트`),
      b.divider(),
      b.context([
        txt.md("_context_ 요소"),
        el.imgEl("https://api.slack.com/img/blocks/bkb_template_images/beagle.png", "dog"),
      ]),
      b.actions([
        el.button("확인", "btn_ok", { style: "primary", value: "ok" }),
        el.button("취소", "btn_cancel"),
      ]),
    ]);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  });
}
