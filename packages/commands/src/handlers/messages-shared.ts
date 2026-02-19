import { createError } from "../errors";
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
