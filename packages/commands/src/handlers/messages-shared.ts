import { createError } from "../errors";
import type { SlackAttachmentObject, SlackBlockObject } from "../messages-post/block-builder";
import { buildBlocksFromMarkdown } from "../messages-post/block-builder";
import { resolveSlackToken, resolveSlackTokenForType } from "../slack/token";
import type { ResolvedSlackToken } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliContext, CliOptions, CliResult } from "../types";

export type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

// Resolves token respecting context.tokenTypeOverride when set.
// Handlers should use this instead of calling resolveSlackToken directly.
export const resolveTokenForContext = async (
  context: CliContext,
  env: Record<string, string | undefined>,
  resolveToken: (
    env: Record<string, string | undefined>,
  ) => Promise<ResolvedSlackToken> | ResolvedSlackToken = resolveSlackToken,
): Promise<ResolvedSlackToken> => {
  if (context.tokenTypeOverride !== undefined) {
    const resolved = await resolveSlackTokenForType(context.tokenTypeOverride, env);
    if (resolved === undefined) {
      // Should not happen — runCli validates availability before routing.
      // Throw so it surfaces as SLACK_CONFIG_ERROR via mapSlackClientError.
      throw Object.assign(new Error(`${context.tokenTypeOverride} token not available`), {
        code: "SLACK_CONFIG_ERROR",
      });
    }
    return resolved;
  }
  return Promise.resolve(resolveToken(env));
};

export const mapSlackClientError = (error: unknown, commandId: string): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      `Unexpected runtime failure for ${commandId}.`,
      "Retry with --json for structured output.",
      commandId,
    );
  }

  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, commandId);
    case "SLACK_AUTH_ERROR":
      return createError(
        "INVALID_ARGUMENT",
        `${error.message} [AUTH_ERROR]`,
        error.hint,
        commandId,
      );
    case "SLACK_API_ERROR": {
      const reason =
        error.details === undefined ? error.message : `${error.message} ${error.details}`;
      return createError("INVALID_ARGUMENT", `${reason} [SLACK_API_ERROR]`, error.hint, commandId);
    }
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, commandId);
  }
};

export const isCliErrorResult = (value: unknown): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const isValidSlackTimestamp = (value: string): boolean => {
  return /^\d+\.\d+$/.test(value);
};

export const BOOLEAN_OPTION_VALUES_HINT = "Use boolean value: true|false|1|0|yes|no|on|off.";

export const readBooleanOption = (
  options: CliOptions,
  optionName: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
  defaultValue: boolean,
): boolean | CliResult => {
  const rawValue = options[optionName];
  if (rawValue === undefined) {
    return defaultValue;
  }

  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return createError(
    "INVALID_ARGUMENT",
    `${commandLabel} --${optionName} must be boolean when provided with '=...'. Received: ${rawValue}`,
    `${BOOLEAN_OPTION_VALUES_HINT} ${usageHint}`,
    commandId,
  );
};

export const readThreadTsOption = (
  options: CliOptions,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): string | undefined | CliResult => {
  const rawThreadTs = options["thread-ts"];
  if (rawThreadTs === undefined) {
    return undefined;
  }

  if (rawThreadTs === true) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --thread-ts requires a value. [MISSING_ARGUMENT]`,
      usageHint,
      commandId,
    );
  }

  if (typeof rawThreadTs !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --thread-ts requires a string timestamp value.`,
      usageHint,
      commandId,
    );
  }

  const threadTs = rawThreadTs.trim();
  if (threadTs.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --thread-ts value cannot be empty. [MISSING_ARGUMENT]`,
      usageHint,
      commandId,
    );
  }

  if (!isValidSlackTimestamp(threadTs)) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --thread-ts must match Slack timestamp format seconds.fraction. Received: ${threadTs}`,
      usageHint,
      commandId,
    );
  }

  return threadTs;
};

export type BlocksPayload = {
  blocks: SlackBlockObject[];
  attachments: SlackAttachmentObject[];
};

const STDIN_MARKER = "-";

const readStdinOrError = async (
  readStdin: (() => Promise<string | undefined>) | undefined,
  commandLabel: string,
  usageHint: string,
  commandId: string,
  targetLabel: string,
): Promise<string | CliResult> => {
  if (readStdin === undefined) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} ${targetLabel} set to '-' requires stdin input. [MISSING_ARGUMENT]`,
      `${usageHint}\nPipe content via stdin when using '-'.`,
      commandId,
    );
  }

  const stdinText = await readStdin();
  if (stdinText === undefined || stdinText.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} ${targetLabel} set to '-' requires non-empty stdin input. [MISSING_ARGUMENT]`,
      `${usageHint}\nPipe content via stdin when using '-'.`,
      commandId,
    );
  }

  return stdinText;
};

export const readTextWithStdinMarker = async (
  rawText: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
  readStdin?: () => Promise<string | undefined>,
): Promise<string | CliResult> => {
  if (rawText.trim() !== STDIN_MARKER) {
    return rawText;
  }

  return await readStdinOrError(readStdin, commandLabel, usageHint, commandId, "<text>");
};

const parseBlocksArrayOrError = (
  value: unknown,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): SlackBlockObject[] | CliResult => {
  if (!Array.isArray(value)) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --blocks JSON must be an array of block objects.`,
      usageHint,
      commandId,
    );
  }

  const blocks: SlackBlockObject[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return createError(
        "INVALID_ARGUMENT",
        `${commandLabel} --blocks JSON array must contain only objects.`,
        usageHint,
        commandId,
      );
    }
    blocks.push(entry);
  }

  return blocks;
};

const parseAttachmentsArrayOrError = (
  value: unknown,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): SlackAttachmentObject[] | CliResult => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --blocks JSON object field 'attachments' must be an array when provided.`,
      usageHint,
      commandId,
    );
  }

  const attachments: SlackAttachmentObject[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return createError(
        "INVALID_ARGUMENT",
        `${commandLabel} --blocks JSON object field 'attachments' must contain only objects.`,
        usageHint,
        commandId,
      );
    }
    attachments.push(entry);
  }

  return attachments;
};

const parseBlocksPayloadOrError = (
  value: unknown,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): BlocksPayload | CliResult => {
  if (Array.isArray(value)) {
    const blocksOrError = parseBlocksArrayOrError(value, commandLabel, usageHint, commandId);
    if (isCliErrorResult(blocksOrError)) {
      return blocksOrError;
    }

    return {
      blocks: blocksOrError,
      attachments: [],
    };
  }

  if (!isRecord(value)) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --blocks JSON must be an array of block objects or an object with a 'blocks' array.`,
      usageHint,
      commandId,
    );
  }

  const rawBlocks = value.blocks;
  const hasBlocks = rawBlocks !== undefined;
  const blocksOrError =
    hasBlocks === true
      ? parseBlocksArrayOrError(rawBlocks, commandLabel, usageHint, commandId)
      : [];
  if (isCliErrorResult(blocksOrError)) {
    return blocksOrError;
  }

  const attachmentsOrError = parseAttachmentsArrayOrError(
    value.attachments,
    commandLabel,
    usageHint,
    commandId,
  );
  if (isCliErrorResult(attachmentsOrError)) {
    return attachmentsOrError;
  }

  if (hasBlocks === false && attachmentsOrError.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} composition payload must include 'blocks' or 'attachments'.`,
      usageHint,
      commandId,
    );
  }

  return {
    blocks: blocksOrError,
    attachments: attachmentsOrError,
  };
};

export const readCompositionPayload = (
  value: unknown,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): BlocksPayload | undefined | CliResult => {
  if (value === undefined) {
    return undefined;
  }

  return parseBlocksPayloadOrError(value, commandLabel, usageHint, commandId);
};

export const readJsonObjectOption = async (
  options: CliOptions,
  optionName: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
  readStdin?: () => Promise<string | undefined>,
): Promise<Record<string, unknown> | undefined | CliResult> => {
  const raw = options[optionName];
  if (raw === undefined) {
    return undefined;
  }

  if (raw === true) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --${optionName} requires a JSON object value. [MISSING_ARGUMENT]`,
      `${usageHint}\nUse --${optionName}='<json>' or --${optionName}=- with stdin.`,
      commandId,
    );
  }

  if (typeof raw !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --${optionName} must be a JSON object string.`,
      usageHint,
      commandId,
    );
  }

  const input =
    raw.trim() === STDIN_MARKER
      ? await readStdinOrError(readStdin, commandLabel, usageHint, commandId, `--${optionName}`)
      : raw;
  if (isCliErrorResult(input)) {
    return input;
  }

  const trimmed = input.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --${optionName} must be a JSON object.`,
      `${usageHint}\nUse --${optionName}='{"key":"value"}'.`,
      commandId,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --${optionName} value is not valid JSON. Received: ${trimmed.slice(0, 80)}`,
      `${usageHint}\nUse --${optionName}='{"key":"value"}'.`,
      commandId,
    );
  }

  if (!isRecord(parsed) || Array.isArray(parsed)) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --${optionName} must decode to a JSON object.`,
      usageHint,
      commandId,
    );
  }

  return parsed;
};

export const validatePayloadKeys = (
  payload: Record<string, unknown>,
  allowedKeys: string[],
  commandLabel: string,
  usageHint: string,
  commandId: string,
): CliResult | undefined => {
  const unknownKey = Object.keys(payload).find((key) => !allowedKeys.includes(key));
  if (unknownKey === undefined) {
    return undefined;
  }

  return createError(
    "INVALID_ARGUMENT",
    `${commandLabel} --payload contains unsupported field '${unknownKey}'.`,
    `${usageHint}\nAllowed fields: ${allowedKeys.join(", ")}`,
    commandId,
  );
};

export const readRequiredPayloadString = (
  payload: Record<string, unknown>,
  key: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): string | CliResult => {
  const value = payload[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --payload requires non-empty string field '${key}'.`,
      usageHint,
      commandId,
    );
  }

  return value.trim();
};

export const readOptionalPayloadString = (
  payload: Record<string, unknown>,
  key: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): string | undefined | CliResult => {
  const value = payload[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --payload field '${key}' must be a non-empty string when provided.`,
      usageHint,
      commandId,
    );
  }

  return value.trim();
};

export const readOptionalPayloadBoolean = (
  payload: Record<string, unknown>,
  key: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): boolean | undefined | CliResult => {
  const value = payload[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --payload field '${key}' must be boolean when provided.`,
      usageHint,
      commandId,
    );
  }

  return value;
};

export const readOptionalPayloadTimestamp = (
  payload: Record<string, unknown>,
  key: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): string | undefined | CliResult => {
  const valueOrError = readOptionalPayloadString(payload, key, commandLabel, usageHint, commandId);
  if (isCliErrorResult(valueOrError) || valueOrError === undefined) {
    return valueOrError;
  }

  if (!isValidSlackTimestamp(valueOrError)) {
    return createError(
      "INVALID_ARGUMENT",
      `${commandLabel} --payload field '${key}' must match Slack timestamp format seconds.fraction. Received: ${valueOrError}`,
      usageHint,
      commandId,
    );
  }

  return valueOrError;
};

const hasMatchedJsonWrappers = (value: string): boolean => {
  return (
    (value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))
  );
};

/**
 * Resolves --blocks option into a BlocksPayload or CliResult error.
 *
 * Supported inputs:
 *   - undefined              → no blocks
 *   - true (bare flag)       → markdown source = fallbackText
 *   - string starting with [ → parsed as JSON blocks array directly
 *   - string starting with { → parsed as JSON object with blocks/attachments
 *   - other string           → treated as markdown source → converted to blocks
 *   - "true"/"1"/"yes"/"on"  → markdown source = fallbackText
 *   - "false"/"0"/"no"/"off" → no blocks
 */
export const readBlocksOption = async (
  options: CliOptions,
  fallbackText: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
  readStdin?: () => Promise<string | undefined>,
): Promise<BlocksPayload | undefined | CliResult> => {
  const raw = options.blocks;

  if (raw === undefined) {
    return undefined;
  }

  // Bare --blocks flag (boolean true from parser)
  if (raw === true) {
    return buildBlocksFromMarkdown(fallbackText);
  }

  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();

  if (trimmed === STDIN_MARKER) {
    const stdinTextOrError = await readStdinOrError(
      readStdin,
      commandLabel,
      usageHint,
      commandId,
      "--blocks",
    );
    if (isCliErrorResult(stdinTextOrError)) {
      return stdinTextOrError;
    }

    return buildBlocksFromMarkdown(stdinTextOrError);
  }

  const startsLikeJson = trimmed.startsWith("[") || trimmed.startsWith("{");

  // JSON blocks: value must be wrapped with matching [] or {}
  if (startsLikeJson) {
    if (!hasMatchedJsonWrappers(trimmed)) {
      return createError(
        "INVALID_ARGUMENT",
        `${commandLabel} --blocks JSON must start/end with matching [] or {}.`,
        `${usageHint}\nProvide a JSON blocks payload, e.g. --blocks='[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]' or --blocks='{"blocks":[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]}'`,
        commandId,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return createError(
        "INVALID_ARGUMENT",
        `${commandLabel} --blocks value is not valid JSON. Received: ${trimmed.slice(0, 80)}`,
        `${usageHint}\nProvide a JSON blocks payload, e.g. --blocks='[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]' or --blocks='{"blocks":[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]}'`,
        commandId,
      );
    }

    return parseBlocksPayloadOrError(parsed, commandLabel, usageHint, commandId);
  }

  // Bool-like string values
  const normalized = trimmed.toLowerCase();
  const isFalsy =
    normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off";
  if (isFalsy) {
    return undefined;
  }

  const isTruthy =
    normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  if (isTruthy) {
    return buildBlocksFromMarkdown(fallbackText);
  }

  // Non-bool, non-JSON string → treat as markdown source (stdin content injected by runCli)
  return buildBlocksFromMarkdown(raw);
};
