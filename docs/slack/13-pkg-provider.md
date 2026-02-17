# pkg/provider

## meta

| field | val |
|---|---|
| path | `pkg/provider/api.go` |
| pkg | `provider` |
| line | 1219 |
| test | `cache_test.go` (383 line) |

## responsibility

- Slack API abstraction via `SlackAPI` interface (21 method)
- token type detection (xoxp/xoxb/xoxc/xoxd) + priority selection
- atomic user + channel cache w/ disk persistence
- cache TTL + forced refresh w/ rate limit guard
- Enterprise Grid detection + edge client fallback
- Slack Connect user merge

## contract

### SlackAPI interface

| method | sig | note |
|---|---|---|
| `AuthTest` | `() (*slack.AuthTestResponse, error)` | demo tok → mock res |
| `AuthTestContext` | `(ctx) (*slack.AuthTestResponse, error)` | delegate to slack-go |
| `GetUsersContext` | `(ctx, ...slack.GetUsersOption) ([]slack.User, error)` | paginated user list |
| `GetUsersInfo` | `(...string) (*[]slack.User, error)` | batch user detail |
| `PostMessageContext` | `(ctx, channel string, ...slack.MsgOption) (string, string, error)` | post msg, return channel + timestamp |
| `MarkConversationContext` | `(ctx, channel, ts string) error` | mark msg read |
| `AddReactionContext` | `(ctx, name string, item slack.ItemRef) error` | add emoji reaction |
| `RemoveReactionContext` | `(ctx, name string, item slack.ItemRef) error` | remove emoji reaction |
| `GetConversationHistoryContext` | `(ctx, *slack.GetConversationHistoryParameters) (*slack.GetConversationHistoryResponse, error)` | channel msg history |
| `GetConversationRepliesContext` | `(ctx, *slack.GetConversationRepliesParameters) ([]slack.Message, bool, string, error)` | thread reply |
| `SearchContext` | `(ctx, query string, params slack.SearchParameters) (*slack.SearchMessages, *slack.SearchFiles, error)` | search msg + file |
| `GetFileInfoContext` | `(ctx, fileID string, count, page int) (*slack.File, []slack.Comment, *slack.Paging, error)` | file metadata |
| `GetFileContext` | `(ctx, downloadURL string, writer io.Writer) error` | download file content |
| `GetConversationsContext` | `(ctx, *slack.GetConversationsParameters) ([]slack.Channel, string, error)` | **Enterprise Grid**: use edge client if non-OAuth tok |
| `ClientUserBoot` | `(ctx) (*edge.ClientUserBootResponse, error)` | edge API: massive bootstrap res |
| `UsersSearch` | `(ctx, query string, count int) ([]slack.User, error)` | edge API: user search |
| `GetUserGroupsContext` | `(ctx, ...slack.GetUserGroupsOption) ([]slack.UserGroup, error)` | list usergroup |
| `GetUserGroupMembersContext` | `(ctx, userGroup string, ...slack.GetUserGroupMembersOption) ([]string, error)` | usergroup member ID arr |
| `CreateUserGroupContext` | `(ctx, slack.UserGroup, ...slack.CreateUserGroupOption) (slack.UserGroup, error)` | create usergroup |
| `UpdateUserGroupContext` | `(ctx, userGroupID string, ...slack.UpdateUserGroupsOption) (slack.UserGroup, error)` | update usergroup metadata |
| `UpdateUserGroupMembersContext` | `(ctx, userGroup, members string, ...slack.UpdateUserGroupMembersOption) (slack.UserGroup, error)` | replace usergroup member |

### ApiProvider

| fn | param | return | err |
|---|---|---|---|
| `RefreshUsers` | `ctx` | `error` | API fail, cache not ready during warmup |
| `ForceRefreshUsers` | `ctx` | `error` | rate limit (`ErrRefreshRateLimited`), API fail |
| `RefreshChannels` | `ctx` | `error` | API fail, cache not ready |
| `ForceRefreshChannels` | `ctx` | `error` | rate limit, API fail |
| `GetSlackConnect` | `ctx` | `[]slack.User`, `error` | API fail |
| `GetChannelsType` | `ctx, chanType string` | `[]Channel` | API fail |
| `GetChannels` | `ctx, types []string` | `[]Channel` | API fail |
| `ProvideUsersMap` | — | `*UsersCache` | atomic load, never nil after warmup |
| `ProvideChannelsMaps` | — | `*ChannelsCache` | atomic load, never nil after warmup |
| `IsReady` | — | `bool, error` | `ErrUsersNotReady`, `ErrChannelsNotReady` |
| `ServerTransport` | — | `string` | — |
| `Slack` | — | `SlackAPI` | — |
| `IsBotToken` | — | `bool` | — |
| `IsOAuth` | — | `bool` | — |
| `SearchUsers` | `ctx, query string, limit int` | `[]slack.User`, `error` | OAuth: regex cache search; xoxc: edge API |

### factory

| fn | param | return | note |
|---|---|---|---|
| `New` | `transport string, logger *zap.Logger` | `*ApiProvider` | read env var, detect tok priority: xoxp > xoxb > xoxc/xoxd |
| `NewMCPSlackClient` | `auth.Provider, logger *zap.Logger` | `*MCPSlackClient, error` | AuthTest, detect enterprise/OAuth/bot |

## type

| name | kind | key field |
|---|---|---|
| `Channel` | struct | `ID`, `Name`, `Topic`, `Purpose`, `MemberCount`, `IsMpIM`, `IsIM`, `IsPrivate`, `User`, `Members` |
| `UsersCache` | struct | `Users map[string]slack.User` (ID→User), `UsersInv map[string]string` (Username→ID) |
| `ChannelsCache` | struct | `Channels map[string]Channel` (ID→Channel), `ChannelsInv map[string]string` (Name→ID) |
| `ApiProvider` | struct | `transport string`, `client SlackAPI`, `logger *zap.Logger`, `rateLimiter *rate.Limiter`, `cacheTTL time.Duration`, `minRefreshInterval time.Duration`, `usersSnapshot atomic.Pointer[UsersCache]`, `usersCachePath string`, `usersReady bool`, `lastForcedUsersRefresh time.Time`, `usersMu sync.RWMutex`, `channelsSnapshot atomic.Pointer[ChannelsCache]`, `channelsCachePath string`, `channelsReady bool`, `lastForcedChannelsRefresh time.Time`, `channelsMu sync.RWMutex` |
| `MCPSlackClient` | struct | `slackClient *slack.Client`, `edgeClient *edge.Client`, `authResponse *slack.AuthTestResponse`, `authProvider auth.Provider`, `isEnterprise bool`, `isOAuth bool`, `isBotToken bool`, `teamEndpoint string` |

## cfg

| env | default | source | effect |
|---|---|---|---|
| `SLACK_MCP_XOXP_TOKEN` | — | `api.go` priority 1 | user OAuth tok |
| `SLACK_MCP_XOXB_TOKEN` | — | `api.go` priority 2 | bot tok |
| `SLACK_MCP_XOXC_TOKEN` | — | `api.go` priority 3 | browser session tok (pair w/ xoxd) |
| `SLACK_MCP_XOXD_TOKEN` | — | `api.go` priority 3 | browser cookie tok |
| `SLACK_MCP_GOVSLACK` | — | `api.go` | `"true"` → slack-gov.com |
| `SLACK_MCP_USERS_CACHE` | `<cacheDir>/<teamID>_.users_cache.json` | `api.go` | override user cache path |
| `SLACK_MCP_CHANNELS_CACHE` | `<cacheDir>/<teamID>_.channels_cache_v2.json` | `api.go` | override channel cache path |
| `SLACK_MCP_CACHE_TTL` | `1h` | `api.go:getCacheTTL()` | cache TTL (0 = never expire) |
| `SLACK_MCP_MIN_REFRESH_INTERVAL` | `30s` | `api.go:getMinRefreshInterval()` | min forced refresh interval |

## deps

| dep | why |
|---|---|
| `pkg/provider/edge` | Slack Edge API client |
| `pkg/transport` | HTTP client factory |
| `pkg/limiter` | rate limit tier |
| `github.com/slack-go/slack` | official Slack API client |
| `github.com/rusq/slackdump/v3/auth` | auth provider abstraction |
| `golang.org/x/time/rate` | rate limiter |

## edge-case

| case | symptom | fix |
|---|---|---|
| demo tok (`"demo"`) | skip cache warmup | `AuthTest()` return mock res, `New()` skip cache init |
| xoxp + xoxb + xoxc all set | priority conflict | xoxp win (priority 1) |
| cache file mtime > TTL | stale data | re-fetch on next `RefreshUsers()`/`RefreshChannels()` |
| forced refresh < minRefreshInterval | flood API | return `ErrRefreshRateLimited` |
| Enterprise Grid + non-OAuth tok | `GetConversationsContext` fail | fallback to `edgeClient.SearchChannels()` |
| Slack Connect user | missing in `GetUsersContext` | fetch from `ClientUserBoot` IM list, merge into cache |
| DM channel name | `User` field not in cache | fallback to `"@unknown-<UserID>"` |
| MPIM channel name | multiple user | join `@user1, @user2, @user3` |
| cache not ready during startup | `IsReady()` return err | handler return err, LLM agent see "cache warming up" |

## test-scope

| test | target | expected |
|---|---|---|
| `TestGetCacheTTL` | `getCacheTTL()` | default 1h, duration parse, numeric sec, zero disable, invalid fallback |
| `TestCacheExpiry` | mtime check | fresh=not expired, 2h old=expired w/ 1h TTL, TTL=0 never expire |
| `TestChannelCacheRoundTrip` | JSON marshal/unmarshal | public channel, IM w/ User field, private w/ Members |
| `TestChannelLookupByName` | `channelsInv` map | existing channel, DM by name, nonexistent return false |
| `TestChannelIDPatterns` | `needsLookup()` helper | `C`/`G`/`D` prefix no lookup; `#`/`@` need lookup |
| `TestRefreshOnErrorPattern` | cache-miss pattern | miss → refresh → hit; miss → refresh → still miss |
| `TestGetCacheDir` | `getCacheDir()` | non-empty path containing `slack-mcp-server`, dir exist |
| `TestGetMinRefreshInterval` | `getMinRefreshInterval()` | default 30s, duration parse, numeric sec, zero disable |

## xref

| from | to |
|---|---|
| contract.SlackAPI | xref:02-architecture#component-map |
| contract.ApiProvider | xref:11-pkg-handler#contract |
| cfg | xref:03-runtime#env-var |
| edge-case.Enterprise-Grid | xref:14-pkg-provider-edge#contract |
| edge-case.rate-limit | xref:17-pkg-limiter#contract |
