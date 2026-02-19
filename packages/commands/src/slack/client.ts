import { resolveSlackToken, resolveSlackTokenFromEnv } from "./token";
import type {
  ResolvedSlackToken,
  SlackAttachmentWebApiClient,
  SlackAuthWebApiClient,
  SlackChannel,
  SlackChannelHistoryResult,
  SlackChannelInfo,
  SlackChannelInfoResult,
  SlackChannelInfoWebApiClient,
  SlackChannelRepliesResult,
  SlackChannelType,
  SlackCreateUsergroupParams,
  SlackDeleteMessageParams,
  SlackDeleteMessageResult,
  SlackFileBinary,
  SlackFileMetadata,
  SlackListChannelsOptions,
  SlackListChannelsResult,
  SlackListUsergroupsOptions,
  SlackListUsergroupsResult,
  SlackListUsersOptions,
  SlackListUsersResult,
  SlackMessage,
  SlackPostEphemeralParams,
  SlackPostEphemeralResult,
  SlackPostMessageParams,
  SlackPostMessageResult,
  SlackPostWebApiClient,
  SlackReactionParams,
  SlackReactionResult,
  SlackReactionsWebApiClient,
  SlackRepliesWebApiClient,
  SlackSearchMessage,
  SlackSearchMessagesResult,
  SlackSetUserStatusParams,
  SlackUpdateMessageParams,
  SlackUpdateMessageResult,
  SlackUpdateUsergroupParams,
  SlackUser,
  SlackUserGroup,
  SlackUsergroupsUpdateWebApiClient,
  SlackUsergroupsUsersListWebApiClient,
  SlackUsergroupsUsersUpdateParams,
  SlackUsergroupsWebApiClient,
  SlackUsergroupUsersListParams,
  SlackUsergroupUsersListResult,
  SlackUserProfile,
  SlackUserProfileGetResult,
  SlackUserProfileWebApiClient,
  SlackUsersInfoWebApiClient,
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

const textEncoder = new TextEncoder();

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

const parsePositiveIntegerHeader = (value: string | null): number | undefined => {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
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

const buildMethodUrl = (baseUrl: string, method: string): URL => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return new URL(`${normalizedBase}/${method}`);
};

const normalizeAttachmentDownloadParams = (
  urlPrivate: string,
  maxBytes: number,
): { normalizedUrl: string; maxBytes: number } => {
  const normalizedUrl = urlPrivate.trim();
  if (normalizedUrl.length === 0) {
    throw createSlackClientError({
      code: "SLACK_CONFIG_ERROR",
      message: "Attachment private URL is empty.",
      hint: "Provide valid files.info metadata with non-empty url_private.",
    });
  }

  if (maxBytes <= 0) {
    throw createSlackClientError({
      code: "SLACK_CONFIG_ERROR",
      message: `Attachment download max byte size is invalid: ${maxBytes}.`,
      hint: "Use positive max byte size for attachment download.",
    });
  }

  return { normalizedUrl, maxBytes };
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

const mapChannelInfo = (value: unknown): SlackChannelInfo | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value, "id");
  const name = readString(value, "name");
  if (id === undefined || name === undefined) {
    return undefined;
  }

  const topicRecord = readRecord(value, "topic");
  const purposeRecord = readRecord(value, "purpose");

  return {
    id,
    name,
    isPrivate: readBoolean(value, "is_private") ?? false,
    isArchived: readBoolean(value, "is_archived") ?? false,
    memberCount: readNumber(value, "num_members"),
    topic: topicRecord === undefined ? undefined : readString(topicRecord, "value"),
    purpose: purposeRecord === undefined ? undefined : readString(purposeRecord, "value"),
    creator: readString(value, "creator"),
    created: readNumber(value, "created"),
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
    email: profile === undefined ? undefined : readString(profile, "email"),
    isBot: readBoolean(value, "is_bot") ?? false,
    isDeleted: readBoolean(value, "deleted") ?? false,
    isAdmin: readBoolean(value, "is_admin") ?? false,
  };
};

const mapUserGroup = (value: unknown): SlackUserGroup | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value, "id");
  const handle = readString(value, "handle");
  const name = readString(value, "name");
  if (id === undefined || handle === undefined || name === undefined) {
    return undefined;
  }

  const descriptionRaw = readString(value, "description");
  const description =
    descriptionRaw === undefined || descriptionRaw.length === 0 ? undefined : descriptionRaw;
  const usersRaw = readArray(value, "users") ?? [];
  const users = usersRaw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  const userCount = readNumber(value, "user_count");

  return {
    id,
    handle,
    name,
    description,
    userCount,
    users: users.length === 0 ? undefined : users,
  };
};

const mapUserProfile = (value: unknown): SlackUserProfile | undefined => {
  if (!isRecord(value)) return undefined;
  const statusEmoji = readString(value, "status_emoji") ?? "";
  const statusText = readString(value, "status_text") ?? "";
  const statusExpiration = readNumber(value, "status_expiration") ?? 0;
  return {
    displayName: readString(value, "display_name"),
    realName: readString(value, "real_name"),
    email: readString(value, "email"),
    status: { emoji: statusEmoji, text: statusText, expiration: statusExpiration },
  };
};

const SEARCH_TEXT_TRUNCATE_LENGTH = 120;

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
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
    text: truncateText(text, SEARCH_TEXT_TRUNCATE_LENGTH),
    ts,
    permalink: readString(value, "permalink"),
  };
};

const mapMessage = (value: unknown): SlackMessage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const ts = readString(value, "ts");
  const text = readString(value, "text");
  if (ts === undefined || text === undefined) {
    return undefined;
  }

  return {
    type: readString(value, "type") ?? "message",
    user: readString(value, "user"),
    text,
    ts,
    threadTs: readString(value, "thread_ts"),
  };
};

const mapFileMetadata = (value: unknown): SlackFileMetadata | undefined => {
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
    mimetype: readString(value, "mimetype"),
    filetype: readString(value, "filetype"),
    size: readNumber(value, "size"),
    urlPrivate: readString(value, "url_private"),
  };
};

const isActivityOrSystemMessage = (value: Record<string, unknown>): boolean => {
  const type = readString(value, "type");
  if (type !== undefined && type !== "message") {
    return true;
  }

  const subtype = readString(value, "subtype");
  return subtype !== undefined && subtype.length > 0;
};

export const createSlackWebApiClient = (
  options: CreateSlackWebApiClientOptions = {},
): SlackWebApiClient &
  SlackAttachmentWebApiClient &
  SlackUsersInfoWebApiClient &
  SlackUsergroupsWebApiClient &
  SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  SlackUsergroupsUpdateWebApiClient &
  SlackRepliesWebApiClient &
  SlackPostWebApiClient &
  SlackReactionsWebApiClient &
  SlackChannelInfoWebApiClient &
  SlackUserProfileWebApiClient => {
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

  const callApiPost = async (
    method: string,
    payload: URLSearchParams | Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const token = (await getResolvedToken()).token;
    const url = buildMethodUrl(baseUrl, method);
    const isFormPayload = payload instanceof URLSearchParams;
    const body = isFormPayload ? payload.toString() : JSON.stringify(payload);
    const contentType = isFormPayload
      ? "application/x-www-form-urlencoded"
      : "application/json; charset=utf-8";

    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body,
    });

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterHeader(response.headers.get("retry-after"));
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
      const payloadData = ensureSuccessPayload(parsedBody);
      const errorCode = readString(payloadData, "error") ?? `http_${response.status}`;
      throw createSlackClientError({
        code: "SLACK_HTTP_ERROR",
        message: `Slack HTTP request failed: ${errorCode}.`,
        hint: "Confirm network access and token scopes.",
        status: response.status,
      });
    }

    return ensureSuccessPayload(parsedBody);
  };

  const listChannels = async (
    options: SlackListChannelsOptions,
  ): Promise<SlackListChannelsResult> => {
    const typeMap: Record<SlackChannelType, string> = {
      public: "public_channel",
      private: "private_channel",
      im: "im",
      mpim: "mpim",
    };

    const mappedTypes = options.types.map((t) => typeMap[t]).join(",");

    const params = new URLSearchParams({
      limit: String(options.limit),
      exclude_archived: "true",
      types: mappedTypes,
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

  const fetchChannelInfo = async (channelId: string): Promise<SlackChannelInfoResult> => {
    const params = new URLSearchParams({ channel: channelId });
    const payload = await callApi("conversations.info", params);
    const channelRaw = readRecord(payload, "channel");
    const channel = mapChannelInfo(channelRaw);
    if (channel === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "conversations.info response missing or malformed channel.",
        hint: "Verify the channel ID and token scopes.",
      });
    }
    return { channel };
  };

  const listUsers = async (options: SlackListUsersOptions = {}): Promise<SlackListUsersResult> => {
    const params = new URLSearchParams({
      limit: String(options.limit ?? 200),
    });
    if (options.cursor !== undefined) {
      params.set("cursor", options.cursor);
    }

    const payload = await callApi("users.list", params);
    const usersRaw = readArray(payload, "members") ?? [];
    const users = usersRaw.map(mapUser).filter((value): value is SlackUser => value !== undefined);

    // TODO(commands-owner): Add automatic cursor pagination loop and remove when handlers expose explicit paging controls.
    return {
      users,
      nextCursor: readNextCursor(payload),
    };
  };

  const isUserNotFoundSlackError = (error: unknown): boolean => {
    if (!isRecord(error)) {
      return false;
    }

    const code = readString(error, "code");
    const message = readString(error, "message")?.toLowerCase() ?? "";

    if (code !== "SLACK_API_ERROR") {
      return false;
    }

    return message.includes("user_not_found") || message.includes("users_not_found");
  };

  const fetchUserById = async (userId: string): Promise<SlackUser | undefined> => {
    try {
      const payload = await callApi("users.info", new URLSearchParams({ user: userId }));
      const mapped = mapUser(readRecord(payload, "user"));
      if (mapped === undefined) {
        throw createSlackClientError({
          code: "SLACK_RESPONSE_ERROR",
          message: "Slack API returned malformed users.info payload.",
          hint: "Verify token scopes and user visibility for users.info.",
        });
      }

      return mapped;
    } catch (error) {
      if (isUserNotFoundSlackError(error)) {
        return undefined;
      }

      throw error;
    }
  };

  const getUsersByIds = async (
    userIds: string[],
  ): Promise<{ users: SlackUser[]; missingUserIds: string[] }> => {
    const uniqueUserIds = Array.from(
      new Set(userIds.map((value) => value.trim()).filter((value) => value.length > 0)),
    );

    const users: SlackUser[] = [];
    const missingUserIds: string[] = [];
    const concurrency = 8;

    for (let index = 0; index < uniqueUserIds.length; index += concurrency) {
      const chunk = uniqueUserIds.slice(index, index + concurrency);
      const results = await Promise.all(
        chunk.map(async (userId) => {
          const user = await fetchUserById(userId);
          return { userId, user };
        }),
      );

      for (const result of results) {
        if (result.user === undefined) {
          missingUserIds.push(result.userId);
          continue;
        }

        users.push(result.user);
      }
    }

    return {
      users,
      missingUserIds,
    };
  };

  const listUsergroups = async (
    options: SlackListUsergroupsOptions = {},
  ): Promise<SlackListUsergroupsResult> => {
    const params = new URLSearchParams();
    if (options.includeUsers !== undefined) {
      params.set("include_users", options.includeUsers ? "true" : "false");
    }
    if (options.includeDisabled !== undefined) {
      params.set("include_disabled", options.includeDisabled ? "true" : "false");
    }
    if (options.includeCount !== undefined) {
      params.set("include_count", options.includeCount ? "true" : "false");
    }

    const payload = await callApi("usergroups.list", params);
    const usergroupsRaw = readArray(payload, "usergroups") ?? [];
    const usergroups = usergroupsRaw
      .map(mapUserGroup)
      .filter((value): value is SlackUserGroup => value !== undefined);

    return {
      usergroups,
    };
  };

  const getCurrentUserId = async (): Promise<string> => {
    const payload = await callApi("auth.test", new URLSearchParams());
    const userId = readString(payload, "user_id");
    if (userId === undefined || userId.length === 0) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed auth.test payload.",
        hint: "Verify token scopes and auth identity for auth.test.",
      });
    }

    return userId;
  };

  const listUsergroupUsers = async (
    params: SlackUsergroupUsersListParams,
  ): Promise<SlackUsergroupUsersListResult> => {
    const usergroupId = params.usergroupId.trim();
    if (usergroupId.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "Usergroup id is empty.",
        hint: "Provide non-empty usergroup id for usergroups.users.list.",
      });
    }

    const payload = await callApi(
      "usergroups.users.list",
      new URLSearchParams({ usergroup: usergroupId }),
    );
    const usersRaw = readArray(payload, "users") ?? [];
    const userIds = usersRaw
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);

    return {
      usergroupId,
      userIds,
    };
  };

  const createUsergroup = async (params: SlackCreateUsergroupParams): Promise<SlackUserGroup> => {
    const payload = new URLSearchParams({
      name: params.name,
      handle: params.handle,
    });
    if (params.description !== undefined) {
      payload.set("description", params.description);
    }
    if (params.channels !== undefined && params.channels.length > 0) {
      payload.set("channels", params.channels.join(","));
    }
    const payloadData = await callApiPost("usergroups.create", payload);
    const usergroup = mapUserGroup(readRecord(payloadData, "usergroup"));

    if (usergroup === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed usergroups.create payload.",
        hint: "Verify token scopes and required fields for usergroups.create.",
      });
    }

    return usergroup;
  };

  const updateUsergroup = async (params: SlackUpdateUsergroupParams) => {
    const payloadInput: Record<string, string> = {
      usergroup: params.id,
      name: params.name,
      handle: params.handle,
    };

    if (params.description !== undefined) {
      payloadInput.description = params.description;
    }

    if (params.channels !== undefined && params.channels.length > 0) {
      payloadInput.channels = params.channels.join(",");
    }

    const payload = new URLSearchParams(payloadInput);
    const payloadData = await callApiPost("usergroups.update", payload);
    const updatedGroup = mapUserGroup(readRecord(payloadData, "usergroup"));

    if (updatedGroup === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed usergroups.update payload.",
        hint: "Verify token scopes and update fields for usergroups.update.",
      });
    }

    return {
      usergroup: updatedGroup,
    };
  };

  const normalizeUsergroupUsersUpdateParams = (
    params: SlackUsergroupsUsersUpdateParams,
  ): SlackUsergroupsUsersUpdateParams => {
    const usergroupId = params.usergroupId.trim();
    if (usergroupId.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "Usergroup id is empty.",
        hint: "Provide non-empty usergroup id for usergroups.users.update.",
      });
    }

    const userIds = params.userIds.map((value) => value.trim()).filter((value) => value.length > 0);

    if (userIds.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "User ids are empty.",
        hint: "Provide at least one user id for usergroups.users.update.",
      });
    }

    return {
      usergroupId,
      userIds,
    };
  };

  const updateUsergroupUsers = async (params: SlackUsergroupsUsersUpdateParams) => {
    const normalized = normalizeUsergroupUsersUpdateParams(params);
    const payload = new URLSearchParams({
      usergroup: normalized.usergroupId,
      users: normalized.userIds.join(","),
    });
    const payloadData = await callApiPost("usergroups.users.update", payload);
    const usersValue = readString(payloadData, "users");
    const userIds =
      usersValue === undefined
        ? normalized.userIds
        : usersValue
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);

    return {
      usergroupId: normalized.usergroupId,
      userIds,
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
      count: "5",
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

  const fetchFileInfo = async (fileId: string): Promise<SlackFileMetadata> => {
    const normalizedFileId = fileId.trim();
    if (normalizedFileId.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "File id is empty.",
        hint: "Provide non-empty file id for files.info.",
      });
    }

    const payloadData = await callApi(
      "files.info",
      new URLSearchParams({ file: normalizedFileId }),
    );
    const fileMetadata = mapFileMetadata(readRecord(payloadData, "file"));

    if (fileMetadata === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed files.info payload.",
        hint: "Verify token scopes and file visibility for files.info.",
      });
    }

    return fileMetadata;
  };

  const fetchFileText = async (urlPrivate: string, maxBytes: number) => {
    const normalized = normalizeAttachmentDownloadParams(urlPrivate, maxBytes);

    const token = (await getResolvedToken()).token;
    const response = await fetchImpl(normalized.normalizedUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const contentLength = parsePositiveIntegerHeader(response.headers.get("content-length"));
    if (contentLength !== undefined && contentLength > normalized.maxBytes) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: `Attachment text exceeds max size: ${contentLength} bytes.`,
        hint: `Reduce file size or keep content at or below ${normalized.maxBytes} bytes.`,
      });
    }

    if (!response.ok) {
      throw createSlackClientError({
        code: "SLACK_HTTP_ERROR",
        message: `Slack file download failed with status ${response.status}.`,
        hint: "Verify file visibility and token scopes for private file download.",
        status: response.status,
      });
    }

    const content = await response.text();
    const byteLength = textEncoder.encode(content).byteLength;
    if (byteLength > normalized.maxBytes) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: `Attachment text exceeds max size: ${byteLength} bytes.`,
        hint: `Reduce file size or keep content at or below ${normalized.maxBytes} bytes.`,
      });
    }

    return {
      content,
      byteLength,
      contentType: response.headers.get("content-type") ?? undefined,
    };
  };

  const fetchFileBinary = async (
    urlPrivate: string,
    maxBytes: number,
  ): Promise<SlackFileBinary> => {
    const normalized = normalizeAttachmentDownloadParams(urlPrivate, maxBytes);

    const token = (await getResolvedToken()).token;
    const response = await fetchImpl(normalized.normalizedUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const contentLength = parsePositiveIntegerHeader(response.headers.get("content-length"));
    if (contentLength !== undefined && contentLength > normalized.maxBytes) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: `Attachment binary exceeds max size: ${contentLength} bytes.`,
        hint: `Reduce file size or keep content at or below ${normalized.maxBytes} bytes.`,
      });
    }

    if (!response.ok) {
      throw createSlackClientError({
        code: "SLACK_HTTP_ERROR",
        message: `Slack file download failed with status ${response.status}.`,
        hint: "Verify file visibility and token scopes for private file download.",
        status: response.status,
      });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > normalized.maxBytes) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: `Attachment binary exceeds max size: ${bytes.byteLength} bytes.`,
        hint: `Reduce file size or keep content at or below ${normalized.maxBytes} bytes.`,
      });
    }

    return {
      contentBase64: Buffer.from(bytes).toString("base64"),
      byteLength: bytes.byteLength,
      contentType: response.headers.get("content-type") ?? undefined,
      encoding: "base64",
    };
  };

  const fetchChannelHistory = async (params: {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
    includeActivity?: boolean;
  }): Promise<SlackChannelHistoryResult> => {
    const payload = new URLSearchParams({ channel: params.channel });
    if (params.limit !== undefined) {
      payload.set("limit", String(params.limit));
    }
    if (params.oldest !== undefined) {
      payload.set("oldest", params.oldest);
    }
    if (params.latest !== undefined) {
      payload.set("latest", params.latest);
    }
    if (params.cursor !== undefined) {
      payload.set("cursor", params.cursor);
    }

    const payloadData = await callApi("conversations.history", payload);
    const messagesRaw = readArray(payloadData, "messages") ?? [];
    const filteredMessagesRaw = params.includeActivity
      ? messagesRaw
      : messagesRaw.filter((value) => {
          if (!isRecord(value)) {
            return true;
          }
          return !isActivityOrSystemMessage(value);
        });
    const messages = filteredMessagesRaw
      .map(mapMessage)
      .filter((value): value is SlackMessage => value !== undefined);

    return {
      channel: params.channel,
      messages,
      nextCursor: readNextCursor(payloadData),
    };
  };

  const fetchMessageReplies = async (params: {
    channel: string;
    ts: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
  }): Promise<SlackChannelRepliesResult> => {
    const payload = new URLSearchParams({ channel: params.channel, ts: params.ts });
    if (params.limit !== undefined) {
      payload.set("limit", String(params.limit));
    }
    if (params.oldest !== undefined) {
      payload.set("oldest", params.oldest);
    }
    if (params.latest !== undefined) {
      payload.set("latest", params.latest);
    }
    if (params.cursor !== undefined) {
      payload.set("cursor", params.cursor);
    }

    const payloadData = await callApi("conversations.replies", payload);
    const messagesRaw = readArray(payloadData, "messages") ?? [];
    const messages = messagesRaw
      .map(mapMessage)
      .filter((value): value is SlackMessage => value !== undefined);

    return {
      channel: params.channel,
      messages,
      nextCursor: readNextCursor(payloadData),
    };
  };

  const postMessage = async (params: SlackPostMessageParams): Promise<SlackPostMessageResult> => {
    const hasBlockPayload =
      (params.blocks !== undefined && params.blocks.length > 0) ||
      (params.attachments !== undefined && params.attachments.length > 0);

    const payload = hasBlockPayload
      ? {
          channel: params.channel,
          text: params.text,
          thread_ts: params.threadTs,
          unfurl_links: params.unfurlLinks,
          unfurl_media: params.unfurlMedia,
          reply_broadcast: params.replyBroadcast,
          blocks: params.blocks,
          attachments: params.attachments,
        }
      : (() => {
          const formPayload = new URLSearchParams({
            channel: params.channel,
            text: params.text,
          });
          if (params.threadTs !== undefined) {
            formPayload.set("thread_ts", params.threadTs);
          }
          if (params.unfurlLinks !== undefined) {
            formPayload.set("unfurl_links", params.unfurlLinks ? "true" : "false");
          }
          if (params.unfurlMedia !== undefined) {
            formPayload.set("unfurl_media", params.unfurlMedia ? "true" : "false");
          }
          if (params.replyBroadcast !== undefined) {
            formPayload.set("reply_broadcast", params.replyBroadcast ? "true" : "false");
          }
          return formPayload;
        })();

    const payloadData = await callApiPost("chat.postMessage", payload);
    const channel = readString(payloadData, "channel") ?? params.channel;
    const ts = readString(payloadData, "ts");

    if (ts === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed post message payload.",
        hint: "Verify token scopes and channel access for chat.postMessage.",
      });
    }

    return {
      channel,
      ts,
      message: mapMessage(readRecord(payloadData, "message")),
    };
  };

  const deleteMessage = async (
    params: SlackDeleteMessageParams,
  ): Promise<SlackDeleteMessageResult> => {
    const payload = new URLSearchParams({
      channel: params.channel,
      ts: params.ts,
    });
    const payloadData = await callApiPost("chat.delete", payload);
    const channel = readString(payloadData, "channel") ?? params.channel;
    const ts = readString(payloadData, "ts");

    if (ts === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed delete message payload.",
        hint: "Verify token scopes and channel access for chat.delete.",
      });
    }

    return {
      channel,
      ts,
    };
  };

  const postEphemeral = async (
    params: SlackPostEphemeralParams,
  ): Promise<SlackPostEphemeralResult> => {
    const hasBlockPayload =
      (params.blocks !== undefined && params.blocks.length > 0) ||
      (params.attachments !== undefined && params.attachments.length > 0);

    const payload = hasBlockPayload
      ? {
          channel: params.channel,
          user: params.user,
          text: params.text,
          thread_ts: params.threadTs,
          blocks: params.blocks,
          attachments: params.attachments,
        }
      : (() => {
          const formPayload = new URLSearchParams({
            channel: params.channel,
            user: params.user,
            text: params.text,
          });

          if (params.threadTs !== undefined) {
            formPayload.set("thread_ts", params.threadTs);
          }

          return formPayload;
        })();

    const payloadData = await callApiPost("chat.postEphemeral", payload);
    const channel = readString(payloadData, "channel") ?? params.channel;
    const messageTs = readString(payloadData, "message_ts");

    if (messageTs === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed post ephemeral payload.",
        hint: "Verify token scopes and channel access for chat.postEphemeral.",
      });
    }

    return {
      channel,
      messageTs,
    };
  };

  const updateMessage = async (
    params: SlackUpdateMessageParams,
  ): Promise<SlackUpdateMessageResult> => {
    const payload = new URLSearchParams({
      channel: params.channel,
      ts: params.ts,
      text: params.text,
    });
    const payloadData = await callApiPost("chat.update", payload);
    const channel = readString(payloadData, "channel") ?? params.channel;
    const ts = readString(payloadData, "ts");

    if (ts === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed update message payload.",
        hint: "Verify token scopes and channel access for chat.update.",
      });
    }

    return {
      channel,
      ts,
      message: mapMessage(readRecord(payloadData, "message")),
    };
  };

  const normalizeReactionParams = (params: SlackReactionParams): SlackReactionParams => {
    const channel = params.channel.trim();
    const timestamp = params.timestamp.trim();
    const name = params.name.trim();

    if (channel.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "Reaction channel is empty.",
        hint: "Provide non-empty channel id for reactions.add/remove.",
      });
    }

    if (timestamp.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "Reaction timestamp is empty.",
        hint: "Provide non-empty message timestamp for reactions.add/remove.",
      });
    }

    if (!/^\d+\.\d+$/.test(timestamp)) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: `Reaction timestamp is invalid: ${timestamp}.`,
        hint: "Use Slack message timestamp format: 1700000000.000000.",
      });
    }

    if (name.length === 0) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: "Reaction name is empty.",
        hint: "Provide non-empty emoji name for reactions.add/remove.",
      });
    }

    if (/\s/.test(name)) {
      throw createSlackClientError({
        code: "SLACK_CONFIG_ERROR",
        message: `Reaction name contains whitespace: ${name}.`,
        hint: "Use Slack emoji name without spaces, for example thumbs_up.",
      });
    }

    return { channel, timestamp, name };
  };

  const readReactionResult = (
    payloadData: Record<string, unknown>,
    params: SlackReactionParams,
    method: "reactions.add" | "reactions.remove",
  ): SlackReactionResult => {
    const channel = readString(payloadData, "channel");
    const itemType = readString(payloadData, "type");
    const message = readRecord(payloadData, "message");
    const ts = message === undefined ? undefined : readString(message, "ts");

    if (channel === undefined || ts === undefined || itemType !== "message") {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: `Slack API returned malformed ${method} payload.`,
        hint: "Verify token scopes and channel access for reaction methods.",
      });
    }

    return {
      channel,
      ts,
      name: params.name,
    };
  };

  const addReaction = async (params: SlackReactionParams): Promise<SlackReactionResult> => {
    const normalized = normalizeReactionParams(params);
    const payload = new URLSearchParams({
      channel: normalized.channel,
      timestamp: normalized.timestamp,
      name: normalized.name,
    });
    const payloadData = await callApiPost("reactions.add", payload);
    return readReactionResult(payloadData, normalized, "reactions.add");
  };

  const removeReaction = async (params: SlackReactionParams): Promise<SlackReactionResult> => {
    const normalized = normalizeReactionParams(params);
    const payload = new URLSearchParams({
      channel: normalized.channel,
      timestamp: normalized.timestamp,
      name: normalized.name,
    });
    const payloadData = await callApiPost("reactions.remove", payload);
    return readReactionResult(payloadData, normalized, "reactions.remove");
  };

  const getUserProfile = async (userId?: string): Promise<SlackUserProfileGetResult> => {
    const params = new URLSearchParams();
    if (userId !== undefined && userId.length > 0) {
      params.set("user", userId);
    }
    const payload = await callApi("users.profile.get", params);
    const profile = mapUserProfile(readRecord(payload, "profile"));
    if (profile === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed users.profile.get payload.",
        hint: "Verify token scopes and user access for users.profile.get.",
      });
    }
    return { profile };
  };

  const setUserProfile = async (
    params: SlackSetUserStatusParams,
  ): Promise<SlackUserProfileGetResult> => {
    const payloadData = await callApiPost("users.profile.set", {
      profile: {
        status_emoji: params.emoji,
        status_text: params.text,
        status_expiration: params.expiration ?? 0,
      },
    });
    const profile = mapUserProfile(readRecord(payloadData, "profile"));
    if (profile === undefined) {
      throw createSlackClientError({
        code: "SLACK_RESPONSE_ERROR",
        message: "Slack API returned malformed users.profile.set payload.",
        hint: "Verify token scopes and user access for users.profile.set.",
      });
    }
    return { profile };
  };

  return {
    listChannels,
    fetchChannelInfo,
    listUsers,
    getUsersByIds,
    listUsergroups,
    getCurrentUserId,
    listUsergroupUsers,
    createUsergroup,
    updateUsergroup,
    updateUsergroupUsers,
    searchMessages,
    fetchFileInfo,
    fetchFileText,
    fetchFileBinary,
    fetchChannelHistory,
    fetchMessageReplies,
    postMessage,
    deleteMessage,
    postEphemeral,
    updateMessage,
    addReaction,
    removeReaction,
    getUserProfile,
    setUserProfile,
  };
};
