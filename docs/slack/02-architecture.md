# architecture

## boundary

| boundary | in | out | auth |
|---|---|---|---|
| LLM Agent → MCP Server | MCP tool call (JSON-RPC) | tool result (text/CSV) | SSE: API key header; stdio: none |
| MCP Server → Slack Web API | HTTP req via slack-go | JSON res | xoxp/xoxb tok in header |
| MCP Server → Slack Edge API | HTTP req via edge client | JSON res | xoxc tok + xoxd cookie |
| MCP Server → Disk Cache | file read/write | JSON user/channel snapshot | filesystem path |

## component-map

| component | role | file | dep |
|---|---|---|---|
| main | CLI parse, logger init, cache warmup goroutine, transport switch | `cmd/slack-mcp-server/main.go` | provider, server |
| MCPServer | MCP protocol server, tool/resource registration, middleware | `pkg/server/server.go` | handler, provider, auth, mcp-go |
| ConversationsHandler | tool handler: history, reply, search, add_msg, reaction, file, user_search | `pkg/handler/conversations.go` | provider, text, auth |
| ChannelsHandler | tool handler: channel_list; resource: channel directory | `pkg/handler/channels.go` | provider, text, auth |
| UsergroupsHandler | tool handler: usergroup list/create/update/users_update/me | `pkg/handler/usergroups.go` | provider |
| ApiProvider | cache mgmt (atomic snapshot), channel/user fetch, search dispatch | `pkg/provider/api.go` | edge, transport, limiter, slack-go |
| MCPSlackClient | SlackAPI interface impl, tok type detection, enterprise detection | `pkg/provider/api.go` | edge, slack-go, slackdump/auth |
| edge.Client | Slack Edge API HTTP client (JSON/Form post, rate retry) | `pkg/provider/edge/edge.go` | limiter, slackauth |
| ProvideHTTPClient | HTTP client factory w/ uTLS, proxy, custom CA | `pkg/transport/transport.go` | utls, text |
| auth middleware | SSE/HTTP API key validation via context injection | `pkg/server/auth/sse_auth.go` | mcp-go |
| rate limiter | tier-based `rate.Limiter` wrapper | `pkg/limiter/limits.go` | `x/time/rate` |

## data-flow

| step | actor | fn | in | out | note |
|---|---|---|---|---|---|
| 1 | LLM agent | MCP tool call | JSON-RPC `tools/call` | — | via stdio/SSE/HTTP transport |
| 2 | mcp-go framework | middleware chain | tool req | — | error-recovery → logger → auth check |
| 3 | handler | parse param | `mcp.CallToolRequest` | typed param struct | validate required field, resolve channel ID |
| 4 | handler | resolve channel | `#name` or `@user` | channel ID (`Cxxx`) | lookup in cache, refresh-on-miss |
| 5 | provider | rate limit check | — | wait/proceed | per-tier limiter gate |
| 6 | provider | Slack API call | typed req | typed res | via slack-go or edge client |
| 7 | handler | format result | Slack res | CSV or text | `gocsv.MarshalString` for tabular data |
| 8 | mcp-go framework | return result | `*mcp.CallToolResult` | JSON-RPC res | back to LLM agent |

## startup

| order | fn | what | gate |
|---|---|---|---|
| 1 | `flag.Parse()` | parse `-t` (transport), `-e` (enabled-tool) | — |
| 2 | env fallback | `SLACK_MCP_ENABLED_TOOLS` if flag empty | — |
| 3 | `newLogger()` | create zap logger (JSON/console, color detect) | — |
| 4 | `validateToolConfig()` | validate `SLACK_MCP_ADD_MESSAGE_TOOL` format | fatal on error |
| 5 | `server.ValidateEnabledTools()` | check tool name against `ValidToolNames` | fatal on error |
| 6 | `provider.New()` | create ApiProvider, detect tok type, init slack-go + edge client | fatal on auth fail |
| 7 | `server.NewMCPServer()` | register tool (14) + resource (2) + middleware (3) | `shouldAddTool` gate |
| 8 | goroutine: `newUsersWatcher()` | fetch + cache user list, retry loop | — |
| 9 | goroutine: `newChannelsWatcher()` | fetch + cache channel list, retry loop | after user watcher |
| 10 | transport serve | `ServeStdio()` / `ServeSSE()` / `ServeHTTP()` | stdio: busy-wait until ready |

## middleware-chain

| order | middleware | fn | effect |
|---|---|---|---|
| 1 | error recovery | `buildErrorRecoveryMiddleware` | catch panic, return MCP error |
| 2 | logger | `buildLoggerMiddleware` | log tool call duration + result |
| 3 | auth | `auth.BuildMiddleware` | validate API key for SSE/HTTP; skip for stdio |

## xref

| from | to |
|---|---|
| component-map.MCPServer | xref:12-pkg-server#contract |
| component-map.handler | xref:11-pkg-handler#contract |
| component-map.ApiProvider | xref:13-pkg-provider#contract |
| component-map.edge | xref:14-pkg-provider-edge#contract |
| component-map.transport | xref:15-pkg-transport#contract |
| startup | xref:10-cmd-main#startup-order |
| data-flow.rate-limit | xref:17-pkg-limiter#contract |
