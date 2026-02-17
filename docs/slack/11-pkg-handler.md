# pkg/handler

## meta

| field | val |
|---|---|
| path | `pkg/handler/` |
| pkg | `handler` |
| file | `conversations.go` (1451 line), `channels.go` (314 line), `usergroups.go` (484 line) |
| test | `conversations_test.go` (656 line), `channels_test.go` (164 line) |

## responsibility

- implement MCP tool handler (14 tool total)
- parse + validate tool param from `mcp.CallToolRequest`
- resolve channel name/user name → Slack ID via cache lookup
- format Slack API res → CSV/text/JSON for LLM agent
- enforce tool gate (env var + enabled-tool list)
- handle cache refresh-on-miss pattern

## contract

### ConversationsHandler

| fn | param | return | err |
|---|---|---|---|
| `ConversationsHistoryHandler` | `channel_id` (req), `include_activity_messages` (opt), `cursor` (opt), `limit` (opt, default `1d`) | CSV msg list | channel resolve fail, API err |
| `ConversationsRepliesHandler` | `channel_id` (req), `thread_ts` (req), `include_activity_messages` (opt), `cursor` (opt), `limit` (opt, default `1d`) | CSV msg list | channel resolve fail, thread_ts invalid, API err |
| `ConversationsAddMessageHandler` | `channel_id` (req), `thread_ts` (opt), `text` (opt), `content_type` (opt, default `text/markdown`) | posted msg confirm | channel resolve fail, channel not in whitelist, API err |
| `ConversationsSearchHandler` | `search_query` (opt), `filter_in_channel` (opt), `filter_in_im_or_mpim` (opt), `filter_users_with` (opt), `filter_users_from` (opt), `filter_date_before/after/on/during` (opt), `filter_threads_only` (opt), `cursor` (opt), `limit` (opt, default 20) | CSV msg list | bot tok guard, query parse fail, date parse fail, API err |
| `ReactionsAddHandler` | `channel_id` (req), `timestamp` (req), `emoji` (req) | ok confirm | channel resolve fail, API err |
| `ReactionsRemoveHandler` | `channel_id` (req), `timestamp` (req), `emoji` (req) | ok confirm | channel resolve fail, API err |
| `FilesGetHandler` | `file_id` (req, format `Fxxx`) | file metadata + content (text or base64) | file > 5MB, non-text mimetype, API err |
| `UsersSearchHandler` | `query` (req), `limit` (opt, default 10) | CSV user list | API err |
| `UsersResource` | uri `slack://<ws>/users` | CSV user directory (id, username, realname, displayname, email, title, dm_channel_id) | cache not ready |

### ChannelsHandler

| fn | param | return | err |
|---|---|---|---|
| `ChannelsHandler` | `channel_types` (req, csv), `sort` (opt, `popularity`), `limit` (opt, default 100), `cursor` (opt) | CSV channel list | invalid type, cache not ready |
| `ChannelsResource` | uri `slack://<ws>/channels` | CSV channel directory (id, name, topic, purpose, member_count) | cache not ready |

### UsergroupsHandler

| fn | param | return | err |
|---|---|---|---|
| `UsergroupsListHandler` | `include_users` (opt), `include_count` (opt, default true), `include_disabled` (opt) | CSV usergroup list | API err |
| `UsergroupsMeHandler` | `action` (req: `list`/`join`/`leave`), `usergroup_id` (req for join/leave) | CSV or confirm | action invalid, usergroup_id missing, API err |
| `UsergroupsCreateHandler` | `name` (req), `handle` (opt), `description` (opt), `channels` (opt, csv) | JSON usergroup | name missing, API err |
| `UsergroupsUpdateHandler` | `usergroup_id` (req), `name` (opt), `handle` (opt), `description` (opt), `channels` (opt, csv) | JSON usergroup | usergroup_id missing, no field provided, API err |
| `UsergroupsUsersUpdateHandler` | `usergroup_id` (req), `users` (req, csv user ID) | JSON usergroup | usergroup_id missing, users missing, API err |

## type

| name | kind | key field |
|---|---|---|
| `Message` | struct | `MsgID`, `UserID`, `UserName`, `RealName`, `Channel`, `ThreadTs`, `Text`, `Time`, `Reactions`, `BotName`, `FileCount`, `AttachmentIDs`, `HasMedia`, `Cursor` |
| `User` | struct | `UserID`, `UserName`, `RealName` |
| `UserSearchResult` | struct | `UserID`, `UserName`, `RealName`, `DisplayName`, `Email`, `Title`, `DMChannelID` (csv tag) |
| `Channel` | struct | `ID`, `Name`, `Topic`, `Purpose`, `MemberCount`, `Cursor` |
| `UserGroup` | struct | `ID`, `Name`, `Handle`, `Description`, `UserCount`, `IsExternal`, `DateCreate`, `DateUpdate`, `Users` (json-only) |
| `ConversationsHandler` | struct | `apiProvider *provider.ApiProvider`, `logger *zap.Logger` |
| `ChannelsHandler` | struct | `apiProvider *provider.ApiProvider`, `validTypes map[string]bool`, `logger *zap.Logger` |
| `UsergroupsHandler` | struct | `apiProvider *provider.ApiProvider`, `logger *zap.Logger` |

## deps

| dep | why |
|---|---|
| `pkg/provider` | Slack API call, cache access |
| `pkg/server/auth` | check auth context for channel whitelist |
| `pkg/text` | `TimestampToIsoRFC3339`, `ProcessText`, `AttachmentsTo2CSV`, `IsUnfurlingEnabled` |
| `github.com/mark3labs/mcp-go/mcp` | MCP protocol type (`CallToolRequest`, `CallToolResult`, `ReadResourceRequest`) |
| `github.com/slack-go/slack` | Slack API type (`Message`, `User`, `Channel`, `UserGroup`) |
| `github.com/gocarina/gocsv` | marshal slice to CSV string |
| `github.com/takara2314/slack-go-util` | `UnescapeMrkdwn` for markdown → text conversion |

## cfg

| param | default | source | effect |
|---|---|---|---|
| `defaultConversationsNumericLimit` | 50 | `conversations.go:25` | fallback when limit parse fail |
| `defaultConversationsExpressionLimit` | `"1d"` | `conversations.go:26` | default time range for history/reply |
| `maxFileSizeBytes` | `5*1024*1024` | `conversations.go:27` | reject file download > 5MB |
| `validFilterKeys` | map of 8 key | `conversations.go:30` | allowed search filter: `is`, `in`, `from`, `with`, `before`, `after`, `on`, `during` |

## edge-case

| case | symptom | fix |
|---|---|---|
| channel name `#general` not in cache | resolve fail | force refresh cache, retry lookup once |
| user name `@username` not in cache | resolve fail | force refresh cache, retry lookup once |
| limit `"1d"` but cursor present | conflict | return err "limit must be empty when cursor is provided" |
| `conversations_search_messages` w/ bot tok | tool not registered | guard in `server.NewMCPServer`: skip if `provider.IsBotToken()` |
| `conversations_add_message` channel not in whitelist | reject | check `isChannelAllowed()` → parse `SLACK_MCP_ADD_MESSAGE_TOOL`, support `!C123` negation |
| search query contains Slack msg URL | extract channel + timestamp | return single msg instead of search result |
| file mimetype not text | encode as base64 | wrap in `{"content": "...", "encoding": "base64"}` JSON |
| usergroup action `join`/`leave` but no usergroup_id | validation fail | return err "usergroup_id required for join/leave" |
| `limitByExpression` parse `"90d"` but > free tier | warning log | proceed (Slack API will enforce) |

## test-scope

| test | target | expected |
|---|---|---|
| `TestIntegrationConversations` | OpenAI client call tool via MCP | full e2e: list channel, fetch history, search msg, validate CSV structure |
| `TestUnitParseFlexibleDate` | `parseFlexibleDate()` | handle `"2023-10-01"`, `"July"`, `"Yesterday"`, `"Today"` |
| `TestUnitBuildDateFiltersUnit` | `buildDateFilters()` | before/after/on/during → `oldest`/`latest` timestamp |
| `TestUnitLimitByExpression_Valid` | `limitByExpression()` | `"1d"`, `"1w"`, `"30d"`, `"90d"` → correct `oldest`/`latest` |
| `TestUnitLimitByExpression_Invalid` | `limitByExpression()` | reject `"abc"`, `"0d"`, negative |
| `TestUnitIsChannelAllowedForConfig` | `isChannelAllowedForConfig()` | handle `"true"`, `"C123,C456"`, `"!C789"`, mixed (err) |
| `TestUnitIsSlackUserIDPrefix` | `isSlackUserIDPrefix()` | detect `U`, `W`, `B` prefix |
| `TestIntegrationPublicChannelsList` | `ChannelsHandler` | CSV w/ public_channel type, validate column |
| `TestIntegrationPrivateChannelsList` | `ChannelsHandler` | CSV w/ private_channel type, validate column |

## xref

| from | to |
|---|---|
| contract | xref:03-runtime#tool-flow |
| contract.resolve | xref:13-pkg-provider#contract |
| cfg.validFilterKeys | xref:03-runtime#env-var |
| edge-case.cache-miss | xref:13-pkg-provider#contract |
| test-scope | xref:02-architecture#data-flow |
