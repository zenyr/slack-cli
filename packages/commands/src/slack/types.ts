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

export type SlackListChannelsResult = {
  channels: SlackChannel[];
  nextCursor?: string;
};

export type SlackUser = {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  isBot: boolean;
  isDeleted: boolean;
  isAdmin: boolean;
};

export type SlackListUsersResult = {
  users: SlackUser[];
  nextCursor?: string;
};

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

export type SlackWebApiClient = {
  listChannels: () => Promise<SlackListChannelsResult>;
  listUsers: () => Promise<SlackListUsersResult>;
  searchMessages: (query: string) => Promise<SlackSearchMessagesResult>;
};
