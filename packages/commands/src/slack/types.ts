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
  needed?: string;
  provided?: string;
};

export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount?: number;
  topic?: string;
  purpose?: string;
};

export type SlackChannelInfo = {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isExtShared?: boolean;
  isIm?: boolean;
  isMpim?: boolean;
  memberCount?: number;
  topic?: string;
  purpose?: string;
  creator?: string;
  created?: number;
  lastRead?: string;
  unreadCount?: number;
  latestTs?: string;
};

export type SlackChannelInfoResult = {
  channel: SlackChannelInfo;
};

export type SlackChannelInfoWebApiClient = {
  fetchChannelInfo: (channelId: string) => Promise<SlackChannelInfoResult>;
};

export type SlackChannelResolverWebApiClient = Pick<SlackWebApiClient, "listChannels">;

export type SlackChannelJoinResult = {
  channel: SlackChannel;
};

export type SlackChannelJoinWebApiClient = {
  joinChannel: (channelId: string) => Promise<SlackChannelJoinResult>;
  leaveChannel: (channelId: string) => Promise<{ ok: boolean }>;
};

export type SlackChannelType = "public" | "private" | "im" | "mpim";

export type SlackChannelsSort = "name" | "popularity";

export type SlackListChannelsOptions = {
  types: SlackChannelType[];
  limit: number;
  cursor?: string;
  userOnly?: boolean;
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
  avatar?: SlackUserAvatar;
  isBot: boolean;
  isDeleted: boolean;
  isAdmin: boolean;
};

export type SlackUserAvatar = {
  image24?: string;
  image32?: string;
  image48?: string;
  image72?: string;
  image192?: string;
  image512?: string;
  imageOriginal?: string;
};

export type SlackListUsersResult = {
  users: SlackUser[];
  nextCursor?: string;
};

export type SlackListUsersOptions = {
  limit?: number;
  cursor?: string;
};

export type SlackGetUsersByIdsResult = {
  users: SlackUser[];
  missingUserIds: string[];
};

export type SlackUserGroup = {
  id: string;
  handle: string;
  name: string;
  description?: string;
  userCount?: number;
  users?: string[];
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
  name?: string;
  handle?: string;
  description?: string;
  channels?: string[];
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
  handle?: string;
  description?: string;
  channels?: string[];
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
  nextCursor?: string;
};

export type SlackMessage = {
  type: string;
  user?: string;
  text: string;
  ts: string;
  threadTs?: string;
  blocks?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
  files?: SlackFileMetadata[];
};

export type SlackEmailMetadata = {
  from?: string[];
  cc?: string[];
  subject?: string;
};

export type SlackFileMetadata = {
  id: string;
  name: string;
  mimetype?: string;
  filetype?: string;
  mode?: string;
  title?: string;
  size?: number;
  urlPrivate?: string;
  email?: SlackEmailMetadata;
};

export type SlackFileText = {
  content: string;
  byteLength: number;
  contentType?: string;
};

export type SlackFileBinary = {
  contentBase64: string;
  byteLength: number;
  contentType?: string;
  encoding: "base64";
};

export type SlackPostMessageParams = {
  channel: string;
  text: string;
  threadTs?: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  replyBroadcast?: boolean;
  blocks?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
};

export type SlackPostMessageResult = {
  channel: string;
  ts: string;
  message?: SlackMessage;
};

export type SlackDeleteMessageParams = {
  channel: string;
  ts: string;
};

export type SlackDeleteMessageResult = {
  channel: string;
  ts: string;
};

export type SlackPostEphemeralParams = {
  channel: string;
  user: string;
  text: string;
  threadTs?: string;
  blocks?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
};

export type SlackPostEphemeralResult = {
  channel: string;
  messageTs: string;
};

export type SlackUpdateMessageParams = {
  channel: string;
  ts: string;
  text: string;
  blocks?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
};

export type SlackUpdateMessageResult = {
  channel: string;
  ts: string;
  message?: SlackMessage;
};

export type SlackView = {
  id?: string;
  type?: string;
  hash?: string;
};

export type SlackPublishViewParams = {
  userId: string;
  view: Record<string, unknown>;
  hash?: string;
};

export type SlackPublishViewResult = {
  view: SlackView;
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
  includeActivity?: boolean;
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
  deleteMessage: (params: SlackDeleteMessageParams) => Promise<SlackDeleteMessageResult>;
  postEphemeral: (params: SlackPostEphemeralParams) => Promise<SlackPostEphemeralResult>;
  updateMessage: (params: SlackUpdateMessageParams) => Promise<SlackUpdateMessageResult>;
};

export type SlackViewsWebApiClient = {
  publishView: (params: SlackPublishViewParams) => Promise<SlackPublishViewResult>;
};

export type SlackReactionsWebApiClient = {
  addReaction: (params: SlackReactionParams) => Promise<SlackReactionResult>;
  removeReaction: (params: SlackReactionParams) => Promise<SlackReactionResult>;
};

export type SlackReactionDetail = {
  name: string;
  count: number;
  users: string[];
};

export type SlackGetReactionsResult = {
  channel: string;
  ts: string;
  reactions: SlackReactionDetail[];
};

export type SlackReactionsGetWebApiClient = {
  getReactions: (params: {
    channel: string;
    timestamp: string;
  }) => Promise<SlackGetReactionsResult>;
};

export type SlackWebApiClient = {
  listChannels: (options: SlackListChannelsOptions) => Promise<SlackListChannelsResult>;
  listUsers: (options?: SlackListUsersOptions) => Promise<SlackListUsersResult>;
  searchMessages: (
    query: string,
    options?: { limit?: number; cursor?: string },
  ) => Promise<SlackSearchMessagesResult>;
  fetchChannelHistory: (params: {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
    includeActivity?: boolean;
    inclusive?: boolean;
  }) => Promise<SlackChannelHistoryResult>;
};

export type SlackMarkConversationParams = {
  channel: string;
  ts: string;
};

export type SlackMarkConversationResult = {
  channel: string;
  ts: string;
};

export type SlackConversationMarkWebApiClient = {
  markConversation: (params: SlackMarkConversationParams) => Promise<SlackMarkConversationResult>;
};

export type SlackUsersInfoWebApiClient = {
  getUsersByIds: (userIds: string[]) => Promise<SlackGetUsersByIdsResult>;
};

export type SlackPinParams = {
  channel: string;
  timestamp: string;
};

export type SlackPinResult = {
  channel: string;
  ts: string;
};

export type SlackPinnedItem = {
  type: string;
  channel: string;
  message?: SlackMessage;
  createdBy?: string;
  created?: number;
};

export type SlackListPinsResult = {
  channel: string;
  items: SlackPinnedItem[];
};

export type SlackPinsWebApiClient = {
  addPin: (params: SlackPinParams) => Promise<SlackPinResult>;
  removePin: (params: SlackPinParams) => Promise<SlackPinResult>;
  listPins: (channel: string) => Promise<SlackListPinsResult>;
};

export type SlackAttachmentWebApiClient = {
  fetchFileInfo: (fileId: string) => Promise<SlackFileMetadata>;
  fetchFileText: (urlPrivate: string, maxBytes: number) => Promise<SlackFileText>;
  fetchFileBinary: (urlPrivate: string, maxBytes: number) => Promise<SlackFileBinary>;
};

export type SlackUserStatus = {
  emoji: string;
  text: string;
  expiration: number;
};

export type SlackUserProfile = {
  displayName?: string;
  realName?: string;
  email?: string;
  avatar?: SlackUserAvatar;
  status: SlackUserStatus;
};

export type SlackUserProfileGetResult = {
  profile: SlackUserProfile;
};

export type SlackSetUserStatusParams = {
  emoji: string;
  text: string;
  expiration?: number;
};

export type SlackUserProfileWebApiClient = {
  getUserProfile: (userId?: string) => Promise<SlackUserProfileGetResult>;
  setUserProfile: (params: SlackSetUserStatusParams) => Promise<SlackUserProfileGetResult>;
};
