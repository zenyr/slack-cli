import { createError } from "../errors";
import type { ResolvedSlackToken, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.search";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesSearchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesSearchHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const formatSuccessLines = (query: string, total: number, count: number): string[] => {
  return [
    `Messages search completed for query: ${query}`,
    `Total matches: ${total}`,
    `Returned messages: ${count}`,
  ];
};

const STRICT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isCalendarDate = (value: string): boolean => {
  if (STRICT_DATE_PATTERN.test(value) === false) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    return false;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
};

const dateHint = (name: string): string => {
  return `${name} must be a valid date in YYYY-MM-DD format.`;
};

const buildFilterParts = (
  options: Record<string, string | boolean>,
): { filterParts: string[]; invalidDateMessage?: string; invalidDateHint?: string } => {
  const filterParts: string[] = [];

  if (options.channel !== undefined) {
    filterParts.push(`in:${String(options.channel)}`);
  }

  if (options.user !== undefined) {
    filterParts.push(`from:${String(options.user)}`);
  }

  if (options.after !== undefined) {
    if (typeof options.after !== "string" || isCalendarDate(options.after) === false) {
      return {
        filterParts,
        invalidDateMessage: `invalid messages search --after value: ${String(options.after)}`,
        invalidDateHint: dateHint("--after"),
      };
    }

    filterParts.push(`after:${options.after}`);
  }

  if (options.before !== undefined) {
    if (typeof options.before !== "string" || isCalendarDate(options.before) === false) {
      return {
        filterParts,
        invalidDateMessage: `invalid messages search --before value: ${String(options.before)}`,
        invalidDateHint: dateHint("--before"),
      };
    }

    filterParts.push(`before:${options.before}`);
  }

  if (options.threads === true) {
    filterParts.push("is:thread");
  }

  return { filterParts };
};

const formatSuccessLinesWithFilters = (
  query: string,
  total: number,
  count: number,
  filterParts: string[],
): string[] => {
  const header = formatSuccessLines(query, total, count);
  if (filterParts.length === 0) {
    return header;
  }

  return [...header, `Applied filters: ${filterParts.join(", ")}`];
};

const mapSlackErrorToCliResult = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure",
      "Try again with --json for structured output.",
      COMMAND_ID,
    );
  }

  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

export const createMessagesSearchHandler = (
  depsOverrides: Partial<MessagesSearchHandlerDeps> = {},
) => {
  const deps: MessagesSearchHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const query = request.positionals.join(" ").trim();
    if (query.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages search requires <query>",
        "Example: slack messages search deploy --json",
        COMMAND_ID,
      );
    }

    const { filterParts, invalidDateMessage, invalidDateHint } = buildFilterParts(request.options);
    if (invalidDateMessage !== undefined) {
      return createError(
        "INVALID_ARGUMENT",
        invalidDateMessage,
        `${invalidDateHint} Example: 2026-01-31.`,
        COMMAND_ID,
      );
    }

    const filteredQuery = [
      ...query.split(" ").filter((segment) => segment.length > 0),
      ...filterParts,
    ].join(" ");

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      if (
        resolvedToken.tokenType === "xoxb" ||
        resolvedToken.source === "SLACK_MCP_XOXB_TOKEN" ||
        resolvedToken.source === "env:SLACK_MCP_XOXB_TOKEN"
      ) {
        return createError(
          "INVALID_ARGUMENT",
          "messages search requires user token (xoxp).",
          "Set SLACK_MCP_XOXP_TOKEN. Bot tokens cannot call search.messages.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.searchMessages(filteredQuery);

      return {
        ok: true,
        command: COMMAND_ID,
        message: "Messages search completed",
        data,
        textLines: formatSuccessLinesWithFilters(
          data.query,
          data.total,
          data.messages.length,
          filterParts,
        ),
      };
    } catch (error) {
      return mapSlackErrorToCliResult(error);
    }
  };
};

export const messagesSearchHandler = createMessagesSearchHandler();
