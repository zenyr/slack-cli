# cmd/slack-mcp-server

## meta

| field | val |
|---|---|
| path | `cmd/slack-mcp-server/main.go` |
| pkg | `main` |
| line | 375 |
| binary | `slack-mcp-server` |

## responsibility

- parse CLI flag + env fallback
- init structured logger (zap)
- validate tool cfg
- create ApiProvider + MCPServer
- launch cache warmup goroutine (user → channel, sequential)
- serve transport (stdio/sse/http)

## cli-arg

| flag | alias | type | default | desc |
|---|---|---|---|---|
| `-transport` | `-t` | string | `"stdio"` | transport type: stdio, sse, http |
| `-enabled-tools` | `-e` | string | `""` | comma-sep tool name subset; empty = all |

## startup-order

| order | fn | what | gate |
|---|---|---|---|
| 1 | `flag.Parse()` | parse CLI flag | — |
| 2 | env fallback | read `SLACK_MCP_ENABLED_TOOLS` if `-e` empty | — |
| 3 | `newLogger(transport)` | create zap logger; output stderr for stdio, stdout otherwise | fatal on error |
| 4 | `validateToolConfig()` | validate `SLACK_MCP_ADD_MESSAGE_TOOL` format | fatal on error |
| 5 | `server.ValidateEnabledTools()` | check name against `ValidToolNames` | fatal on error |
| 6 | `provider.New(transport, logger)` | create ApiProvider; detect tok type; init slack-go + edge client | fatal on auth fail |
| 7 | `server.NewMCPServer(p, logger, enabledTools)` | register 14 tool + 2 resource + 3 middleware | `shouldAddTool` gate |
| 8 | goroutine: `newUsersWatcher()` | fetch user list → disk cache; retry loop w/ backoff | — |
| 9 | goroutine: `newChannelsWatcher()` | fetch channel list → disk cache; after user watcher | sync.Once "fully ready" log |
| 10 | transport serve | start serving | see run-mode |

## run-mode

| mode | trigger | bind | note |
|---|---|---|---|
| stdio | `-t stdio` | stdin/stdout | busy-wait 100ms loop until `p.IsReady()` before `ServeStdio()` |
| sse | `-t sse` | `SLACK_MCP_HOST:SLACK_MCP_PORT` (default `127.0.0.1:13080`) | `ServeSSE()` → `sseServer.Start()` |
| http | `-t http` | `SLACK_MCP_HOST:SLACK_MCP_PORT` (default `127.0.0.1:13080`) | `ServeHTTP()` → `httpServer.Start()` |

## contract

| fn | sig | param | return | err |
|---|---|---|---|---|
| `main` | `func main()` | — | — | `os.Exit` via `logger.Fatal` |
| `newUsersWatcher` | `func(p *provider.ApiProvider, once *sync.Once, logger *zap.Logger) func()` | provider, once, logger | closure `func()` | log + retry on fail |
| `newChannelsWatcher` | `func(p *provider.ApiProvider, once *sync.Once, logger *zap.Logger) func()` | provider, once, logger | closure `func()` | log + retry on fail |
| `validateToolConfig` | `func(config string) error` | `SLACK_MCP_ADD_MESSAGE_TOOL` val | `error` | mixed positive/negative channel ID |
| `newLogger` | `func(transport string) (*zap.Logger, error)` | transport string | logger, err | invalid log level |
| `shouldUseJSONFormat` | `func() bool` | — | bool | — |
| `shouldUseColors` | `func() bool` | — | bool | — |
| `getConsoleLevelEncoder` | `func(useColors bool) zapcore.LevelEncoder` | bool | encoder | — |

## cfg

| env | default | source | effect |
|---|---|---|---|
| `SLACK_MCP_ENABLED_TOOLS` | — | `main.go:33` | fallback for `-e` flag |
| `SLACK_MCP_ADD_MESSAGE_TOOL` | — | `main.go:52` | validate + pass to shouldAddTool |
| `SLACK_MCP_HOST` | `127.0.0.1` | `main.go:94,124` | SSE/HTTP bind host |
| `SLACK_MCP_PORT` | `13080` | `main.go:98,128` | SSE/HTTP bind port |
| `SLACK_MCP_LOG_LEVEL` | `info` | `main.go:256` | zap log level override |
| `SLACK_MCP_LOG_FORMAT` | auto | `main.go:323` | `"json"` force JSON |
| `SLACK_MCP_LOG_COLOR` | auto | `main.go:350` | `"true"`/`"1"` force color |

## xref

| from | to |
|---|---|
| startup-order | xref:02-architecture#startup |
| run-mode | xref:03-runtime#request-flow |
| contract.validateToolConfig | xref:03-runtime#env-var |
| cfg | xref:03-runtime#env-var |
