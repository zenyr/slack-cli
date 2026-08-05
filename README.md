# slack

Bun-only monorepo CLI for Slack workflows. MCP-style resources + tools.

- Runtime: Bun (>=1.3.9)
- Version: 0.1.0
- Package: `@zenyr/slack-cli`

## Install

```bash
bun install
```

### Link globally

```bash
bun run link   # installs `slack` binary via bun link
slack --help
```

### Run without linking

```bash
bun start -- <command> [options]
# or
bun run --cwd=apps/cli src/main.ts <command> [options]
```

## Auth

Token priority (highest → lowest): env vars → persisted store.

### Environment variables

| Variable | Type | Description |
|---|---|---|
| `SLACK_MCP_XOXP_TOKEN` | `xoxp-...` | User token (preferred) |
| `SLACK_MCP_XOXB_TOKEN` | `xoxb-...` | Bot token |

> Note: `xoxc`/`xoxd` (edge) tokens are not supported. Unset them and use `xoxp`/`xoxb`.

### Persistent store (auth commands)

```bash
slack auth login --type <xoxp|xoxb> [--token <token>] [--json]
# or pipe via stdin:
printf '<token>' | slack auth login --type <xoxp|xoxb> [--json]

slack auth logout [--json]         # clear active session
slack auth use <xoxp|xoxb> [--json] # switch active token type
slack auth check [--json]          # verify session
slack auth whoami [--json]         # show identity (user, team, token type)
```

- `auth login`: Store Slack token (via --token or stdin) and activate selected type.
- `auth logout`: Clear active auth session.
- `auth use`: Switch active auth token type.
- `auth check`: Check current auth session status.
- `auth whoami`: Show active authenticated identity.

## Global Flags

| Flag | Alias | Description |
|---|---|---|
| `--xoxp` | | Force user token for this invocation |
| `--xoxb` | | Force bot token for this invocation |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |
| `--json` | | Structured JSON output (all commands) |
| `--` | | Stop flag parsing; remaining args treated as positionals |

Token selection defaults to environment/persisted auth unless a command has one of these schema policies:

- Explicit `--xoxp` or `--xoxb` required: `messages post`, `messages post-ephemeral`, `messages reply`, `reactions add`, `reactions remove`.
- Restricted to xoxp: `users status set`, `users status clear`, `messages search`, `messages unreads`, `messages mark`, `messages pin`.
- `--xoxp` and `--xoxb` are mutually exclusive. All other commands use the default token policy.

## Commands

### `slack help`

Show this help message.

---

### `slack schema [<command> [subcommand ...]] [--json]`

Show machine-readable command schema metadata for agents.

```bash
slack schema --json
slack schema messages post --json
```

---

### `slack version`

Print CLI version.

---

### `slack resources [--json]`

List available Slack MCP-style resources.

Resources:

| URI | Format | Description |
|---|---|---|
| `slack://<workspace>/channels` | `text/csv` | Channels, DMs, group DMs with basic metadata |
| `slack://<workspace>/users` | `text/csv` | Workspace users for lookups and context enrichment |

---

### `slack tools [--json]`

List referenced MCP tools from spec: the 22 tools in authoritative upstream `source/master@b88c0de`, in
`server.go` order. This is spec metadata, not a claim that every tool is an implemented CLI
command.

Tools: `conversations_history`, `conversations_replies`, `conversations_add_message`, `reactions_add`, `reactions_remove`, `attachment_get_data`, `conversations_search_messages`, `conversations_unreads`, `conversations_mark`, `conversations_leave`, `conversations_join`, `channels_list`, `channels_me`, `usergroups_list`, `usergroups_me`, `usergroups_create`, `usergroups_update`, `usergroups_users_update`, `users_search`, `saved_list`, `saved_update`, `saved_clear_completed`

The Edge-only `saved_*` tools require browser session tokens (`xoxc`/`xoxd`) upstream and are
not supported by this CLI. See `docs/feature-parity.md` for command mappings and remaining gaps.

---

### `slack batch`

```
slack batch "<command arg...>" ["<command arg...>" ...] [--stop-on-error[=<bool>]] [--fail-on-error[=<bool>]] [--json]
```

Run multiple commands in one process.

---

### `slack channels list`

```
slack channels list [--type <public|private|im|mpim>] [--sort <name|popularity>] [--query=<text>] [--query-targets=<name,topic,purpose>] [--limit <n>] [--cursor <cursor>] [--json]
```

List channels.

| Flag | Values | Description |
|---|---|---|
| `--type` | `public\|private\|im\|mpim` | Filter by channel type |
| `--sort` | `name\|popularity` | Sort order |
| `--query` | text | Case-insensitive substring filter |
| `--query-targets` | `name,topic,purpose` | Fields searched by `--query` (default: `name`) |
| `--limit` | `n` | Max results |
| `--cursor` | cursor string | Pagination cursor |

Query mode scans at most five Slack API pages before filtering. Results can therefore be partial
on very large workspaces.

---

### `slack channels me`

```
slack channels me [--type <public|private|im|mpim>] [--limit <n>] [--cursor <cursor>] [--json]
```

List channels you belong to. Defaults to public and private channels with a limit of 100. The
maximum limit is 999, and `--cursor` accepts the native Slack pagination cursor.

---

### `slack channels info`

```
slack channels info <channel-id|#name|name> [--json]
```

Get channel info by ID or name, including `#name` and bare-name forms.

---

### `slack channels search`

```
slack channels search <query> | --query=<text> [--type <public|private|im|mpim>] [--json]
```

Search channels by name. Supply the required query positionally or with `--query`.

---

### `slack channels join`

```
slack channels join <channel-id> [--json]
```

Join a channel (xoxp only). Slack permits this operation only with a user token.

---

### `slack channels leave`

```
slack channels leave <channel-id> [--json]
```

Leave a channel (xoxp only). Slack permits this operation only with a user token.

---

### `slack users list`

```
slack users list [<query>] [--cursor=<cursor>] [--limit=<n>] [--json]
```

List users. Optional positional `<query>` for filtering.

---

### `slack users get`

```
slack users get <user-id> [user-id ...] [--json]
```

Get users by ID (batch supported) in one call.

---

### `slack users search`

```
slack users search <query(required,non-empty)> [--cursor=<cursor>] [--limit=<n>] [--json]
```

Search users by required, non-empty query string. A Slack user ID beginning with `U` or `W`
(for example, `U07VCEPP4N5`) uses a direct `users.info` lookup instead of list filtering.

---

### `slack users status get`

```
slack users status get [user-id] [--json]
```

Get user status. Omit `[user-id]` to get the current user's status.

---

### `slack users status set`

```
slack users status set <emoji> <text> [--expiration=<30m|1h|2h|4h|today|unix-ts>] [--json]
```

Set user status (xoxp only) for the current user.

---

### `slack users status clear`

```
slack users status clear [--json]
```

Clear user status (xoxp only) for the current user.

---

### `slack attachment get`

```
slack attachment get <file-id> [--content[=<bool>]] [--save[=<bool>]] [--json]
```

Get attachment metadata, content, or saved file by file id. The command is disabled unless
`SLACK_MCP_ATTACHMENT_TOOL=true` (also accepts `1`/`yes`) or
`SLACK_MCP_ENABLED_TOOLS` contains `attachment_get_data`.

| Mode | Result |
|---|---|
| default | Metadata only; no content download |
| `--content` | Text MIME content with `encoding: "none"`; other MIME content as base64 with `encoding: "base64"` |
| `--save` | Binary download to a private temporary directory and randomized file path |

`--content` and `--save` are mutually exclusive. Downloads are limited to 5 MiB. Saved
directories use mode `0700` and files use `0600`. Treat returned text/base64 as untrusted Slack
content; base64 is transport encoding, not validation or executable content.

---

### `slack messages search`

```
slack messages search <query> [--channel <value>] [--im <value>] [--with <value>] [--user <value>] [--after <YYYY-MM-DD|1d|1w|30d|90d>] [--before <YYYY-MM-DD|1d|1w|30d|90d>] [--on <YYYY-MM-DD|1d|1w|30d|90d>] [--during <period>] [--threads] [--limit=<n>] [--cursor=<page>] [--json]
```

Search messages. Restricted to xoxp.

| Flag | Values | Description |
|---|---|---|
| `--channel` | channel ID | Filter by channel |
| `--im` | DM ID or name | Filter to a direct message |
| `--with` | user | Filter messages exchanged with a user |
| `--user` | user ID | Filter by user |
| `--after` | `YYYY-MM-DD\|1d\|1w\|30d\|90d` | Messages after date/duration |
| `--before` | `YYYY-MM-DD\|1d\|1w\|30d\|90d` | Messages before date/duration |
| `--on` | `YYYY-MM-DD\|1d\|1w\|30d\|90d` | Messages on date/duration |
| `--during` | period | Messages during a Slack search period |
| `--threads` | flag | Include thread replies |
| `--limit` | `n` | Max results |
| `--cursor` | page | Search result page cursor |

---

### `slack messages fetch`

```
slack messages fetch <message-url> [--thread[=<bool>]] [--resolve-users[=<bool>]] [--json]
```

Fetch message by permalink URL (optionally include thread). Use `--thread` to expand to the full thread.

| Flag | Description |
|---|---|
| `--thread` | Include full thread (default: false) |
| `--resolve-users` | Resolve user IDs to usernames/display names |

Use this command when input is a Slack message URL.

---

### `slack messages history`

```
slack messages history <channel-id> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--resolve-users[=<bool>]] [--json]
```

Fetch channel message history.

| Flag | Description |
|---|---|
| `--oldest` | Slack timestamp lower bound (`seconds.fraction`) |
| `--latest` | Slack timestamp upper bound |
| `--limit` | Max messages |
| `--cursor` | Pagination cursor |
| `--include-activity` | Include channel activity events |
| `--resolve-users` | Resolve user IDs to usernames/display names |

---

### `slack messages context`

```
slack messages context <message-url> [--before=<n>] [--after=<n>] [--resolve-users[=<bool>]] [--json]
```

Fetch messages surrounding a permalink. `--before` and `--after` control the number of nearby
messages; `--resolve-users` enriches user IDs.

---

### `slack messages post`

```
slack messages post <channel-id|#name|name> <text|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|-|@file>] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]
```

Post message to channel (payload text optional only with non-empty blocks; markdown auto-converted to mrkdwn).

| Flag | Description |
|---|---|
| `--thread-ts` | Reply in thread (`seconds.fraction`) |
| `--blocks` | Build Block Kit blocks from Markdown |
| `--payload` | Read request JSON, stdin (`-`), or a normalized artifact (`@file`) |
| `--payload-out` | With `--dry-run`, write the normalized request to a new file |
| `--dry-run` | Validate and print normalized request without posting |
| `--unfurl-links` | Unfurl links (bool: `true\|false\|1\|0\|yes\|no\|on\|off`) |
| `--unfurl-media` | Unfurl media |
| `--reply-broadcast` | Also send reply to channel |

This command requires an explicit `--xoxp` or `--xoxb`. `--payload` is an object-only input and
cannot be mixed with positional arguments; unknown fields are rejected. In payload mode, `text`
may be omitted only when `blocks` is a non-empty array. Positional/`--blocks` mode still requires
`<text|->` as the plaintext notification/accessibility fallback. Prefer the typed helpers in
`skill/blocks.ts`; when composing raw JSON manually, dry-run and inspect the normalized payload
before sending it.

**Channel post policy (env-based guard):**

| Variable | Format | Behavior |
|---|---|---|
| `SLACK_MCP_POST_CHANNEL_ALLOWLIST` | `C123,C456` | Only allow listed channel IDs |
| `SLACK_MCP_POST_CHANNEL_DENYLIST` | `C123,C456` | Block listed channel IDs |

> Channel IDs must match pattern `^[CGD][A-Z0-9]+$`. Invalid IDs in policy vars block all posts.

---

### `slack messages post-ephemeral`

```
slack messages post-ephemeral <channel-id> <user-id> <text|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json]
```

Post ephemeral message to channel user, visible only to `<user-id>` in `<channel-id>`. Requires an explicit
`--xoxp` or `--xoxb`. Payload mode requires `channel`, `user`, and non-empty `text`, and cannot be
mixed with positional arguments.

---

### `slack messages delete`

```
slack messages delete <message-url> [--json] OR <channel-id> <timestamp> [--json]
```

Delete message by URL or channel and timestamp.

---

### `slack messages update`

```
slack messages update <message-url> <text|-> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json] OR <channel-id> <timestamp> <text|-> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json]
```

Update message text by URL or channel and timestamp. Payload mode requires
`channel`, `ts`, and `text`; it cannot be mixed with positional arguments.

---

### `slack messages reply`

```
slack messages reply <channel-id|#name|name|permalink> <thread-ts> <text|-> [--blocks[=<json|bool|->]] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--reply-broadcast[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--json] OR <thread-permalink> <text|-> [--blocks[=<json|bool|->]] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--reply-broadcast[=<bool>]] [--json]
```

Reply to thread by channel+ts or thread permalink. Requires an explicit `--xoxp`
or `--xoxb`.

---

### `slack messages replies`

```
slack messages replies <channel-id(required,non-empty)> <thread-ts(required,non-empty)> OR <thread-permalink(required,non-empty)> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--resolve-users[=<bool>]] [--json]
```

Fetch full thread by channel+thread timestamp or thread permalink. Use `--include-activity`
for activity events and `--resolve-users` for user enrichment.

Use this command when you already know both `<channel-id>` and `<thread-ts>` and want thread messages directly.

Quick decision:

| Situation | Command |
|---|---|
| You have a Slack message URL | `slack messages fetch <message-url>` |
| You already have `channel-id` + `thread-ts` | `slack messages replies <channel-id> <thread-ts>` |

---

### `slack messages unreads`

```
slack messages unreads [--include-messages[=<bool>]] [--channel-types=<all|dm|group_dm|partner|internal>] [--max-channels=<n>] [--max-messages-per-channel=<n>] [--mentions-only[=<bool>]] [--include-muted[=<bool>]] [--json]
```

Get unread messages across channels (xoxp fallback mode). Restricted to xoxp.

---

### `slack messages mark`

```
slack messages mark <channel-id(required,non-empty)> [--ts=<timestamp>] [--json]
```

Mark a channel or DM as read (requires SLACK_MCP_MARK_TOOL=true). Restricted to xoxp.

---

### `slack messages pin`

```
slack messages pin <channel-id> <timestamp> [--json]
```

Pin a message. Restricted to xoxp.

---

### `slack messages unpin`

```
slack messages unpin <channel-id> <timestamp> [--json]
```

Unpin a message.

---

### `slack messages pins`

```
slack messages pins <channel-id> [--json]
```

List pinned messages in channel.

---

### `slack reactions add`

```
slack reactions add <channel-id> <timestamp> <emoji-name> [--json]
```

Add reaction emoji to message. `<emoji-name>` without colons (e.g. `thumbsup`). Requires an
explicit `--xoxp` or `--xoxb`.

---

### `slack reactions remove`

```
slack reactions remove <channel-id> <timestamp> <emoji-name> [--json]
```

Remove reaction emoji from message. Requires an explicit `--xoxp` or `--xoxb`.

---

### `slack reactions list`

```
slack reactions list <channel-id> <timestamp> [--json]
```

List reactions on a message.

---

### `slack views publish`

```
slack views publish <user-id(required,non-empty)> --view=<json|-> [--hash=<hash>] [--payload=<json|->] [--dry-run[=<bool>]] [--json]
```

Publish or update a user's App Home view. Payload mode accepts `user_id`, `view`, and optional
`hash`; it cannot be mixed with positional arguments or `--view`.

---

### `slack views clear`

```
slack views clear <user-id(required,non-empty)> [--dry-run[=<bool>]] [--json]
```

Clear a user's App Home view by publishing an empty Home view.

---

### `slack usergroups list`

```
slack usergroups list [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]
```

List user groups.

---

### `slack usergroups get`

```
slack usergroups get <usergroup-id> [usergroup-id ...] [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]
```

Get user groups by ID (batch supported).

---

### `slack usergroups create`

```
slack usergroups create <name(required,non-empty)> [--handle=<handle>] [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]
```

Create user group.

---

### `slack usergroups update`

```
slack usergroups update <usergroup-id(required,non-empty)> [--name=<name>] [--handle=<handle>] [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]
```

Update user group metadata.

---

### `slack usergroups users update`

```
slack usergroups users update <usergroup-id(required,non-empty)> <user-id(required,non-empty)> [user-id ...] --yes [--json]
```

Replace user group members. `--yes` required (destructive, confirms overwrite).

---

### `slack usergroups me list`

```
slack usergroups me list [--json]
```

List current user memberships in user groups.

---

### `slack usergroups me join`

```
slack usergroups me join <usergroup-id(required,non-empty)> [--json]
```

Join current user to a user group.

---

### `slack usergroups me leave`

```
slack usergroups me leave <usergroup-id(required,non-empty)> [--json]
```

Remove current user from a user group.

---

## JSON Output

All commands accept `--json`, but prefer plain text by default to reduce output/token size.

- Use default text mode for quick human checks.
- Use `--json` only for automation/parsing (e.g. `jq`), integrations, or deep debugging.

Output shape:

```json
{
  "ok": true,
  "command": "messages.post",
  "message": "human-readable summary",
  "data": { ... },
  "textLines": ["line1", "line2"]
}
```

Error shape:

```json
{
  "ok": false,
  "command": "messages.post",
  "error": "INVALID_ARGUMENT",
  "message": "error detail",
  "hint": "remediation hint"
}
```

Error codes: `INVALID_ARGUMENT`, `INTERNAL_ERROR`

## Project Layout

```
apps/
  cli/                    # CLI entrypoint (bin: slack → src/main.ts)
packages/
  commands/               # command registry, handlers, router, parse
  config/                 # shared COMMANDS/RESOURCES/TOOLS spec
  auth/                   # auth service, token store, types
```

## Dev Scripts

```bash
bun start              # run CLI (loads .env)
bun test               # run all tests (turbo)
bun run lint           # biome check + fix
bun run typecheck      # tsc across all packages
bun run link           # install global `slack` binary
bun run unlink         # remove global binary
```
