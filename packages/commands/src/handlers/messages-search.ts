import { createError } from "../errors";
import type { ResolvedSlackToken, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError } from "../slack";
import { assertNoEdgeToken, resolveSlackToken, withTokenFallback } from "../slack/token";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.search";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesSearchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  env: Record<string, string | undefined>;
  resolveToken: (
    env: Record<string, string | undefined>,
  ) => Promise<ResolvedSlackToken> | ResolvedSlackToken;
};

const defaultDeps: MessagesSearchHandlerDeps = {
  createClient: createSlackWebApiClient,
  env: process.env,
  resolveToken: resolveSlackToken,
};

const formatSuccessLines = (query: string, total: number, count: number): string[] => {
  return [
    `Messages search completed for query: ${query}`,
    `Total matches: ${total}`,
    `Returned messages: ${count}`,
  ];
};

const STRICT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]{8,}$/;
const MESSAGE_POINTER_PATTERN = /^p(\d{7,})$/;
const RELATIVE_DATE_TO_DAYS: Record<string, number> = {
  "1d": 1,
  "1w": 7,
  "30d": 30,
  "90d": 90,
};

type UrlShortcutNormalization =
  | { normalizedQuery: string }
  | { invalidReason: string; invalidHint: string }
  | undefined;

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

const formatUtcCalendarDate = (date: Date): string => {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseFlexibleCalendarDate = (value: string): string | undefined => {
  const normalizedValue = value.trim().toLowerCase();
  if (isCalendarDate(normalizedValue)) {
    return normalizedValue;
  }

  const relativeDays = RELATIVE_DATE_TO_DAYS[normalizedValue];
  if (relativeDays === undefined) {
    return undefined;
  }

  const now = new Date(Date.now());
  const relativeDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - relativeDays),
  );
  return formatUtcCalendarDate(relativeDate);
};

const dateHint = (name: string): string => {
  return `${name} must be YYYY-MM-DD or relative: 1d, 1w, 30d, 90d.`;
};

const normalizeSlackMessageUrlQuery = (query: string): UrlShortcutNormalization => {
  const querySegments = query
    .split(" ")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (querySegments.length !== 1) {
    return undefined;
  }

  const rawInput = querySegments[0];
  if (rawInput === undefined) {
    return undefined;
  }

  if (rawInput.startsWith("http://") === false && rawInput.startsWith("https://") === false) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawInput);
  } catch {
    return {
      invalidReason: "Malformed URL input.",
      invalidHint:
        "Use Slack message permalink format: https://<workspace>.slack.com/archives/<channel-id>/p<message-ts>.",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname.endsWith(".slack.com") === false) {
    return undefined;
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      invalidReason: "Slack message URL must use https.",
      invalidHint:
        "Use Slack message permalink format: https://<workspace>.slack.com/archives/<channel-id>/p<message-ts>.",
    };
  }

  const pathSegments = parsedUrl.pathname.split("/").filter((segment) => segment.length > 0);
  if (pathSegments.length !== 3 || pathSegments[0] !== "archives") {
    return {
      invalidReason: "Unsupported Slack URL path.",
      invalidHint: "Use Slack message permalink path: /archives/<channel-id>/p<message-ts>.",
    };
  }

  const channelId = pathSegments[1];
  if (channelId === undefined || CHANNEL_ID_PATTERN.test(channelId) === false) {
    return {
      invalidReason: "Invalid Slack channel id in URL.",
      invalidHint: "Use Slack channel ids like C12345678 in message permalink URLs.",
    };
  }

  const messagePointer = pathSegments[2];
  const pointerMatch =
    messagePointer === undefined ? undefined : MESSAGE_POINTER_PATTERN.exec(messagePointer);
  if (pointerMatch === null || pointerMatch === undefined) {
    return {
      invalidReason: "Invalid Slack message pointer in URL.",
      invalidHint: "Message permalink must end with p<message-ts> (example: p1700000000123456).",
    };
  }

  const packedTs = pointerMatch[1];
  if (packedTs === undefined || packedTs.length <= 6) {
    return {
      invalidReason: "Invalid Slack message timestamp in URL.",
      invalidHint: "Message permalink must include a timestamp with seconds and microseconds.",
    };
  }

  const secondsPart = packedTs.slice(0, -6);
  const microsPart = packedTs.slice(-6);

  return {
    normalizedQuery: `in:${channelId} ${secondsPart}.${microsPart}`,
  };
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
    if (typeof options.after !== "string") {
      return {
        filterParts,
        invalidDateMessage: `invalid messages search --after value: ${String(options.after)}`,
        invalidDateHint: dateHint("--after"),
      };
    }

    const normalizedAfterDate = parseFlexibleCalendarDate(options.after);
    if (normalizedAfterDate === undefined) {
      return {
        filterParts,
        invalidDateMessage: `invalid messages search --after value: ${String(options.after)}`,
        invalidDateHint: dateHint("--after"),
      };
    }

    filterParts.push(`after:${normalizedAfterDate}`);
  }

  if (options.before !== undefined) {
    if (typeof options.before !== "string") {
      return {
        filterParts,
        invalidDateMessage: `invalid messages search --before value: ${String(options.before)}`,
        invalidDateHint: dateHint("--before"),
      };
    }

    const normalizedBeforeDate = parseFlexibleCalendarDate(options.before);
    if (normalizedBeforeDate === undefined) {
      return {
        filterParts,
        invalidDateMessage: `invalid messages search --before value: ${String(options.before)}`,
        invalidDateHint: dateHint("--before"),
      };
    }

    filterParts.push(`before:${normalizedBeforeDate}`);
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

    const normalizedUrlQuery = normalizeSlackMessageUrlQuery(query);
    if (
      normalizedUrlQuery !== undefined &&
      "invalidReason" in normalizedUrlQuery &&
      "invalidHint" in normalizedUrlQuery
    ) {
      return createError(
        "INVALID_ARGUMENT",
        `invalid messages search URL query: ${normalizedUrlQuery.invalidReason}`,
        `${normalizedUrlQuery.invalidHint} Input: ${query}`,
        COMMAND_ID,
      );
    }

    const normalizedBaseQuery =
      normalizedUrlQuery !== undefined && "normalizedQuery" in normalizedUrlQuery
        ? normalizedUrlQuery.normalizedQuery
        : query;

    const { filterParts, invalidDateMessage, invalidDateHint } = buildFilterParts(request.options);
    if (invalidDateMessage !== undefined) {
      return createError(
        "INVALID_ARGUMENT",
        invalidDateMessage,
        `${invalidDateHint} Examples: 2026-01-31, 1w.`,
        COMMAND_ID,
      );
    }

    const filteredQuery = [
      ...normalizedBaseQuery.split(" ").filter((segment) => segment.length > 0),
      ...filterParts,
    ].join(" ");

    try {
      return await withTokenFallback(
        "xoxp",
        deps.env,
        async (resolvedToken) => {
          assertNoEdgeToken(resolvedToken.token, COMMAND_ID);

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
        },
        deps.resolveToken,
      );
    } catch (error) {
      return mapSlackErrorToCliResult(error);
    }
  };
};

export const messagesSearchHandler = createMessagesSearchHandler();
