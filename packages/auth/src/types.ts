export type AuthTokenType = "xoxp" | "xoxb";

export type AuthTokenSource =
  | "env:SLACK_MCP_XOXP_TOKEN"
  | "env:SLACK_MCP_XOXB_TOKEN"
  | "store:active"
  | "store:fallback";

export type ResolvedAuthToken = {
  token: string;
  type: AuthTokenType;
  source: AuthTokenSource;
};

export type AuthIdentity = {
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
  teamUrl?: string;
  botId?: string;
  isEnterpriseInstall?: boolean;
  tokenType: AuthTokenType;
};

export type AuthErrorCode =
  | "AUTH_CONFIG_ERROR"
  | "AUTH_STORE_ERROR"
  | "AUTH_NETWORK_ERROR"
  | "AUTH_HTTP_ERROR"
  | "AUTH_RESPONSE_ERROR"
  | "AUTH_SLACK_AUTH_ERROR"
  | "AUTH_SLACK_API_ERROR";

export type AuthError = Error & {
  code: AuthErrorCode;
  hint?: string;
  status?: number;
  details?: string;
};

export type LoginInput = {
  type: AuthTokenType;
  token: string;
};

export type AuthService = {
  resolveToken: () => Promise<ResolvedAuthToken>;
  login: (input: LoginInput) => Promise<ResolvedAuthToken>;
  logout: () => Promise<void>;
  useTokenType: (type: AuthTokenType) => Promise<void>;
  check: () => Promise<AuthIdentity>;
  whoami: () => Promise<AuthIdentity>;
};

export type AuthServiceOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  authFilePath?: string;
  homeDir?: string | undefined;
};
