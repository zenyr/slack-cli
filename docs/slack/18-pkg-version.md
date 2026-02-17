# pkg/version

## meta

| field | val |
|---|---|
| path | `pkg/version/version.go` |
| pkg | `version` |
| line | 7 |

## responsibility

- expose build-time version info via linker-injected var

## contract

| var | type | default | injected via ldflags |
|---|---|---|---|
| `CommitHash` | string | `"unknown"` | `-X 'pkg/version.CommitHash=$(GIT_COMMIT_HASH)'` |
| `BuildTime` | string | `"1970-01-01T00:00:00Z"` | `-X 'pkg/version.BuildTime=$(BUILD_TIME)'` |
| `Version` | string | `"0.0.0"` | `-X 'pkg/version.Version=$(GIT_VERSION)'` |
| `BinaryName` | string | `"slack-mcp-server"` | `-X 'pkg/version.BinaryName=$(BINARY_NAME)'` |

## deps

(none — stdlib only)

## xref

| from | to |
|---|---|
| contract | xref:12-pkg-server#contract |
