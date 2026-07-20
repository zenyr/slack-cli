# pkg/version

## baseline

- Runtime release: `v1.3.0` at `a079b3c`
- Reviewed source: `source/master@b88c0de`
- Commits after the tag through the reviewed source change documentation only

## contract

| var | default | build value |
|---|---|---|
| `CommitHash` | `unknown` | Git commit hash via linker flags |
| `BuildTime` | `1970-01-01T00:00:00Z` | build timestamp via linker flags |
| `Version` | `0.0.0` | release/version string via linker flags |
| `BinaryName` | `slack-mcp-server` | output binary name via linker flags |

The package contains mutable string variables so release builds can inject identity without
changing source. `server.NewMCPServer` exposes `Version`; transport startup logs all build fields.
