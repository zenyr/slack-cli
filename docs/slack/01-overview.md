# overview

## meta

| field | val |
|---|---|
| module | `github.com/korotovsky/slack-mcp-server` |
| lang | Go 1.24.4 |
| binary | `slack-mcp-server` |
| transport | stdio, sse, http |
| protocol | MCP (Model Context Protocol) via `github.com/mark3labs/mcp-go` |
| license | MIT |
| repo | `https://github.com/korotovsky/slack-mcp-server` |

## scope

- MCP server bridging LLM agent to Slack workspace API
- 14 tool: conversation history/reply/search/msg, channel list, reaction add/remove, attachment get, user search, usergroup CRUD
- 2 resource: channel directory (CSV), user directory (CSV)
- 3 auth method: xoxp (user OAuth), xoxb (bot), xoxc/xoxd (browser session)
- Edge API client for undocumented Slack internal endpoint (Enterprise Grid support)
- Atomic cache for user + channel w/ disk persistence + TTL
- Rate limit tier (Tier2/Tier2boost/Tier3) via `golang.org/x/time/rate`
- uTLS transport fingerprint, proxy support, custom CA

## pkg-map

| id | path | role | dep |
|---|---|---|---|
| cmd | `cmd/slack-mcp-server` | entrypoint, CLI arg parse, logger init, cache warmup | server, provider |
| handler | `pkg/handler` | MCP tool handler impl (conversation, channel, usergroup) | provider, server/auth, text, mcp-go |
| server | `pkg/server` | MCP server setup, tool registration, middleware chain | handler, provider, server/auth, text, version, mcp-go |
| auth | `pkg/server/auth` | SSE/HTTP API key auth middleware | mcp-go, zap |
| provider | `pkg/provider` | Slack API abstraction, cache mgmt, token detection | edge, transport, limiter, slack-go, slackdump |
| edge | `pkg/provider/edge` | Slack Edge API client (undocumented internal endpoint) | limiter, fasttime, slack-go, slackauth |
| fasttime | `pkg/provider/edge/fasttime` | Optimized Slack timestamp parse (platform-specific) | — |
| transport | `pkg/transport` | HTTP client factory, uTLS fingerprint, proxy, CA cfg | text, utls, zap |
| text | `pkg/text` | Text processing, unfurl security, cert display | slack-go, publicsuffix, zap |
| limiter | `pkg/limiter` | Rate limit tier definition | `golang.org/x/time/rate` |
| version | `pkg/version` | Build-time version injection via ldflags | — |
| test/util | `pkg/test/util` | Integration test helper (MCP server launch, ngrok tunnel) | mcp-go, ngrok |

## glossary

| abbr | full | usage |
|---|---|---|
| req | request | fn input, HTTP req |
| res | response | fn output, HTTP res |
| msg | message | Slack msg or generic payload |
| fn | function | operation unit |
| pkg | package | Go module |
| cfg | configuration | runtime option |
| env | environment variable | `os.Getenv` source |
| param | parameter | fn/tool input key |
| auth | authentication/authorization | access control |
| tok | token | Slack API tok (xoxp/xoxb/xoxc/xoxd) |
| ws | workspace | Slack ws instance |
| mgmt | management | non-business support logic |
| arr | array | slice type |
| obj | object | struct/map type |
| IM | instant message | Slack DM (1:1) |
| MPIM | multi-person IM | Slack group DM |
| DXT | Desktop Extension | Claude Desktop plugin format |
| SSE | Server-Sent Event | streaming transport |
| xref | cross-reference | link between doc |

## risk

| item | impact | guard |
|---|---|---|
| Edge API undocumented | break on Slack update | isolated in `pkg/provider/edge`, fallback to official API |
| xoxc/xoxd tok expiry | session invalidation | user re-extract from browser |
| cache stale | outdated user/channel data | TTL-based expiry + forced refresh w/ rate limit |
| bot tok limitation | no `search.messages` API | runtime guard: skip tool registration if bot tok |
| Enterprise Grid | different channel fetch path | `isEnterprise` flag, edge client `SearchChannels` fallback |
| rate limit | Slack API 429 | per-tier rate limiter + retry-once in edge client |

## xref

| from | to |
|---|---|
| pkg-map | xref:02-architecture#component-map |
| scope.tool | xref:11-pkg-handler#contract |
| scope.auth | xref:03-runtime#env-var |
| scope.cache | xref:13-pkg-provider#contract |
| scope.edge | xref:14-pkg-provider-edge#contract |
| scope.transport | xref:15-pkg-transport#contract |
| risk.rate-limit | xref:17-pkg-limiter#contract |
