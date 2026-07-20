# Feature Parity

Migration target: upstream Go MCP server to the Bun CLI. Tool parity means equivalent user-visible
capability adapted to CLI conventions; it does not imply MCP transport or identical output shape.

## Baseline

- Authoritative source: local `source/master@b88c0de`
- Runtime source: `v1.3.0` tag at `a079b3c`; commits through `b88c0de` change docs only
- Upstream surface: 22 MCP tools and 2 CSV resources
- CLI auth: `xoxp` and `xoxb`; browser session `xoxc`/`xoxd` is unsupported
- `slack tools` lists referenced upstream tool names, not supported CLI capabilities

## Status Matrix

| Upstream tool | CLI equivalent | Status | Remaining difference |
|---|---|---|---|
| `conversations_history` | `messages history` | Full | None verified |
| `conversations_replies` | `messages replies` | Full | None verified |
| `conversations_add_message` | `messages post` | Full | CLI request/output shape; blocks-only payload supported |
| `reactions_add` | `reactions add` | Full | None verified |
| `reactions_remove` | `reactions remove` | Full | None verified |
| `attachment_get_data` | `attachment get --content` | Full | Upstream image output is native MCP image content; CLI returns base64 because transport differs |
| `conversations_search_messages` | `messages search` / `messages fetch` | Full | None verified |
| `conversations_unreads` | `messages unreads` | Partial | No Edge `client.counts`; xoxp scan can be incomplete and cannot reliably exclude muted channels |
| `conversations_mark` | `messages mark` | Full | Same opt-in safety gate |
| `conversations_leave` | `channels leave` | Full | Already implemented before v1.3 sync |
| `conversations_join` | `channels join` | Full | Already implemented before v1.3 sync |
| `channels_list` | `channels list` | Partial | Query mode scans at most five Slack API pages; upstream filters the complete channel cache |
| `channels_me` | `channels me` | Full | Native `users.conversations` cursor path delivered |
| `usergroups_list` | `usergroups list` | Full | None verified |
| `usergroups_me` | `usergroups me list/join/leave` | Full | One MCP action split into CLI subcommands |
| `usergroups_create` | `usergroups create` | Full | None verified |
| `usergroups_update` | `usergroups update` | Full | None verified |
| `usergroups_users_update` | `usergroups users update` | Full | CLI adds explicit `--yes` overwrite guard |
| `users_search` | `users search` | Partial | Required query and direct ID lookup delivered; Edge search path and Slack Connect coverage absent |
| `saved_list` | None | Missing | Edge-only `saved.list` requires `xoxc`/`xoxd` |
| `saved_update` | None | Missing | Edge-only `saved.update` requires `xoxc`/`xoxd` |
| `saved_clear_completed` | None | Missing | Edge-only `saved.clearCompleted` requires `xoxc`/`xoxd` |

Summary: **16 full, 3 partial, 3 missing**.

## v1.3 Delta

Delivered in the current CLI:

- Blocks-only `messages post --payload`; text remains optional only with non-empty blocks.
- Message text preservation plus Block Kit fallback, legacy attachment rendering, and email-file
  metadata rendering.
- `messages search` bounded Slack 429 handling: at most two retries using `Retry-After`.
- Required `users search` query and direct `U...`/`W...` user ID lookup through `users.info`.
- `channels me` and `channels list --query --query-targets=name,topic,purpose`.
- `channels join` and `channels leave` retained as existing equivalents.
- Attachment metadata/content/save modes and attachment safety gate.

## Attachment Contract

`slack attachment get <file-id>` returns metadata by default. The command requires the attachment
gate through `SLACK_MCP_ATTACHMENT_TOOL=true|1|yes` or
`SLACK_MCP_ENABLED_TOOLS=...,attachment_get_data,...`.

| Mode | Behavior |
|---|---|
| default | Metadata only |
| `--content` | Text MIME types return text with `encoding: "none"`; other MIME types return base64 with `encoding: "base64"` |
| `--save` | Writes bytes under a private temporary directory (`0700`) to a randomized file (`0600`) |

`--content` and `--save` conflict, and downloads are capped at 5 MiB. Upstream returns images as
native MCP image content; the CLI's base64 representation is an intentional transport-specific
difference, not missing file support.

## Upstream Runtime Notes

- User/channel cache TTL defaults to 24 hours, configurable by `SLACK_MCP_CACHE_TTL`.
- Expired cache uses stale-while-revalidate: the existing snapshot is served immediately while one
  guarded background refresh replaces it. Cold start and forced refresh remain synchronous.
- Forced refresh is rate-limited to once per 30 seconds by default.
- Atomic snapshots and atomic `0600` disk writes avoid partial cache reads and writes.
- `--no-cache` skips cache loading; callers must use direct channel/user IDs.

## Remaining Work

1. Remove or expose the five-page `channels list` query scan bound without unbounded API cost.
2. Add Edge-compatible auth/provider support before implementing complete unreads, muted state,
   Slack Connect user search, or any `saved_*` command.
3. Keep `TOOLS` synchronized with upstream `pkg/server/server.go`; do not infer it from CLI registry.

## Architecture Boundary

- Main remains a standalone Bun CLI, not an MCP server.
- CLI commands use structured JSON and concise text output; upstream tools generally return MCP
  text/CSV or native image content.
- The two MCP-style resource URIs remain static CLI metadata rather than live MCP resources.
