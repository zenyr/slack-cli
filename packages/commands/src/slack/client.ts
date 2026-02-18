import { resolveSlackToken, resolveSlackTokenFromEnv } from "./token";
import type {
  ResolvedSlackToken,
  SlackAttachmentWebApiClient,
  SlackAuthWebApiClient,
  SlackChannel,
  SlackChannelHistoryResult,
  SlackChannelRepliesResult,
  SlackChannelType,
  SlackCreateUsergroupParams,
  SlackFileBinary,
  SlackFileMetadata,
  SlackListChannelsOptions,
  SlackListChannelsResult,
  SlackListUsergroupsOptions,
  SlackListUsergroupsResult,
  SlackListUsersOptions,
  SlackListUsersResult,
  SlackMessage,
  SlackPostMessageResult,
  SlackPostWebApiClient,
  SlackReactionParams,
  SlackReactionResult,
  SlackReactionsWebApiClient,
  SlackRepliesWebApiClient,
  SlackSearchMessage,
  SlackSearchMessagesResult,
  SlackUpdateUsergroupParams,
  SlackUser,
  SlackUserGroup,
  SlackUsergroupsUpdateWebApiClient,
  SlackUsergroupsUsersListWebApiClient,
  SlackUsergroupsUsersUpdateParams,
  SlackUsergroupsWebApiClient,
  SlackUsergroupUsersListParams,
  SlackUsergroupUsersListResult,
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
  SlackUsergroupsWebApiClient &
  SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  SlackUsergroupsUpdateWebApiClient &
  SlackRepliesWebApiClient &
  SlackPostWebApiClient &
  SlackReactionsWebApiClient => {
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
    payload: URLSearchParams,
  ): Promise<Record<string, unknown>> => {
    const token = (await getResolvedToken()).token;
    const url = buildMethodUrl(baseUrl, method);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
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

  const postMessage = async (params: {
    channel: string;
    text: string;
    threadTs?: string;
  }): Promise<SlackPostMessageResult> => {
    const payload = new URLSearchParams({
      channel: params.channel,
      text: params.text,
    });
    if (params.threadTs !== undefined) {
      payload.set("thread_ts", params.threadTs);
    }
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

  return {
    listChannels,
    listUsers,
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
    addReaction,
    removeReaction,
  };
};
