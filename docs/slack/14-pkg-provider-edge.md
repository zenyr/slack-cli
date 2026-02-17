# pkg/provider/edge

## meta

| field | val |
|---|---|
| path | `pkg/provider/edge/` |
| pkg | `edge` |
| file | `edge.go` (413 line), `client.go` (159 line), `client_boot.go` (633 line), `conversations.go` (116 line), `dms.go` (63 line), `search.go` (192 line), `users.go` (58 line), `userlist.go` (295 line), `slacker.go`, `fasttime/` (4 file) |

## responsibility

- HTTP client for Slack Edge API (undocumented internal endpoint)
- JSON/Form POST w/ rate limit retry (429 → wait `Retry-After`)
- massive response type: `ClientUserBootResponse` (600+ line struct, 20+ nested type)
- Enterprise Grid support: `SearchChannels`, `ClientUserBoot`
- xoxc tok + xoxd cookie auth
- platform-specific timestamp optimization (fasttime: x64/386)

## contract

### Client

| fn | param | return | err |
|---|---|---|---|
| `New` | `ctx, auth.Provider, ...Option` | `*Client, error` | AuthTest fail |
| `NewWithInfo` | `info *slack.AuthTestResponse, prov auth.Provider, ...Option` | `*Client, error` | teamID empty, token empty |
| `NewWithClient` | `workspaceName, teamID, token string, cl *http.Client, ...Option` | `*Client, error` | — |
| `NewWithToken` | `ctx, token string, cookies []*http.Cookie` | `*Client, error` | auth fail |
| `PostJSON` | `ctx, path string, req PostRequest` | `*http.Response, error` | HTTP err, rate limit |
| `Post` | `ctx, path string, a any` | `*http.Response, error` | form encode fail, HTTP err |
| `PostForm` | `ctx, path string, form url.Values` | `*http.Response, error` | HTTP err |
| `PostFormRaw` | `ctx, url string, form url.Values` | `*http.Response, error` | HTTP err |
| `ParseResponse` | `req any, r *http.Response` | `error` | JSON unmarshal fail, Slack API err |
| `ClientCounts` | `ctx` | `ClientCountsResponse, error` | API err |
| `ClientDMs` | `ctx` | `[]ClientDM, error` | API err, pagination fail |
| `ClientUserBoot` | `ctx` | `*ClientUserBootResponse, error` | API err |
| `ConversationsGenericInfo` | `ctx, channelID ...string` | `[]slack.Channel, error` | API err |
| `ConversationsView` | `ctx, channelID string` | `ConversationsViewResponse, error` | API err |
| `IMList` | `ctx` | `[]IM, error` | API err, pagination fail |
| `SearchChannels` | `ctx, query string` | `[]slack.Channel, error` | API err, pagination fail |
| `UsersSearch` | `ctx, query string, count int` | `[]slack.User, error` | API err |
| `UsersList` | `ctx, req UsersListRequest` | `[]User, error` | API err, pagination fail |
| `UsersInfo` | `ctx, userID ...string` | `[]User, error` | API err |
| `ChannelsMembership` | `ctx, channelID string` | `[]User, error` | API err, pagination fail |

### fasttime

| fn | param | return | note |
|---|---|---|---|
| `Time.UnmarshalJSON` | `[]byte` | `error` | parse Slack timestamp string (`"1234567890.123456"`) |
| `Time.MarshalJSON` | — | `[]byte, error` | format to string |
| `TS2int` | `string` | `int, error` | platform-specific: `strconv.Atoi` (x64) or `strconv.ParseInt` (386) |

## type

### massive response type (client_boot.go)

| name | field count | note |
|---|---|---|
| `ClientUserBootResponse` | 30+ | massive bootstrap res: Self, Team, IM arr, Workspace arr, Channel arr, Prefs (200+ field), Subteam, DND, Link, etc. |
| `UserBootChannel` | 29 | channel detail: ID, Name, IsChannel, IsGroup, IsIM, IsMpim, IsPrivate, Topic, Purpose, Member arr, LastRead, Latest |
| `Prefs` | 200+ | workspace preference (enormous struct, every setting) |
| `Self` | 22 | current user profile |
| `Team` | 14 | workspace info |
| `Workspace` | 9 | workspace summary |

### other key type

| name | kind | key field |
|---|---|---|
| `Client` | struct | `cl httpClient`, `edgeAPI string`, `webclientAPI string`, `token string`, `teamID string`, `tape io.WriteCloser` |
| `BaseRequest` | struct | `Token string` |
| `PostRequest` | interface | `SetToken(string)`, `IsTokenSet() bool` |
| `APIError` | struct | `Err string`, `Metadata ResponseMetadata`, `Endpoint string` |
| `ResponseMetadata` | struct | `Messages []string`, `NextCursor string` |
| `Pagination` | struct | `TotalCount int64`, `Page int`, `PerPage int`, `PageCount int`, `First int64`, `Last int64`, `NextCursor string` |
| `ChannelSnapshot` | struct | `ID`, `LastRead`, `Latest`, `HistoryInvalid` (all `fasttime.Time`), `MentionCount int`, `HasUnreads bool` |
| `ClientDM` | struct | `ID`, `Channel IM`, `Latest fasttime.Time` |
| `IM` | struct | 18 field (ID, Created, IsFrozen, IsArchived, IsIM, IsOrgShared, User, LastRead, Latest, IsOpen, SharedTeamIds, ConnectedTeamIds, etc.) |
| `ConversationsViewResponse` | struct | `Users []User`, `IM IM`, `Emojis map[string]string` |
| `UsersListRequest` | struct | `BaseRequest`, `Channels []string`, `PresentFirst bool`, `Filter string`, `Index string`, `Locale string`, `IncludeProfileOnlyUsers bool`, `Marker string`, `Count int` |
| `UsersListResponse` | struct | `Results []User`, `NextMarker string`, `baseResponse` |
| `User` | struct | 22 field (ID, TeamID, Name, Deleted, Color, RealName, Tz, Profile, IsAdmin, IsOwner, IsPrimaryOwner, IsBot, IsAppUser, Updated, etc.) |
| `Profile` | struct | 30+ field (Title, Phone, Skype, RealName, DisplayName, StatusText, StatusEmoji, AvatarHash, Email, ImageOriginal, etc.) |
| `Channel` | struct | embed `slack.GroupConversation`, add `IsChannel bool`, `IsGeneral bool`, `IsMember bool`, `NumMembers int`, `Locale string`, `Properties *slack.Properties` |
| `SearchResponse[T]` | generic struct | `baseResponse`, `Module string`, `Query string`, `Filters json.RawMessage`, `Pagination Pagination`, `Items []T` |
| `fasttime.Time` | struct | `time.Time` (embed) |

## cfg

| const | val | source | effect |
|---|---|---|---|
| `defaultUA` | Chrome 136 UA | `edge.go` | fallback User-Agent |
| `perPage` | `100` | `search.go` | pagination chunk size |
| `toolkitPEM` | HTTP Toolkit CA cert | `transport.go` | optional custom CA |

## deps

| dep | why |
|---|---|
| `pkg/limiter` | rate limit tier (Tier2boost for DM/IM pagination, Tier2/Tier3 for search) |
| `pkg/provider/edge/fasttime` | optimized Slack timestamp parse |
| `github.com/slack-go/slack` | Slack type interop (`Channel`, `User`, `Message`) |
| `github.com/rusq/slackauth` | `DefaultUserAgent` |
| `github.com/rusq/slackdump/v3/auth` | auth provider abstraction |
| `github.com/rusq/tagops` | struct → url.Values conversion |
| `github.com/google/uuid` | clientReqID/browseID for search API |

## edge-case

| case | symptom | fix |
|---|---|---|
| Slack 429 rate limit | HTTP 429 res | parse `Retry-After`, wait, retry once in `do()` fn |
| `SearchChannels` 0-member channel | invalid data | mark as archived in post-process |
| `ClientUserBoot` VersionTS | cache invalidation | set to `time.Now().Add(24*time.Hour)` future timestamp |
| paginated API w/o cursor | infinite loop | check `NextCursor` empty OR `Items` empty |
| Enterprise Grid non-OAuth tok | official API fail | fallback to `edge.SearchChannels()` in `ApiProvider.GetConversationsContext()` |
| `UsersList` Marker pagination | cursor mismatch | pass `Marker` from prev res `NextMarker` |
| `IMList` large ws | slow pagination | use `limiter.Tier2boost` (300ms per 5 req) |
| tape recorder enabled | debug mode | write req/res to file via `WithTape()` option |

## test-scope

| test | target | expected |
|---|---|---|
| `fasttime_test.go` | `Time.UnmarshalJSON()` | parse `"1234567890.123456"` → `time.Time` |
| `fasttime_test.go` | `Time.MarshalJSON()` | `time.Time` → `"1234567890.123456"` |
| `fasttime_test.go` | `TS2int()` | platform-specific: x64 use `Atoi`, 386 use `ParseInt` |
| `fasttime_test.go` | benchmark | compare vs stdlib `time.Parse` |

## xref

| from | to |
|---|---|
| contract.Client | xref:02-architecture#component-map |
| contract.SearchChannels | xref:13-pkg-provider#edge-case |
| cfg | xref:03-runtime#env-var |
| edge-case.rate-limit | xref:17-pkg-limiter#contract |
| deps.limiter | xref:17-pkg-limiter#contract |
