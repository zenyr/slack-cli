# Feature Parity Tracker

Progressive migration: **org Go MCP Server** → **main Bun CLI**

Maturity ladder: `unicycle → bicycle → motorcycle → car`

**Org baseline**: 14 MCP tools + 2 resources, fully implemented Go server (worktree-org `original` branch)

---

## ✅ Implemented in Main CLI

### Core Infrastructure
- [x] CLI entry point with Bun runtime
- [x] Strategy pattern command registry (extensible)
- [x] Argument parser (flags: --help, --version, --json)
- [x] Output renderer (text/JSON switchable)
- [x] Error handling (tagged unions, CliResult type-safe errors)
- [x] Auth service (token storage via Bun.file, env fallback chain)
- [x] Auth layer (dependency injection for testability)

### Commands - Auth (5 commands)
- [x] `auth check` - verify session via auth.test
- [x] `auth whoami` - show active identity
- [x] `auth login` - store xoxp/xoxb token
- [x] `auth logout` - clear active session
- [x] `auth use` - switch between xoxp/xoxb

### Commands - Slack API (3 commands)
- [x] `channels list` - list workspace channels
  - **Org equiv**: `channels_list` tool
  - **Status**: Full parity for current scope (type filtering, popularity sort, cursor pagination)
  
- [x] `users list` - list workspace users  
  - **Org equiv**: Partial coverage of `users_search` tool
  - **Status**: Query/search semantics implemented (name/real_name/display_name/email)
  - **Gap**: Edge API integration for Slack Connect users (xoxc/xoxd) deferred
  
- [x] `messages search` - search messages workspace-wide
  - **Org equiv**: `conversations_search_messages` tool
  - **Status**: Multi-filter implemented (`--channel`, `--user`, `--after`, `--before`, `--threads`)
  - **Gap**: Flexible date parsing and URL extraction remain deferred

- [x] `messages history` - fetch channel history with pagination
  - **Org equiv**: `conversations_history` tool
  - **Status**: Base implementation shipped (`--limit`, `--oldest`, `--latest`, `--cursor`)
  - **Gap**: Time-range expressions (`1d/1w/30d`), `#channel` resolution, activity message controls deferred

### Utilities (4 commands)
- [x] `help` - CLI/namespace help
- [x] `version` - print version
- [x] `resources` - list MCP-style resource URIs (static list)
- [x] `tools` - list MCP tool names (static list)

**Main CLI Maturity**: 🚲+ **Bicycle Extended** (auth + read APIs with major filter/pagination parity)

---

## 🚧 In Progress Boundary

### Priority 0: Complete Bicycle Boundary

#### 1. `messages history` - Complete Remaining Parity Gaps
- **Current state**: Base command implemented with pagination flags
- **Remaining work**:
  - Add time-range expressions (`1d/1w/30d/90d`)
  - Add dynamic channel resolution (`#general` -> channel ID)
  - Add optional activity message inclusion controls

#### 2. `messages replies` - Add Thread Replies Command
- **Current state**: Missing
- **Remaining work**:
  - Add `conversations.replies` client + handler
  - Support thread_ts + cursor pagination
  - Add tests and CLI/config registration

---

## ❌ Not Implemented

### Org Tool Coverage

| Org Tool (14 total)              | Main CLI Status | Priority | Complexity |
|----------------------------------|-----------------|----------|------------|
| `conversations_history`            | ⚠️ Partial      | **P0**   | Medium     |
| `conversations_replies`            | ❌ Missing       | **P1**   | Medium     |
| `conversations_add_message`        | ❌ Missing       | **P1**   | High       |
| `conversations_search_messages`    | ⚠️ Partial      | **P0**   | Low        |
| `channels_list`                    | ✅ Implemented   | **P0**   | Low        |
| `reactions_add`                    | ❌ Missing       | P2       | Low        |
| `reactions_remove`                 | ❌ Missing       | P2       | Low        |
| `attachment_get_data`              | ❌ Missing       | P3       | Medium     |
| `users_search`                     | ⚠️ Partial      | **P0**   | Low        |
| `usergroups_list`                  | ❌ Missing       | P2       | Low        |
| `usergroups_create`                | ❌ Missing       | P2       | Medium     |
| `usergroups_update`                | ❌ Missing       | P2       | Medium     |
| `usergroups_users_update`          | ❌ Missing       | P2       | Medium     |
| `usergroups_me`                    | ❌ Missing       | P3       | High       |

**Summary**: 2 implemented, 2 partial, 10 missing

---

### Priority 0 (Current Iteration) - Complete Bicycle+

#### `messages history` Command
- **Org tool**: `conversations_history`
- **Slack API**: `conversations.history`
- **Required features**:
  - Fetch channel/DM messages with chronological order (newest first)
  - Cursor-based pagination (oldest, latest, cursor params)
  - Time-range expressions (1d/1w/30d/90d) or numeric limit
  - Optional activity messages inclusion
  - Dynamic channel resolution (#general → ID lookup)
- **Dependencies**: Requires channel cache for # resolution (not in main yet)
- **Complexity**: Medium (pagination + time parsing + channel resolution)
- **Delivered in merge set**:
  - Slack history types + `conversations.history` client call
  - `messages history` handler with cursor/limit/oldest/latest
  - command wiring + dedicated tests
- **Next smallest unit**: Add time expression parser + `#channel` resolution

#### `messages replies` Command  
- **Org tool**: `conversations_replies`
- **Slack API**: `conversations.replies`
- **Required features**:
  - Fetch thread messages by channel_id + thread_ts
  - Cursor-based pagination
- **Dependencies**: Requires message history foundation for message identification
- **Complexity**: Medium (thread_ts discovery, pagination)
- **Smallest unit**: Add conversations.replies client after history types exist

---

### Priority 1 - Motorcycle (Write APIs + Threads)

#### `messages post` Command
- **Org tool**: `conversations_add_message`
- **Slack API**: `chat.postMessage`
- **Required features**:
  - Post message to channel/thread
  - Markdown→Slack blocks conversion
  - Optional thread_ts for threading
  - Channel whitelist/blacklist policy (env-based)
  - Auto mark-read option (env-based)
  - Unfurling control
- **Dependencies**: Channel resolution, markdown parser
- **Complexity**: High (blocks conversion, policy enforcement, multi-step)
- **Smallest unit**: Basic postMessage without markdown/policy (plain text only)

#### `reactions add/remove` Commands
- **Org tools**: `reactions_add`, `reactions_remove`
- **Slack API**: `reactions.add`, `reactions.remove`
- **Required features**:
  - Add/remove emoji reaction to message
  - Channel policy enforcement (whitelist/blacklist)
  - Message identification (channel + timestamp)
- **Dependencies**: Message lookup, channel resolution
- **Complexity**: Low (simple API calls + policy check)
- **Smallest unit**: reactions add without policy enforcement

---

### Priority 2 - Motorcycle+ (Usergroups)

#### `usergroups list` Command
- **Org tool**: `usergroups_list`
- **Slack API**: `usergroups.list`
- **Required features**:
  - List all user groups
  - Optional include_users/include_disabled/include_count flags
- **Complexity**: Low (direct API wrapper)
- **Smallest unit**: Basic list without optional flags

#### `usergroups create/update` Commands
- **Org tools**: `usergroups_create`, `usergroups_update`
- **Slack API**: `usergroups.create`, `usergroups.update`
- **Required features**:
  - Create: name, handle, desc, default channels
  - Update: modify metadata (no member changes)
- **Complexity**: Medium (input validation, channel ID resolution)
- **Smallest unit**: create with minimal fields (name + handle only)

#### `usergroups users update` Command
- **Org tool**: `usergroups_users_update`
- **Slack API**: `usergroups.users.update`
- **Required features**:
  - Replace entire member list (destructive operation)
- **Complexity**: Medium (safety guards needed)
- **Smallest unit**: Direct member replacement with confirmation

#### `usergroups me` Command (Multi-step)
- **Org tool**: `usergroups_me`
- **Slack API**: `auth.test` + `usergroups.list` + `usergroups.users.list` + `usergroups.users.update`
- **Required features**:
  - Three actions: list (groups I'm in), join (add me), leave (remove me)
  - Multi-step flow: fetch current members → modify → update
- **Complexity**: High (multi-step workflow, member list manipulation)
- **Smallest unit**: list action only (no join/leave)

---

### Priority 3 - Car (Advanced Features)

#### `attachment get` Command
- **Org tool**: `attachment_get_data`
- **Slack API**: `files.info` + `files.sharedPublicURL` or direct download
- **Required features**:
  - Download file by file_id (5MB limit enforced)
  - Text vs binary base64 encoding (MIME detection)
  - Env guard (SLACK_MCP_ATTACHMENT_TOOL)
- **Complexity**: Medium (file download, encoding, size limits)
- **Smallest unit**: file.info metadata fetch only (no download)

#### Cache Layer (Infrastructure)
- **Org features**:
  - Atomic pointer snapshots for lock-free reads
  - TTL-based expiry (file mtime, default 1h)
  - Forced refresh rate limiting (30s min interval)
  - TeamID-prefixed cache files for multi-workspace
  - On-miss cache refresh for channel resolution
- **Required for**:
  - Dynamic channel resolution (#general → ID)
  - User search performance
  - Multi-workspace support
- **Complexity**: High (concurrency, TTL, invalidation)
- **Smallest unit**: In-memory channel map cache (no persistence)

#### Rate Limiting (Infrastructure)
- **Org features**:
  - Tiered token bucket (Tier2: 3s/3 burst, Tier3: 1.2s/4)
  - Applied to conversations.history pagination
  - Prevents Slack API quota exhaustion
- **Complexity**: Medium (token bucket algo, tier detection)
- **Smallest unit**: Simple global rate limiter (no tiers)

#### MCP Server Mode (Architecture Shift)
- **Org architecture**:
  - Persistent stdio/SSE/HTTP transports
  - MCP protocol (initialize → tool calls → shutdown)
  - Tool registration with metadata (descriptions, schemas)
  - Error-to-result middleware (no protocol crashes)
- **Required for**:
  - MCP client integration (Claude Desktop, etc.)
  - Persistent session management
- **Complexity**: Very High (protocol impl, transport layer, lifecycle)
- **Smallest unit**: stdio transport with single tool (echo)

#### Enterprise Grid Support
- **Org features**:
  - xoxc/xoxd token detection (session cookies)
  - Edge API client with custom TLS fingerprinting
  - Slack Connect user merge (ClientUserBoot + GetUsersInfo)
  - Multi-org workspace scoping
- **Complexity**: Very High (auth multi-tenancy, TLS mimicry, edge APIs)
- **Smallest unit**: xoxc token detection + auth.test validation

---

## 📊 Parity Summary

| Category                     | Main CLI | Org Server | Gap  |
|------------------------------|----------|------------|------|
| **Core Infrastructure**      | 7        | N/A        | N/A  |
| **Auth Commands**            | 5        | N/A        | N/A  |
| **Conversation Tools**       | 1        | 8          | -7   |
| **Channel Tools**            | 1        | 1          | 0    |
| **User Tools**               | 1        | 1          | 0    |
| **Usergroup Tools**          | 0        | 5          | -5   |
| **Utilities**                | 4        | N/A        | N/A  |
| **MCP Resources**            | 0 (stub) | 2          | -2   |
| **Advanced Infra**           | 0        | 5          | -5   |
| **Total Org-Equivalent Tools** | **3** (partial) | **14** (full) | **79% gap** |

**Current maturity**: 🚲+ **Bicycle Extended**

**Next milestone**: 🚲++ **Bicycle Complete** (finish history gaps + add replies)

**Future milestones**: 
- 🏍️ **Motorcycle**: Write APIs (post, reactions) + threads
- 🚗 **Car**: Usergroups, cache, rate limiting, MCP server mode, Enterprise Grid

---

## Iteration Strategy

### Iteration 1 (Completed Merge Set) - Bicycle Extension 🚲+

**Goal**: Deliver high-impact parity on existing read APIs and ship base history command

**Units** (priority order):
1. **Complete `channels list`** - Add type filter + sort + pagination (P0, low complexity)
2. **Complete `users search`** - Add query filtering (P0, low complexity)
3. **Complete `messages search`** - Add multi-filter + date parsing (P0, low complexity)
4. **Add `messages history`** - New command with pagination (P0, medium complexity) ✅
5. **Add `messages replies`** - Thread support (P1, medium complexity) ⏳

**Scope boundary**: Read-only APIs, no write operations, no cache layer yet (inline channel lookup acceptable)

**Delivered**:
- `channels list` parity features merged
- `users list` query semantics merged
- `messages search` multi-filter support merged
- `messages history` base command merged
- merged-main validation passed (`typecheck` + targeted suites)

---

### Iteration 2 - Motorcycle 🏍️ (Write APIs)

**Goal**: Enable write operations (post messages, reactions)

**Units**:
1. `messages post` - Basic plain text posting (no markdown yet)
2. `messages post` - Add markdown→blocks conversion
3. `messages post` - Add channel policy enforcement
4. `reactions add` - Add reaction support
5. `reactions remove` - Remove reaction support

**Dependencies**: Channel resolution (can use inline API calls, cache not required yet)

---

### Iteration 3 - Motorcycle+ 🏍️+ (Usergroups)

**Goal**: Add usergroup management commands

**Units**:
1. `usergroups list` - Read-only listing
2. `usergroups create` - Create with minimal fields
3. `usergroups update` - Update metadata
4. `usergroups users update` - Replace members
5. `usergroups me` - List/join/leave (multi-step)

---

### Iteration 4+ - Car 🚗 (Advanced Infrastructure)

**Goal**: Production-grade features (cache, rate limiting, MCP mode)

**Units** (order TBD):
1. Cache layer (in-memory first, then persistence)
2. Rate limiting (global first, then tiered)
3. `attachment get` command
4. MCP server mode (stdio transport)
5. Enterprise Grid support (xoxc/xoxd tokens)

---

## Design Principles

1. **Progressive capability**: Each iteration delivers usable CLI commands, not scaffolding
2. **CLI-first**: Main builds standalone CLI, not MCP server (defer server mode to Iteration 4+)
3. **Defer complexity**: No cache/rate-limit until Iteration 4 (inline API calls acceptable for now)
4. **Type safety**: No `!`, no `as`, const function expressions (per AGENTS.md)
5. **Test-driven**: Every new command requires handler + client + integration tests
6. **Smallest units**: Break complex tools (post, usergroups_me) into 2-3 atomic units

---

## Notes

- **Org reference**: `worktree-org` branch `original` (commit 6ddc828)
- **Main baseline**: `main` branch (current)
- **Go→TypeScript translation**: Not line-by-line port, adapt patterns to Bun/TS idioms
- **Cache deferral**: Inline channel/user lookups acceptable until Iteration 4 (perf cost known, accepted)
