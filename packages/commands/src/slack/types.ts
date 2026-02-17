export type SlackTokenSource =
  | "SLACK_MCP_XOXP_TOKEN"
  | "SLACK_MCP_XOXB_TOKEN"
  | "env:SLACK_MCP_XOXP_TOKEN"
  | "env:SLACK_MCP_XOXB_TOKEN"
  | "store:active"
  | "store:fallback";

export type SlackTokenType = "xoxp" | "xoxb";

export type ResolvedSlackToken = {
  token: string;
  source: SlackTokenSource;
  tokenType?: SlackTokenType;
};

export type SlackClientErrorCode =
  | "SLACK_CONFIG_ERROR"
  | "SLACK_AUTH_ERROR"
  | "SLACK_HTTP_ERROR"
  | "SLACK_API_ERROR"
  | "SLACK_RESPONSE_ERROR";

export type SlackClientError = Error & {
  code: SlackClientErrorCode;
  hint?: string;
  status?: number;
  retryAfterSeconds?: number;
  details?: string;
};

export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount?: number;
};

export type SlackChannelType = "public" | "private" | "im" | "mpim";

export type SlackChannelsSort = "name" | "popularity";

export type SlackListChannelsOptions = {
  types: SlackChannelType[];
  limit: number;
};

export type SlackListChannelsResult = {
  channels: SlackChannel[];
  nextCursor?: string;
};

export type SlackUser = {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  email?: string;
  isBot: boolean;
  isDeleted: boolean;
  isAdmin: boolean;
};

export type SlackListUsersResult = {
  users: SlackUser[];
  nextCursor?: string;
};

export type SlackUserGroup = {
  id: string;
  handle: string;
  name: string;
  description?: string;
};

export type SlackListUsergroupsResult = {
  usergroups: SlackUserGroup[];
};

export type SlackListUsergroupsOptions = {
  includeUsers?: boolean;
  includeDisabled?: boolean;
  includeCount?: boolean;
};

export type SlackUpdateUsergroupParams = {
  id: string;
  name: string;
  handle: string;
};

export type SlackUpdateUsergroupResult = {
  usergroup: SlackUserGroup;
};

export type SlackUsergroupsUsersUpdateParams = {
  usergroupId: string;
  userIds: string[];
};

export type SlackUsergroupsUsersUpdateResult = {
  usergroupId: string;
  userIds: string[];
};

export type SlackCreateUsergroupParams = {
  name: string;
  handle: string;
};

export type SlackUsergroupUsersListParams = {
  usergroupId: string;
};

export type SlackUsergroupUsersListResult = {
  usergroupId: string;
  userIds: string[];
};

export type SlackAuthIdentityResult = {
  userId: string;
};

export type SlackUsergroupsWebApiClient = {
  listUsergroups: (options?: SlackListUsergroupsOptions) => Promise<SlackListUsergroupsResult>;
  createUsergroup: (params: SlackCreateUsergroupParams) => Promise<SlackUserGroup>;
};

export type SlackUsergroupsUpdateWebApiClient = {
  updateUsergroup: (params: SlackUpdateUsergroupParams) => Promise<SlackUpdateUsergroupResult>;
  updateUsergroupUsers: (
    params: SlackUsergroupsUsersUpdateParams,
  ) => Promise<SlackUsergroupsUsersUpdateResult>;
};

export type SlackAuthWebApiClient = {
  getCurrentUserId: () => Promise<string>;
};

export type SlackUsergroupsUsersListWebApiClient = {
  listUsergroupUsers: (
    params: SlackUsergroupUsersListParams,
  ) => Promise<SlackUsergroupUsersListResult>;
};

export type SlackUsergroupsMeWebApiClient = SlackAuthWebApiClient &
  SlackUsergroupsUsersListWebApiClient &
  Pick<SlackUsergroupsWebApiClient, "listUsergroups">;

export type SlackSearchMessage = {
  channelId?: string;
  channelName?: string;
  userId?: string;
  username?: string;
  text: string;
  ts: string;
  permalink?: string;
};

export type SlackSearchMessagesResult = {
  query: string;
  total: number;
  messages: SlackSearchMessage[];
};

export type SlackMessage = {
  type: string;
  user?: string;
  text: string;
  ts: string;
  threadTs?: string;
};

export type SlackPostMessageParams = {
  channel: string;
  text: string;
  threadTs?: string;
};

export type SlackPostMessageResult = {
  channel: string;
  ts: string;
  message?: SlackMessage;
};

export type SlackReactionParams = {
  channel: string;
  timestamp: string;
  name: string;
};

export type SlackReactionResult = {
  channel: string;
  ts: string;
  name: string;
};

export type SlackChannelHistoryResult = {
  channel: string;
  messages: SlackMessage[];
  nextCursor?: string;
};

export type SlackMessageRepliesParams = {
  channel: string;
  ts: string;
  limit?: number;
  oldest?: string;
  latest?: string;
  cursor?: string;
};

export type SlackChannelRepliesResult = {
  channel: string;
  messages: SlackMessage[];
  nextCursor?: string;
};

export type SlackRepliesWebApiClient = {
  fetchMessageReplies: (params: SlackMessageRepliesParams) => Promise<SlackChannelRepliesResult>;
};

export type SlackPostWebApiClient = {
  postMessage: (params: SlackPostMessageParams) => Promise<SlackPostMessageResult>;
};

export type SlackReactionsWebApiClient = {
  addReaction: (params: SlackReactionParams) => Promise<SlackReactionResult>;
  removeReaction: (params: SlackReactionParams) => Promise<SlackReactionResult>;
};

export type SlackWebApiClient = {
  listChannels: (options: SlackListChannelsOptions) => Promise<SlackListChannelsResult>;
  listUsers: () => Promise<SlackListUsersResult>;
  searchMessages: (query: string) => Promise<SlackSearchMessagesResult>;
  fetchChannelHistory: (params: {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
    includeActivity?: boolean;
  }) => Promise<SlackChannelHistoryResult>;
};
