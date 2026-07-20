# overview

## baseline

| field | val |
|---|---|
| source | local `source/master@b88c0de` |
| runtime | `v1.3.0` tag, `a079b3c` |
| post-tag delta | docs only through `b88c0de` |
| module | `github.com/korotovsky/slack-mcp-server` |
| lang | Go 1.25 |
| binary | `slack-mcp-server` |
| transport | stdio, SSE, Streamable HTTP |
| protocol | MCP via `github.com/mark3labs/mcp-go` |
| license | MIT |

## scope

- 22 MCP tools: conversation, reaction, attachment, channel, usergroup, user search, saved item
- 2 CSV resources: channel directory and user directory
- auth: xoxp user OAuth, xoxb bot, xoxc/xoxd browser session
- Edge API for Enterprise Grid, complete unread state, user search, muted prefs, saved items
- atomic user/channel cache with disk persistence, 24h default TTL, stale-while-revalidate
- tiered Slack rate limiting and bounded retries
- uTLS transport fingerprint, proxy, custom CA

## pkg-map

| id | path | role |
|---|---|---|
| cmd | `cmd/slack-mcp-server` | flag parse, logger, cache startup, transport selection |
| handler | `pkg/handler` | 22 tool handlers and 2 resource handlers |
| server | `pkg/server` | MCP setup, tool/resource registration, middleware |
| auth | `pkg/server/auth` | SSE/HTTP API-key middleware |
| provider | `pkg/provider` | Slack API facade, token routing, cache management |
| edge | `pkg/provider/edge` | undocumented Slack Edge API client |
| transport | `pkg/transport` | HTTP client, uTLS, proxy, CA configuration |
| text | `pkg/text` | message fallback rendering, normalization, security filtering |
| limiter | `pkg/limiter` | rate tiers and retry helper |
| version | `pkg/version` | linker-injected build identity |

## risk

| item | impact | guard |
|---|---|---|
| Edge API undocumented | endpoint/schema break | isolated client; official API fallback where available |
| xoxc/xoxd expiry | session invalidation | browser token re-extraction |
| stale cache | outdated names/channels | 24h TTL, SWR, forced refresh on miss |
| bot token | no search or unread state | conditional tool registration |
| Slack 429 | delayed/partial result | tier limiter and bounded `Retry-After` retry |
| saved tools | browser-session dependency | register only for non-bot, non-OAuth tokens |

## xref

| from | to |
|---|---|
| architecture | `02-architecture.md` |
| runtime | `03-runtime.md` |
| handler | `11-pkg-handler.md` |
| server | `12-pkg-server.md` |
| provider | `13-pkg-provider.md` |
| edge | `14-pkg-provider-edge.md` |
