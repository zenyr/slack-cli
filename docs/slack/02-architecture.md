# architecture

## boundary

| boundary | in | out | auth |
|---|---|---|---|
| agent -> MCP server | JSON-RPC tool/resource request | MCP text/image content | stdio none; SSE/HTTP API key |
| MCP server -> Slack Web API | slack-go HTTP request | Slack JSON | xoxp/xoxb bearer token |
| MCP server -> Slack Edge API | form/JSON request | Slack internal JSON | xoxc token + xoxd cookie |
| provider -> disk cache | user/channel snapshot | JSON file | private cache directory/file |

## component-map

| component | role | file |
|---|---|---|
| main | flags, logger, cache warmup, transport switch, `--no-cache` | `cmd/slack-mcp-server/main.go` |
| MCPServer | 22 tool schemas, 2 resources, middleware | `pkg/server/server.go` |
| ConversationsHandler | conversation/reaction/attachment/user-search tools and user resource | `pkg/handler/conversations.go` |
| ChannelsHandler | channel list/me tools and channel resource | `pkg/handler/channels.go` |
| UsergroupsHandler | usergroup list/me/create/update/member update | `pkg/handler/usergroups.go` |
| SavedHandler | saved list/update/clear-completed workflows | `pkg/handler/saved.go` |
| ApiProvider | immutable snapshots, SWR, channel/user fetch and search routing | `pkg/provider/api.go` |
| MCPSlackClient | official/Edge API dispatch and token capability detection | `pkg/provider/api.go` |
| edge.Client | internal Slack endpoints including counts, prefs, search, saved items | `pkg/provider/edge` |

## request-flow

| step | actor | action |
|---|---|---|
| 1 | mcp-go | receive stdio/SSE/HTTP request |
| 2 | middleware | recover errors, log duration, validate transport auth |
| 3 | handler | parse schema args, enforce tool gate, resolve IDs |
| 4 | provider | read atomic cache or dispatch official/Edge API call |
| 5 | limiter | wait by Slack tier; selected operations retry bounded 429 responses |
| 6 | handler | map Slack data to CSV/text/JSON or native MCP image content |
| 7 | mcp-go | return tool result; handler errors become `isError=true` results |

## startup

| order | action | behavior |
|---|---|---|
| 1 | parse transport, enabled tools, `--no-cache` | enabled list falls back to env |
| 2 | validate message gate and all 22 tool names | fatal on invalid configuration |
| 3 | create provider | authenticate, detect token/enterprise capabilities |
| 4 | create MCP server | conditionally register tools; always register 2 resources |
| 5 | initialize cache | load fresh cache, serve stale cache + background refresh, or cold-fetch |
| 6 | serve transport | stdio waits for ready cache; SSE/HTTP can warm in background |

`--no-cache` marks snapshots ready without data. Name lookups then fail by design; direct IDs still
work.

## middleware-chain

| order | middleware | effect |
|---|---|---|
| 1 | error recovery | convert handler error to MCP error result |
| 2 | logger | log tool name and duration |
| 3 | auth | enforce API key on SSE/HTTP; skip stdio |
