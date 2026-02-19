import { createError } from "../errors";
import { isSlackClientError, resolveSlackToken } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "batch";
const USAGE_HINT =
  'Usage: slack batch "command arg..." "command arg..." [--stop-on-error[=<bool>]] [--fail-on-error[=<bool>]] [--json]';
const MAX_BATCH_COMMANDS = 50;

type BatchEntry = {
  index: number;
  raw: string;
  argv: string[];
  result: CliResult;
  durationMs: number;
};

const isWhitespace = (value: string): boolean => {
  return /\s/.test(value);
};

const tokenizeCommand = (rawCommand: string): string[] | string => {
  const source = rawCommand.trim();
  if (source.length === 0) {
    return "batch command cannot be empty.";
  }

  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote !== null) {
      if (char === quote) {
        quote = null;
        continue;
      }

      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (isWhitespace(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    return "batch command ends with dangling escape character.";
  }

  if (quote !== null) {
    return "batch command has unclosed quote.";
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return "batch command cannot be empty.";
  }

  return tokens;
};

const readBooleanOption = (
  value: string | boolean | undefined,
  optionName: string,
): boolean | string => {
  if (value === undefined) {
    return false;
  }

  if (value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "on"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "n" ||
    normalized === "off"
  ) {
    return false;
  }

  return `batch --${optionName} must be boolean. Use true|false|1|0|yes|no|on|off.`;
};

const setBatchTokenOverride = async (): Promise<(() => void) | undefined> => {
  try {
    const resolved = await resolveSlackToken();
    const prevXoxp = process.env.SLACK_MCP_XOXP_TOKEN;
    const prevXoxb = process.env.SLACK_MCP_XOXB_TOKEN;

    if (resolved.tokenType === "xoxb") {
      process.env.SLACK_MCP_XOXB_TOKEN = resolved.token;
    } else {
      process.env.SLACK_MCP_XOXP_TOKEN = resolved.token;
    }

    return () => {
      if (prevXoxp === undefined) {
        delete process.env.SLACK_MCP_XOXP_TOKEN;
      } else {
        process.env.SLACK_MCP_XOXP_TOKEN = prevXoxp;
      }

      if (prevXoxb === undefined) {
        delete process.env.SLACK_MCP_XOXB_TOKEN;
      } else {
        process.env.SLACK_MCP_XOXB_TOKEN = prevXoxb;
      }
    };
  } catch (error) {
    if (isSlackClientError(error)) {
      return undefined;
    }

    throw error;
  }
};

const buildTextLines = (entries: BatchEntry[]): string[] => {
  const successCount = entries.filter((entry) => entry.result.ok).length;
  const failedCount = entries.length - successCount;
  const lines: string[] = [
    `Batch executed ${entries.length} commands: ${successCount} succeeded, ${failedCount} failed.`,
    "",
  ];

  for (const entry of entries) {
    const status = entry.result.ok ? "ok" : "failed";
    const summary =
      entry.result.ok === true
        ? (entry.result.message ?? "completed")
        : `${entry.result.error.code}: ${entry.result.error.message}`;
    lines.push(`[${entry.index}] ${entry.raw} -> ${status} (${entry.durationMs}ms) ${summary}`);
  }

  return lines;
};

export const batchHandler = async (request: CommandRequest): Promise<CliResult> => {
  const runSubcommand = request.context.runSubcommand;
  if (runSubcommand === undefined) {
    return createError(
      "INTERNAL_ERROR",
      "batch runner is unavailable.",
      "Retry with latest CLI runtime.",
      COMMAND_ID,
    );
  }

  const stopOnErrorOrMessage = readBooleanOption(request.options["stop-on-error"], "stop-on-error");
  if (typeof stopOnErrorOrMessage === "string") {
    return createError("INVALID_ARGUMENT", stopOnErrorOrMessage, USAGE_HINT, COMMAND_ID);
  }

  const failOnErrorOrMessage = readBooleanOption(request.options["fail-on-error"], "fail-on-error");
  if (typeof failOnErrorOrMessage === "string") {
    return createError("INVALID_ARGUMENT", failOnErrorOrMessage, USAGE_HINT, COMMAND_ID);
  }

  const rawCommands = request.positionals;
  if (rawCommands.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "batch requires at least one quoted command. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (rawCommands.length > MAX_BATCH_COMMANDS) {
    return createError(
      "INVALID_ARGUMENT",
      `batch accepts up to ${MAX_BATCH_COMMANDS} commands. Received: ${rawCommands.length}`,
      "Split into multiple batch executions.",
      COMMAND_ID,
    );
  }

  const restoreTokenOverride = await setBatchTokenOverride();
  const entries: BatchEntry[] = [];

  try {
    for (let index = 0; index < rawCommands.length; index += 1) {
      const raw = rawCommands[index];
      if (raw === undefined) {
        continue;
      }

      const parsedArgv = tokenizeCommand(raw);
      if (typeof parsedArgv === "string") {
        entries.push({
          index: index + 1,
          raw,
          argv: [],
          result: createError("INVALID_ARGUMENT", parsedArgv, USAGE_HINT, COMMAND_ID),
          durationMs: 0,
        });

        if (stopOnErrorOrMessage) {
          break;
        }
        continue;
      }

      if (parsedArgv[0] === "batch") {
        entries.push({
          index: index + 1,
          raw,
          argv: parsedArgv,
          result: createError(
            "INVALID_ARGUMENT",
            "Nested batch command is not supported.",
            "Run batch commands as separate CLI invocations.",
            COMMAND_ID,
          ),
          durationMs: 0,
        });

        if (stopOnErrorOrMessage) {
          break;
        }
        continue;
      }

      const startedAt = Date.now();
      const result = await runSubcommand(parsedArgv);
      const durationMs = Date.now() - startedAt;
      entries.push({
        index: index + 1,
        raw,
        argv: parsedArgv,
        result,
        durationMs,
      });

      if (!result.ok && stopOnErrorOrMessage) {
        break;
      }
    }
  } finally {
    restoreTokenOverride?.();
  }

  const successCount = entries.filter((entry) => entry.result.ok).length;
  const failedCount = entries.length - successCount;

  return {
    ok: true,
    command: COMMAND_ID,
    message: `Batch completed: ${successCount} succeeded, ${failedCount} failed.`,
    data: {
      total: entries.length,
      succeeded: successCount,
      failed: failedCount,
      stopOnError: stopOnErrorOrMessage,
      failOnError: failOnErrorOrMessage,
      results: entries.map((entry) => ({
        index: entry.index,
        raw: entry.raw,
        argv: entry.argv,
        durationMs: entry.durationMs,
        result: entry.result,
      })),
    },
    textLines: buildTextLines(entries),
    exitCodeOverride: failOnErrorOrMessage && failedCount > 0 ? 2 : 0,
  };
};
