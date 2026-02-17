import { resolveSlackToken, resolveSlackTokenFromEnv } from "./token";
import type {
  ResolvedSlackToken,
  SlackChannel,
  SlackListChannelsResult,
  SlackListUsersResult,
  SlackSearchMessage,
  SlackSearchMessagesResult,
  SlackUser,
  SlackWebApiClient,
} from "./types";
import {
  createSlackClientError,
  isRecord,
  readArray,
  readBoolean,
  readNumber,
  readRecord,
  readString,
} from "./utils";

const DEFAULT_SLACK_API_BASE_URL = "https://slack.com/api";

type CreateSlackWebApiClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const parseRetryAfterHeader = (value: string | null): number | undefined => {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
};

const readNextCursor = (payload: Record<string, unknown>): string | undefined => {
  const metadata = readRecord(payload, "response_metadata");
  if (metadata === undefined) {
    return undefined;
  }

  const cursor = readString(metadata, "next_cursor");
  if (cursor === undefined || cursor.length === 0) {
    return undefined;
  }

  return cursor;
};

const buildApiUrl = (baseUrl: string, method: string, params: URLSearchParams): URL => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(`${normalizedBase}/${method}`);
  url.search = params.toString();
  return url;
};

const resolveTokenTypeFromValue = (token: string): "xoxp" | "xoxb" | undefined => {
  if (token.startsWith("xoxp")) {
    return "xoxp";
  }

  if (token.startsWith("xoxb")) {
    return "xoxb";
  }

  return undefined;
};

const ensureSuccessPayload = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) {
    throw createSlackClientError({
      code: "SLACK_RESPONSE_ERROR",
      message: "Slack API returned malformed JSON payload.",
      hint: "Verify proxy/middleware does not rewrite Slack API responses.",
    });
  }

  const ok = readBoolean(payload, "ok");
  if (ok === true) {
    return payload;
  }

  const errorCode = readString(payload, "error") ?? "unknown_error";
  const detail = readString(payload, "needed") ?? readString(payload, "provided");

  if (
    errorCode === "not_authed" ||
    errorCode === "invalid_auth" ||
    errorCode === "account_inactive" ||
    errorCode === "token_revoked"
  ) {
    throw createSlackClientError({
      code: "SLACK_AUTH_ERROR",
      message: `Slack authentication failed: ${errorCode}.`,
      hint: "Use a valid token with required scopes in SLACK_MCP_XOXP_TOKEN or SLACK_MCP_XOXB_TOKEN.",
      details: detail,
    });
  }

  throw createSlackClientError({
    code: "SLACK_API_ERROR",
    message: `Slack API request failed: ${errorCode}.`,
    hint: "Confirm Slack scopes and command input values.",
    details: detail,
  });
};

const mapChannel = (value: unknown): SlackChannel | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value, "id");
  const name = readString(value, "name");
  if (id === undefined || name === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    isPrivate: readBoolean(value, "is_private") ?? false,
    isArchived: readBoolean(value, "is_archived") ?? false,
    memberCount: readNumber(value, "num_members"),
  };
};

const mapUser = (value: unknown): SlackUser | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value, "id");
  const username = readString(value, "name");
  if (id === undefined || username === undefined) {
    return undefined;
  }

  const profile = readRecord(value, "profile");

  return {
    id,
    username,
    displayName:
      profile === undefined
        ? undefined
        : (readString(profile, "display_name") ?? readString(profile, "real_name")),
    realName: profile === undefined ? undefined : readString(profile, "real_name"),
    isBot: readBoolean(value, "is_bot") ?? false,
    isDeleted: readBoolean(value, "deleted") ?? false,
    isAdmin: readBoolean(value, "is_admin") ?? false,
  };
};

const mapSearchMessage = (value: unknown): SlackSearchMessage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const text = readString(value, "text");
  const ts = readString(value, "ts");
  if (text === undefined || ts === undefined) {
    return undefined;
  }

  const channel = readRecord(value, "channel");
  return {
    channelId: channel === undefined ? undefined : readString(channel, "id"),
    channelName: channel === undefined ? undefined : readString(channel, "name"),
    userId: readString(value, "user"),
    username: readString(value, "username"),
    text,
    ts,
    permalink: readString(value, "permalink"),
  };
};

export const createSlackWebApiClient = (
  options: CreateSlackWebApiClientOptions = {},
): SlackWebApiClient => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_SLACK_API_BASE_URL;
  const explicitToken = options.token;
  const env = options.env ?? process.env;

  const tokenResolver: () => Promise<ResolvedSlackToken> =
    explicitToken === undefined
      ? async () => {
          // Try env resolution first (xoxp > xoxb) for backward compat + reliable error messages
          try {
            return resolveSlackTokenFromEnv(env);
          } catch {
            // Env resolution failed; fall back to auth service (store, etc.)
            return resolveSlackToken(env);
          }
        }
      : () => {
          const tokenType = resolveTokenTypeFromValue(explicitToken);
          const source = tokenType === "xoxb" ? "SLACK_MCP_XOXB_TOKEN" : "SLACK_MCP_XOXP_TOKEN";
          return Promise.resolve({
            token: explicitToken,
            source,
            tokenType,
          });
        };

  let resolvedToken: Promise<ResolvedSlackToken> | null = null;
  const getResolvedToken = async (): Promise<ResolvedSlackToken> => {
    if (resolvedToken === null) {
      resolvedToken = tokenResolver();
    }

    return await resolvedToken;
  };

  const callApi = async (
    method: string,
    params: URLSearchParams,
  ): Promise<Record<string, unknown>> => {
    const token = (await getResolvedToken()).token;
    const url = buildApiUrl(baseUrl, method, params);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterHeader(response.headers.get("retry-after"));
      // TODO(commands-owner): Add bounded retry/backoff policy with jitter for 429 responses and remove once CLI supports retry telemetry/flags.
      throw createSlackClientError({
        code: "SLACK_HTTP_ERROR",
        message: "Slack API rate limit reached.",
        hint: "Retry later or narrow query scope.",
        status: response.status,
        retryAfterSeconds,
      });
    }

    const rawBody = await response.text();
    let parsedBody: unknown = {};

    if (rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        throw createSlackClientError({
          code: "SLACK_RESPONSE_ERROR",
          message: "Slack API returned non-JSON response body.",
          hint: "Verify network/proxy path to slack.com/api.",
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      const payload = ensureSuccessPayload(parsedBody);
      const errorCode = readString(payload, "error") ?? `http_${response.status}`;
      throw createSlackClientError({
        code: "SLACK_HTTP_ERROR",
        message: `Slack HTTP request failed: ${errorCode}.`,
        hint: "Confirm network access and token scopes.",
        status: response.status,
      });
    }

    return ensureSuccessPayload(parsedBody);
  };

  const listChannels = async (): Promise<SlackListChannelsResult> => {
    const params = new URLSearchParams({
      limit: "200",
      exclude_archived: "true",
      types: "public_channel,private_channel",
    });
    const payload = await callApi("conversations.list", params);
    const channelsRaw = readArray(payload, "channels") ?? [];
    const channels = channelsRaw
      .map(mapChannel)
      .filter((value): value is SlackChannel => value !== undefined);

    // TODO(commands-owner): Add automatic cursor pagination loop and remove when handlers expose explicit paging controls.
    return {
      channels,
      nextCursor: readNextCursor(payload),
    };
  };

  const listUsers = async (): Promise<SlackListUsersResult> => {
    const params = new URLSearchParams({
      limit: "200",
    });
    const payload = await callApi("users.list", params);
    const usersRaw = readArray(payload, "members") ?? [];
    const users = usersRaw.map(mapUser).filter((value): value is SlackUser => value !== undefined);

    // TODO(commands-owner): Add automatic cursor pagination loop and remove when handlers expose explicit paging controls.
    return {
      users,
      nextCursor: readNextCursor(payload),
    };
  };

  const searchMessages = async (query: string): Promise<SlackSearchMessagesResult> => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "Search query is empty.",
        hint: "Provide non-empty query for messages search.",
      });
    }

    const params = new URLSearchParams({
      query: normalizedQuery,
      count: "20",
    });
    const payload = await callApi("search.messages", params);
    const messagesContainer = readRecord(payload, "messages");
    const matchesRaw =
      messagesContainer === undefined ? [] : (readArray(messagesContainer, "matches") ?? []);
    const messages = matchesRaw
      .map(mapSearchMessage)
      .filter((value): value is SlackSearchMessage => value !== undefined);

    return {
      query: normalizedQuery,
      total:
        messagesContainer === undefined
          ? 0
          : (readNumber(messagesContainer, "total") ?? messages.length),
      messages,
    };
  };

  return {
    listChannels,
    listUsers,
    searchMessages,
  };
};
