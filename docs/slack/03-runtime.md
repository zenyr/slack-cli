# runtime

## request-flow

| transport | entry | middleware | handler dispatch |
|---|---|---|---|
| stdio | stdin JSON-RPC → mcp-go `ServeStdio` | error-recovery → logger → auth(skip) | `server.MCPServer` route by tool name |
| sse | HTTP `GET /sse` + `POST /messages` → mcp-go `SSEServer` | error-recovery → logger → auth(API key) | same |
| http | HTTP `POST /mcp` → mcp-go `StreamableHTTPServer` | error-recovery → logger → auth(API key) | same |

## tool-flow

| tool | handler | read/write | gate env | gate logic | output |
|---|---|---|---|---|---|
| `conversations_history` | `ConversationsHandler.ConversationsHistoryHandler` | read | — | always (or in enabled-tool) | CSV msg list |
| `conversations_replies` | `ConversationsHandler.ConversationsRepliesHandler` | read | — | always (or in enabled-tool) | CSV msg list |
| `conversations_add_message` | `ConversationsHandler.ConversationsAddMessageHandler` | write | `SLACK_MCP_ADD_MESSAGE_TOOL` | env set OR in enabled-tool | posted msg confirm |
| `conversations_search_messages` | `ConversationsHandler.ConversationsSearchHandler` | read | — | always + NOT bot tok | CSV msg list |
| `channels_list` | `ChannelsHandler.ChannelsHandler` | read | — | always (or in enabled-tool) | CSV channel list |
| `reactions_add` | `ConversationsHandler.ReactionsAddHandler` | write | `SLACK_MCP_REACTION_TOOL` | env set OR in enabled-tool | ok confirm |
| `reactions_remove` | `ConversationsHandler.ReactionsRemoveHandler` | write | `SLACK_MCP_REACTION_TOOL` | env set OR in enabled-tool | ok confirm |
| `attachment_get_data` | `ConversationsHandler.FilesGetHandler` | read | `SLACK_MCP_ATTACHMENT_TOOL` | env set OR in enabled-tool | file content (text/base64) |
| `users_search` | `ConversationsHandler.UsersSearchHandler` | read | — | always (no shouldAddTool gate) | CSV user list |
| `usergroups_list` | `UsergroupsHandler.UsergroupsListHandler` | read | — | always (or in enabled-tool) | CSV usergroup list |
| `usergroups_me` | `UsergroupsHandler.UsergroupsMeHandler` | read/write | — | always (or in enabled-tool) | CSV or confirm |
| `usergroups_create` | `UsergroupsHandler.UsergroupsCreateHandler` | write | — | always (or in enabled-tool) | JSON usergroup |
| `usergroups_update` | `UsergroupsHandler.UsergroupsUpdateHandler` | write | — | always (or in enabled-tool) | JSON usergroup |
| `usergroups_users_update` | `UsergroupsHandler.UsergroupsUsersUpdateHandler` | write | — | always (or in enabled-tool) | JSON usergroup |

## resource

| uri | handler | mime | content |
|---|---|---|---|
| `slack://<ws>/channels` | `ChannelsHandler.ChannelsResource` | `text/csv` | channel directory (id, name, topic, purpose, member_count) |
| `slack://<ws>/users` | `ConversationsHandler.UsersResource` | `text/csv` | user directory (id, username, realname, displayname, email, title, dm_channel_id) |

## env-var

### auth & tok

| var | type | default | effect |
|---|---|---|---|
| `SLACK_MCP_XOXP_TOKEN` | string | — | user OAuth tok (priority 1) |
| `SLACK_MCP_XOXB_TOKEN` | string | — | bot tok (priority 2); no search API |
| `SLACK_MCP_XOXC_TOKEN` | string | — | browser session tok (priority 3, pair w/ xoxd) |
| `SLACK_MCP_XOXD_TOKEN` | string | — | browser cookie tok (pair w/ xoxc) |
| `SLACK_MCP_API_KEY` | string | — | SSE/HTTP auth API key |
| `SLACK_MCP_SSE_API_KEY` | string | — | deprecated fallback for API_KEY |

### tool registration

| var | type | default | effect |
|---|---|---|---|
| `SLACK_MCP_ENABLED_TOOLS` | csv string | — | restrict tool set (fallback for `-e` flag) |
| `SLACK_MCP_ADD_MESSAGE_TOOL` | string | — | enable msg tool; `"true"`/`"1"` or channel whitelist |
| `SLACK_MCP_REACTION_TOOL` | string | — | enable reaction tool if non-empty |
| `SLACK_MCP_ATTACHMENT_TOOL` | string | — | enable attachment tool if non-empty |

### server & network

| var | type | default | effect |
|---|---|---|---|
| `SLACK_MCP_HOST` | string | `127.0.0.1` | SSE/HTTP bind host |
| `SLACK_MCP_PORT` | int | `13080` | SSE/HTTP bind port |
| `SLACK_MCP_GOVSLACK` | string | — | `"true"` → use `slack-gov.com` domain |
| `SLACK_MCP_USER_AGENT` | string | Chrome 136 UA | custom User-Agent for Slack req |

### TLS & security

| var | type | default | effect |
|---|---|---|---|
| `SLACK_MCP_PROXY` | string | — | proxy URL; exclusive w/ CUSTOM_TLS |
| `SLACK_MCP_CUSTOM_TLS` | string | — | enable uTLS fingerprint |
| `SLACK_MCP_SERVER_CA` | string | — | custom CA cert file path |
| `SLACK_MCP_SERVER_CA_TOOLKIT` | string | — | append embedded HTTP Toolkit CA |
| `SLACK_MCP_SERVER_CA_INSECURE` | string | — | `InsecureSkipVerify`; exclusive w/ SERVER_CA |

### cache

| var | type | default | effect |
|---|---|---|---|
| `SLACK_MCP_CACHE_TTL` | duration/sec | `1h` | cache TTL (0 = never expire) |
| `SLACK_MCP_MIN_REFRESH_INTERVAL` | duration/sec | `30s` | min forced refresh interval |
| `SLACK_MCP_USERS_CACHE` | string | auto | override user cache file path |
| `SLACK_MCP_CHANNELS_CACHE` | string | auto | override channel cache file path |

### logging

| var | type | default | effect |
|---|---|---|---|
| `SLACK_MCP_LOG_LEVEL` | string | `info` | zap log level |
| `SLACK_MCP_LOG_FORMAT` | string | auto | `"json"` force JSON log |
| `SLACK_MCP_LOG_COLOR` | string | auto | `"true"`/`"1"` force color |
| `ENVIRONMENT` | string | — | `prod`/`staging` → JSON; `dev` → console |
| `KUBERNETES_SERVICE_HOST` | string | — | if set → JSON log |
| `DOCKER_CONTAINER` | string | — | if set → JSON log |
| `container` | string | — | if set → JSON log |
| `NO_COLOR` | string | — | if set → disable color |
| `FORCE_COLOR` | string | — | if set → force color |

## resilience

| signal | action | reason |
|---|---|---|
| Slack 429 | retry once after `Retry-After` | edge client `do()` fn |
| cache miss on channel resolve | force refresh → retry lookup | `resolveChannelID` in handler |
| cache TTL expired | re-fetch from API on next access | `refreshUsersInternal` / `refreshChannelsInternal` |
| forced refresh rate limit | return `ErrRefreshRateLimited`, skip | prevent API flood |
| panic in tool handler | recover, return MCP error | `buildErrorRecoveryMiddleware` |
| auth fail (SSE/HTTP) | reject w/ "Unauthorized" | `auth.BuildMiddleware` |
| demo tok (`"demo"`) | skip cache warmup, return mock auth | `main.go` + `MCPSlackClient.AuthTest` |

## xref

| from | to |
|---|---|
| tool-flow | xref:11-pkg-handler#contract |
| env-var.auth | xref:01-overview#risk |
| env-var.cache | xref:13-pkg-provider#cfg |
| env-var.tls | xref:15-pkg-transport#cfg |
| resilience.rate-limit | xref:17-pkg-limiter#contract |
| request-flow | xref:02-architecture#middleware-chain |
