import { createError } from "../errors";
import type { SlackAttachmentObject, SlackBlockObject } from "../messages-post/block-builder";
import { buildBlocksFromMarkdown } from "../messages-post/block-builder";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult } from "../types";

export type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
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

export const isValidSlackTimestamp = (value: string): boolean => {
  return /^\d+\.\d+$/.test(value);
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

/**
 * Resolves --blocks option into a BlocksPayload or CliResult error.
 *
 * Supported inputs:
 *   - undefined              → no blocks
 *   - true (bare flag)       → markdown source = fallbackText
 *   - string starting with [ → parsed as JSON blocks array directly
 *   - other string           → treated as markdown source → converted to blocks
 *   - "true"/"1"/"yes"/"on"  → markdown source = fallbackText
 *   - "false"/"0"/"no"/"off" → no blocks
 */
export const readBlocksOption = (
  options: CliOptions,
  fallbackText: string,
  commandLabel: string,
  usageHint: string,
  commandId: string,
): BlocksPayload | undefined | CliResult => {
  const raw = options["blocks"];

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

  // JSON blocks: string starting with '[' → parse directly as blocks array
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return createError(
        "INVALID_ARGUMENT",
        `${commandLabel} --blocks value is not valid JSON. Received: ${trimmed.slice(0, 80)}`,
        `${usageHint}\nProvide a JSON array of Slack block objects, e.g. --blocks='[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]'`,
        commandId,
      );
    }
    if (!Array.isArray(parsed)) {
      return createError(
        "INVALID_ARGUMENT",
        `${commandLabel} --blocks JSON must be an array of block objects.`,
        usageHint,
        commandId,
      );
    }

    const blocks: SlackBlockObject[] = [];
    for (const entry of parsed) {
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

    return {
      blocks,
      attachments: [],
    };
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
