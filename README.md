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
slack auth login --type <xoxp|xoxb> --token <token>
# or pipe via stdin:
printf '<token>' | slack auth login --type <xoxp|xoxb>

slack auth logout                  # clear active session
slack auth use <xoxp|xoxb>        # switch active token type
slack auth check [--json]          # verify session
slack auth whoami [--json]         # show identity (user, team, token type)
```

## Global Flags

| Flag | Alias | Description |
|---|---|---|
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |
| `--json` | | Structured JSON output (all commands) |
| `--` | | Stop flag parsing; remaining args treated as positionals |

## Commands

### `slack help`

Show top-level help.

---

### `slack version`

Print CLI version.

---

### `slack resources [--json]`

List MCP-style resources.

Resources:

| URI | Format | Description |
|---|---|---|
| `slack://<workspace>/channels` | `text/csv` | Channels, DMs, group DMs with basic metadata |
| `slack://<workspace>/users` | `text/csv` | Workspace users for lookups and context enrichment |

---

### `slack tools [--json]`

List referenced MCP tools from spec.

Tools: `conversations_history`, `conversations_replies`, `conversations_add_message`, `conversations_search_messages`, `channels_list`, `reactions_add`, `reactions_remove`, `attachment_get_data`, `users_search`, `usergroups_list`, `usergroups_create`, `usergroups_update`, `usergroups_users_update`, `usergroups_me`

---

### `slack channels list`

```
slack channels list [--type <public|private|im|mpim>] [--sort <name|popularity>] [--limit <n>] [--cursor <cursor>] [--json]
```

List channels.

| Flag | Values | Description |
|---|---|---|
| `--type` | `public\|private\|im\|mpim` | Filter by channel type |
| `--sort` | `name\|popularity` | Sort order |
| `--limit` | `n` | Max results |
| `--cursor` | cursor string | Pagination cursor |

---

### `slack users list`

```
slack users list [<query>] [--cursor=<cursor>] [--limit=<n>] [--json]
```

List users. Optional positional `<query>` for filtering.

---

### `slack users search`

```
slack users search [<query>] [--cursor=<cursor>] [--limit=<n>] [--json]
```

Search users by query string.

---

### `slack attachment get`

```
slack attachment get <file-id> [--json]
```

Get attachment metadata by file ID.

---

### `slack messages search`

```
slack messages search <query> [--channel <value>] [--user <value>] [--after <date>] [--before <date>] [--threads] [--json]
```

Search messages.

| Flag | Values | Description |
|---|---|---|
| `--channel` | channel ID | Filter by channel |
| `--user` | user ID | Filter by user |
| `--after` | `YYYY-MM-DD\|1d\|1w\|30d\|90d` | Messages after date/duration |
| `--before` | `YYYY-MM-DD\|1d\|1w\|30d\|90d` | Messages before date/duration |
| `--threads` | flag | Include thread replies |

---

### `slack messages fetch`

```
slack messages fetch <message-url> [--thread[=<bool>]] [--json]
```

Fetch one message or full thread from permalink.

| Flag | Description |
|---|---|
| `--thread` | Include full thread (default: false) |

---

### `slack messages history`

```
slack messages history <channel-id> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--json]
```

Fetch channel message history.

| Flag | Description |
|---|---|
| `--oldest` | Slack timestamp lower bound (`seconds.fraction`) |
| `--latest` | Slack timestamp upper bound |
| `--limit` | Max messages |
| `--cursor` | Pagination cursor |
| `--include-activity` | Include channel activity events |

---

### `slack messages post`

```
slack messages post <channel-id> <text> [--thread-ts=<ts>] [--blocks[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]
```

Post plain text message to channel. Markdown is auto-converted to Slack mrkdwn.

| Flag | Description |
|---|---|
| `--thread-ts` | Reply in thread (`seconds.fraction`) |
| `--blocks` | Build Block Kit blocks from Markdown |
| `--unfurl-links` | Unfurl links (bool: `true\|false\|1\|0\|yes\|no\|on\|off`) |
| `--unfurl-media` | Unfurl media |
| `--reply-broadcast` | Also send reply to channel |

**Channel post policy (env-based guard):**

| Variable | Format | Behavior |
|---|---|---|
| `SLACK_MCP_POST_CHANNEL_ALLOWLIST` | `C123,C456` | Only allow listed channel IDs |
| `SLACK_MCP_POST_CHANNEL_DENYLIST` | `C123,C456` | Block listed channel IDs |

> Channel IDs must match pattern `^[CGD][A-Z0-9]+$`. Invalid IDs in policy vars block all posts.

---

### `slack messages post-ephemeral`

```
slack messages post-ephemeral <channel-id> <user-id> <text> [--thread-ts=<ts>] [--json]
```

Post ephemeral message visible only to `<user-id>` in `<channel-id>`.

---

### `slack messages delete`

```
slack messages delete <message-url> [--json]
slack messages delete <channel-id> <timestamp> [--json]
```

Delete message by permalink URL or by channel ID + Slack timestamp.

---

### `slack messages update`

```
slack messages update <message-url> <text> [--json]
slack messages update <channel-id> <timestamp> <text> [--json]
```

Update message text by permalink URL or by channel ID + Slack timestamp.

---

### `slack messages replies`

```
slack messages replies <channel-id> <thread-ts> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--json]
```

Fetch thread message replies.

---

### `slack reactions add`

```
slack reactions add <channel-id> <timestamp> <emoji-name> [--json]
```

Add reaction emoji to message. `<emoji-name>` without colons (e.g. `thumbsup`).

---

### `slack reactions remove`

```
slack reactions remove <channel-id> <timestamp> <emoji-name> [--json]
```

Remove reaction emoji from message.

---

### `slack usergroups list`

```
slack usergroups list [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]
```

List user groups.

---

### `slack usergroups create`

```
slack usergroups create <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]
```

Create user group.

---

### `slack usergroups update`

```
slack usergroups update <usergroup-id> <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]
```

Update user group metadata.

---

### `slack usergroups users update`

```
slack usergroups users update <usergroup-id> <user-id> [user-id ...] --yes [--json]
```

Replace user group members. `--yes` required (destructive, confirms overwrite).

---

### `slack usergroups me list`

```
slack usergroups me list [--json]
```

List current user's user group memberships.

---

### `slack usergroups me join`

```
slack usergroups me join <usergroup-id> [--json]
```

Join current user to a user group.

---

### `slack usergroups me leave`

```
slack usergroups me leave <usergroup-id> [--json]
```

Remove current user from a user group.

---

## JSON Output

All commands accept `--json`. Output shape:

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
