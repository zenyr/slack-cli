# pkg/server

## meta

| field | val |
|---|---|
| path | `pkg/server/server.go`, `pkg/server/auth/sse_auth.go` |
| pkg | `server`, `server/auth` |
| line | 555 (server.go), 145 (sse_auth.go) |
| test | `server_test.go` (465 line) |

## responsibility

- MCP server lifecycle mgmt (stdio/sse/http mode)
- tool + resource registration w/ conditional gate
- middleware chain: error-recovery → logger → auth
- SSE/HTTP API key auth via context injection
- tool name validation

## contract

### server.MCPServer

| fn | sig | param | return | err |
|---|---|---|---|---|
| `NewMCPServer` | `func(provider *provider.ApiProvider, logger *zap.Logger, enabledTools []string) *MCPServer` | provider, logger, enabled-tool subset | `*MCPServer` | — |
| `ServeSSE` | `func(s *MCPServer) ServeSSE(addr string) *server.SSEServer` | bind addr | SSE server | — |
| `ServeHTTP` | `func(s *MCPServer) ServeHTTP(addr string) *server.StreamableHTTPServer` | bind addr | HTTP server | — |
| `ServeStdio` | `func(s *MCPServer) ServeStdio() error` | — | — | stdio err |
| `ValidateEnabledTools` | `func(tools []string) error` | tool name arr | — | unknown tool name |

### auth middleware

| fn | sig | param | return | err |
|---|---|---|---|---|
| `BuildMiddleware` | `func(transport string, logger *zap.Logger) server.ToolHandlerMiddleware` | transport, logger | middleware | — |
| `IsAuthenticated` | `func(ctx context.Context, transport string, logger *zap.Logger) (bool, error)` | ctx, transport, logger | bool, err | invalid tok |
| `AuthFromRequest` | `func(logger *zap.Logger) func(context.Context, *http.Request) context.Context` | logger | context injector | — |

### gate logic

| fn | sig | param | return | note |
|---|---|---|---|---|
| `shouldAddTool` | `func(name string, enabledTools []string, envVarName string) bool` | tool name, enabled list, env gate | bool | read-only: always OR in enabled-tool; write: env OR in enabled-tool |

## type

| name | kind | key field |
|---|---|---|
| `MCPServer` | struct | `server *server.MCPServer`, `logger *zap.Logger` |
| `authKey` | struct | (empty, context key only) |

## tool-constant

| name | val |
|---|---|
| `ToolConversationsHistory` | `"conversations_history"` |
| `ToolConversationsReplies` | `"conversations_replies"` |
| `ToolConversationsAddMessage` | `"conversations_add_message"` |
| `ToolReactionsAdd` | `"reactions_add"` |
| `ToolReactionsRemove` | `"reactions_remove"` |
| `ToolAttachmentGetData` | `"attachment_get_data"` |
| `ToolConversationsSearchMessages` | `"conversations_search_messages"` |
| `ToolChannelsList` | `"channels_list"` |
| `ToolUsergroupsList` | `"usergroups_list"` |
| `ToolUsergroupsMe` | `"usergroups_me"` |
| `ToolUsergroupsCreate` | `"usergroups_create"` |
| `ToolUsergroupsUpdate` | `"usergroups_update"` |
| `ToolUsergroupsUsersUpdate` | `"usergroups_users_update"` |

## registration-flow

| order | step | gate | handler |
|---|---|---|---|
| 1 | create mcp-go server | — | `server.New()` w/ option arr |
| 2 | add middleware | — | error-recovery, logger, auth |
| 3 | create handler instance | — | `handler.NewConversationsHandler()`, `handler.NewChannelsHandler()`, `handler.NewUsergroupsHandler()` |
| 4 | register 14 tool | `shouldAddTool()` | per-tool call to `s.AddTool()` |
| 5 | register 2 resource | — | `s.AddResource()` for channel + user dir |

## shouldAddTool-matrix

| tool | env gate | enabled-tool gate | read-only | note |
|---|---|---|---|---|
| `conversations_history` | — | yes | yes | — |
| `conversations_replies` | — | yes | yes | — |
| `conversations_add_message` | `SLACK_MCP_ADD_MESSAGE_TOOL` | yes | no | — |
| `conversations_search_messages` | — | yes | yes | skip if bot tok |
| `channels_list` | — | yes | yes | — |
| `reactions_add` | `SLACK_MCP_REACTION_TOOL` | yes | no | — |
| `reactions_remove` | `SLACK_MCP_REACTION_TOOL` | yes | no | — |
| `attachment_get_data` | `SLACK_MCP_ATTACHMENT_TOOL` | yes | yes | — |
| `users_search` | — | no (always on) | yes | — |
| `usergroups_list` | — | yes | yes | — |
| `usergroups_me` | — | yes | read/write | — |
| `usergroups_create` | — | yes | no | — |
| `usergroups_update` | — | yes | no | — |
| `usergroups_users_update` | — | yes | no | — |

## middleware-chain

| order | name | fn | effect |
|---|---|---|---|
| 1 | error-recovery | `buildErrorRecoveryMiddleware` | catch panic → MCP error res |
| 2 | logger | `buildLoggerMiddleware` | log tool name + duration + result |
| 3 | auth | `auth.BuildMiddleware` | validate API key for SSE/HTTP; skip for stdio |

## cfg

| env | default | source | effect |
|---|---|---|---|
| `SLACK_MCP_API_KEY` | — | `sse_auth.go:27` | primary API key for SSE/HTTP auth |
| `SLACK_MCP_SSE_API_KEY` | — | `sse_auth.go:29` | deprecated fallback |
| `SLACK_MCP_ADD_MESSAGE_TOOL` | — | `server.go` | gate for add-msg tool |
| `SLACK_MCP_REACTION_TOOL` | — | `server.go` | gate for reaction tool |
| `SLACK_MCP_ATTACHMENT_TOOL` | — | `server.go` | gate for attachment tool |

## deps

| dep | why |
|---|---|
| `pkg/handler` | tool handler impl |
| `pkg/provider` | Slack API provider + cache |
| `pkg/text` | `Workspace()` parse ws name from auth res URL |
| `pkg/version` | inject version into MCP server info |
| `github.com/mark3labs/mcp-go` | MCP protocol framework |
| `go.uber.org/zap` | structured logging |

## edge-case

| case | symptom | fix |
|---|---|---|
| unknown tool name in enabled-tool | validation fail at startup | `ValidateEnabledTools()` check against `ValidToolNames` |
| SSE/HTTP transport but no API key | auth reject all req | `IsAuthenticated()` return false + err |
| stdio transport w/ API key | API key ignored | `BuildMiddleware()` skip auth for stdio |
| panic in tool handler | crash MCP server | `buildErrorRecoveryMiddleware()` catch + return MCP err |
| bot tok + search tool | tool not available | `NewMCPServer()` skip registration if `provider.IsBotToken()` |
| enabled-tool empty | all read-only tool on | `shouldAddTool()` return true for read-only when empty |
| enabled-tool non-empty but missing write tool | write tool off | `shouldAddTool()` return false if not in list + env not set |

## test-scope

| test | target | expected |
|---|---|---|
| `TestShouldAddTool_ReadOnly_EmptyEnabledTools` | read-only tool, empty list | return true |
| `TestShouldAddTool_ReadOnly_ExplicitEnabledTools` | read-only tool, explicit list | return true if in list |
| `TestShouldAddTool_SingleToolEnabled` | single tool in list | only that tool true |
| `TestValidToolNames` | `ValidToolNames` arr | 13 tool name (14 total, users_search always on) |
| `TestValidateEnabledTools` | `ValidateEnabledTools()` | reject unknown name |
| `TestShouldAddTool_WriteTool_AddMessage` | add-msg tool gate | env OR in list |
| `TestShouldAddTool_WriteTool_Reactions` | reaction tool gate | env OR in list |
| `TestShouldAddTool_WriteTool_Attachment` | attachment tool gate | env OR in list |
| `TestIntegrationErrorRecoveryMiddleware` | panic in handler | catch + MCP err res |
| `TestShouldAddTool_Matrix` | full matrix | validate all combination |

## xref

| from | to |
|---|---|
| contract | xref:02-architecture#component-map |
| registration-flow | xref:02-architecture#startup |
| shouldAddTool-matrix | xref:03-runtime#tool-flow |
| middleware-chain | xref:02-architecture#middleware-chain |
| cfg | xref:03-runtime#env-var |
