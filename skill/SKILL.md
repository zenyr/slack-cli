---
name: slack
description: Unified Slack skill for lookup, auth, Block Kit composition, dry-run, and message delivery via local Slack CLI
---

# Slack CLI skill (local)

## Runtime

- Binary: global `slack` command.
- Introspection first: prefer `slack schema <command...> --json` when command capability/flags are unclear.
- Mutation safety: typed `send*` helpers send once after local validation; raw CLI writes a dry-run payload artifact and sends that artifact.
- Raw payload path: prefer `--payload=<json|->` for agent-generated message mutations over long bespoke flag chains.

## Auth

- Token resolve order: env `SLACK_MCP_XOXP_TOKEN` → env `SLACK_MCP_XOXB_TOKEN` → persisted store (active).
- `xoxc`/`xoxd` unsupported.
- Default: autoselect. use `--xoxp`/`--xoxb` only on target command invocation.
- **`post`/`post-ephemeral`/`reply` require explicit `--xoxp` or `--xoxb`.** Omitting throws `MISSING_ARGUMENT`.
- `auth login` uses `--type <xoxp|xoxb>`; `auth use` uses positional `<xoxp|xoxb>`.
- Common mistake: `slack auth login --xoxb` -> `slack auth login --type xoxb --token <token>` or `slack auth use xoxb`.

## User context

- Owner: `<user-id>`
- Bot: `<bot-user-id>`
- Test channel: `<test-channel-id>`
- If user says only "테스트 채널", use `<test-channel-id>`
- "테스트해줘" / "test it" → post-ephemeral to test channel for owner. e.g.:
  `slack messages post-ephemeral <test-channel-id> <user-id> <text> --xoxp [--blocks=...]`
- Ephemeral target default: resolve with `slack auth whoami --json`; fall back to owner id only if identity is already known and unchanged

```sh
slack auth login --type <xoxp|xoxb> --token <token>
printf '<token>' | slack auth login --type <xoxp|xoxb>
slack auth use <xoxp|xoxb>
slack auth whoami
slack auth check
slack auth logout
```

## Global flags

```sh
--xoxp        force user token (xoxp) for this invocation
--xoxb        force bot token (xoxb) for this invocation
--json        structured JSON output
--help / -h
--version / -v
```

- `--xoxp` and `--xoxb` are mutually exclusive.
- Some commands are xoxp-only (`messages search`, `users status set/clear`) — using `--xoxb` with them throws immediately.

## ID lookup (before mutations)

```sh
slack channels list --json | jq '.data[] | {id,name}'
slack channels search <query> --json | jq '.data[] | {id,name}'
slack users search <query> --json | jq '.data[] | {id,name}'
slack usergroups list --json | jq '.data[] | {id,handle}'
```

## Channels

```sh
slack channels list [--type <public|private|im|mpim>] [--sort <name|popularity>] [--limit <n>] [--cursor <cursor>]
slack channels info <channel-id>
slack channels search <query> [--type <public|private|im|mpim>]
slack channels join <channel-id>
slack channels leave <channel-id>
```

## Messages (selection rule)

- `messages fetch <url>`: permalink input. one msg by default. add `--thread` for full thread.
- `messages replies <channel-id> <thread-ts>`: already have channel+thread ts.
- `messages context <url>`: nearby msgs around permalink.

### posting target resolution

- Slack URL `https://...slack.com/archives/C...` -> extract channel id from URL
- Thread reply/update and ts missing -> inspect recent msgs first, then ask user only if still ambiguous:

```sh
slack messages history <channel-id> --limit=5 --json
slack messages replies <channel-id> <thread-ts> --json
```

```sh
slack messages search <query(required,non-empty)> [--channel <id>] [--user <uid>] [--after <YYYY-MM-DD|1d|1w|30d|90d>] [--before <...>] [--threads]
slack messages fetch <message-url> [--thread] [--resolve-users]
slack messages history <channel-id> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--resolve-users]
slack messages context <message-url> [--before=<n>] [--after=<n>] [--resolve-users]
slack messages replies <channel-id> <thread-ts> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--resolve-users]
```

## Block Kit

- Slack message compose/send/update/reply/post-ephemeral 작업 전 → load `slack-blocks` skill for block schema, limits, recipes
- `--blocks` 사용 시 (post/post-ephemeral/reply/update) → `slack-blocks` 필수
- section `expand:true` → prevents "See more" truncation in thread view
- `./skill/blocks.ts` `b.section()` / `b.sectionFields()` set `expand:true` by default (override with `{ expand: false }` if needed)
- plan/task_card: AI step-by-step UI. plan 1개 = 메시지 1개 (다른 plan/task_card와 혼용 불가, 일반 블록과는 혼용 가능)
- plan 내 `in_progress` task가 있으면 타이틀에 스피너 표시, 전부 `complete`면 체크마크로 변경
- `b.plan()` shorthand: `{ id, title, status }` → 자동으로 `{ type: "task_card", task_id, ... }` 변환
- status alias 자동 보정: `completed`→`complete`, `done`→`complete`, `running`→`in_progress`, `failed`→`error`
- task_card `details`/`output`: rich_text 블록. `rich_text_list`로 하위 항목 표현 가능
- task_card `sources`: `[{ type: "url", url, text }]` 배열로 참조 링크 표시

```ts
// plan + shorthand (id→task_id, completed→complete 자동 보정)
b.plan("릴리즈 플랜", [
  { id: "t1", title: "기획", status: "completed" },
  { id: "t2", title: "구현", status: "running", details: rt("진행 중..."), output: rt("2/3 완료") },
  { id: "t3", title: "QA", status: "pending" },
])
// rt helper: (text) => ({ type:"rich_text", elements:[{type:"rich_text_section",elements:[{type:"text",text}]}] })

// taskCard 단독 (plan 밖에서 사용 불가 — plan.tasks 안에서만)
b.taskCard("t1", "제목", "complete", { output: rt("결과"), sources: [{ type:"url", url:"https://...", text:"링크" }] })
```
- posting style default:
  - context block for top/bottom metadata
  - section block for main content
  - divider between context and body when body is substantial
  - prefer `section + fmt.bold(...)` over `header` block unless strong title hierarchy is needed

### blocks.ts — typed builder (**strongly preferred**; use raw CLI only as last resort)

`./skill/blocks.ts` — `@slack/types` 기반 typed helpers.

```bash
# bun --cwd 사용 — workdir 별도 승인 불필요
bun --cwd <repo-root> -e "$(cat <<'EOF'
import { b, el, fmt, blocks, inspectSchema, sendPost, runMain } from "./skill/blocks.ts";

runMain(async () => {
  const schema = await inspectSchema(["messages", "post"]);
  const payload = blocks([
    b.header("제목"),
    b.section(`${fmt.bold("굵게")}텍스트`),
    b.actions([el.button("확인", "btn_ok", { style: "primary" })]),
  ]);

  if (!schema.data) throw new Error("schema unavailable");

  const result = await sendPost(payload, { channel: "<channel-id-or-name>" }, { token: "xoxp" });
  if (!result.ts || !result.channel) throw new Error("post coordinates unavailable");
});
EOF
)"
# send* helper 실패 → slack CLI exit code 그대로 process.exit
# 기본: `--json` 포함, 결과 JSON이면 `result.data`에 파싱됨
# dryRun:true → Slack API side effect 없이 preview
# pipe 불필요 — send* helper가 직접 slack CLI 실행
```

`send*` helper는 mode 인자 없음. 함수명으로 의도 고정 + target shape 검증:

| helper                 | target 필수 필드       | 동작                     |
| ---------------------- | ---------------------- | ------------------------ |
| `sendPost`             | `channel`              | 채널에 새 메시지         |
| `sendEphemeralPost`    | `channel`, `user`      | 본인에게만 보이는 메시지 |
| `sendReply`            | `channel`, `replyTs`   | 스레드 댓글              |
| `sendEphemeralReply`   | `channel`, `replyTs`, `user` | 스레드 내 ephemeral |
| `sendUpdate`           | `channel`, `updateTs`  | 기존 메시지 수정         |

- helper transport:
  - `token`: `xoxp | xoxb`
  - `dryRun?`: preview only, no mutation
  - `json?`: default `true`; `sendPost`/`sendReply` always keep JSON enabled so coordinates are available
- helper internals:
  - uses CLI `--payload=<json>` path, not fragile positional/`--blocks` composition
  - validates channel/user/ts before spawn
  - parses JSON stdout into `result.data` when possible
  - `sendPost`/`sendReply` success exposes `result.channel` and `result.ts`; full CLI envelope remains at `result.data`
  - type-checked builder calls do not need a preceding dry-run; call once after payload approval
- helper-adjacent utilities:
  - `payload(...)`: normalize `{ text, blocks, attachments }` for direct CLI handoff
  - `inspectSchema([...])`: call `slack schema ... --json` before mutation when unsure

Exports: `b` (blocks), `el` (elements), `txt` (text objects), `fmt` (mrkdwn format), `blocks` (payload assembler), `payload`, `inspectSchema`, `createSendHelpers`, `sendPost`, `sendReply`, `sendUpdate`, `sendEphemeralPost`, `sendEphemeralReply`, `runMain`

- `blocks()` 2nd arg: `{ text?: string }` — push notification / accessibility 용 plaintext 요약
  - 4+ sections 등 rich 메시지: `blocks([...], { text: "한줄 요약" })` 필수 — auto-derive 는 content dump 되어 push 에서 읽기 불편
  - 1-2 sections 간단한 메시지: 생략 OK, auto-derive 충분

### agent-first send pattern

```ts
import { blocks, b, inspectSchema, sendUpdate } from "./skill/blocks.ts";

await inspectSchema(["messages", "update"]);

const message = blocks([
  b.header("배포 상태"),
  b.section("정상 배포되었습니다."),
]);

await sendUpdate(
  message,
  { channel: "<test-channel-id>", updateTs: "1712345678.123456" },
  { token: "xoxb" },
);
```

### posting recipes

#### new post

```bash
bun --cwd <repo-root> -e "$(cat <<'EOF'
import { b, fmt, blocks, sendPost, runMain } from "./skill/blocks.ts";

runMain(async () => {
  const message = blocks([
    b.section(fmt.bold("제목")),
    b.context(["맥락 설명"]),
    b.divider(),
    b.section(fmt.bold("항목") + "\n- 내용1\n- 내용2"),
    b.context(["하단 요약"]),
  ]);

  const posted = await sendPost(message, { channel: "<channel-id-or-name>" }, { token: "xoxp" });
  if (!posted.ts) throw new Error("posted ts unavailable");
});
EOF
)"
```

#### rich/long post (4+ sections — text hint 필수)

```ts
const message = blocks([
  b.header("주간 배포 리포트"),
  b.context(["2026-05-04 — production"]),
  b.divider(),
  b.section(fmt.bold("요약") + "\n42건 배포, 실패 0건"),
  b.section(fmt.bold("상세") + "\n..."),
  b.section(fmt.bold("후속 조치") + "\n..."),
], { text: "주간 배포 리포트 — 42건 배포, 실패 0건" });
```

#### thread reply

```bash
bun --cwd <repo-root> -e "$(cat <<'EOF'
import { b, blocks, sendReply, runMain } from "./skill/blocks.ts";

runMain(async () => {
  const message = blocks([b.section("답글 본문")]);
  await sendReply(message, { channel: "<test-channel-id>", replyTs: "1712345678.123456" }, { token: "xoxp" });
});
EOF
)"
```

#### ephemeral post

```bash
slack auth whoami --json

bun --cwd <repo-root> -e "$(cat <<'EOF'
import { b, blocks, sendEphemeralPost, runMain } from "./skill/blocks.ts";

runMain(async () => {
  const message = blocks([b.section("본인에게만 보이는 테스트 메시지")]);
  await sendEphemeralPost(message, { channel: "<test-channel-id>", user: "<user-id>" }, { token: "xoxp" });
});
EOF
)"
```

#### update existing message

```bash
slack messages history <test-channel-id> --limit=5 --json

bun --cwd <repo-root> -e "$(cat <<'EOF'
import { b, blocks, sendUpdate, runMain } from "./skill/blocks.ts";

runMain(async () => {
  const message = blocks([b.section("수정된 본문")]);
  await sendUpdate(message, { channel: "<test-channel-id>", updateTs: "1712345678.123456" }, { token: "xoxp" });
});
EOF
)"
```

### native table builder

`./skill/blocks.ts` now supports `b.table(headers, rows, opts?)` for native Slack table blocks.

```ts
import { b, blocks } from "./skill/blocks.ts";

const message = blocks([
  b.header("배치 결과"),
  b.table(
    ["Job", "Status", "Duration"],
    [
      ["sync-users", "ok", "14s"],
      ["sync-billing", "warn", "41s"],
    ],
    {
      column_settings: [
        { align: "left", is_wrapped: true },
        { align: "center" },
        { align: "right" },
      ],
    },
  ),
]);
```

- plain cells use Slack native `raw_text`
- cells containing simple inline markdown become `rich_text` cells; links like `[label](https://example.com)` are supported
- empty cells are auto-padded with `\u200B`
- max 20 columns; max 100 rows incl header
- multiple `b.table(...)` calls can be included in the same `blocks([...])` message payload; each call emits one Slack `table` block
- use raw CLI `--payload` only if builder unavailable or exact low-level payload control is required

### CJK mrkdwn workaround

Slack mrkdwn closing delimiters (`*` `_` `~` `` ` ``) followed immediately by CJK chars (no whitespace) break rendering — delimiter treated as literal text.

- `*bold*한글` → literal `*bold*한글` ✗
- `_italic_한글` → literal `_italic_한글` ✗
- `~strike~한글` → literal `~strike~한글` ✗

**Fix:** raw mrkdwn string only → append ZWSP (`\u200B`) after every closing delimiter. `fmt.*` helper path already does this; do NOT add extra ZWSP on top.

- `*bold*\u200B한글` → **bold**한글 ✓

Tested working: ZWSP `\u200B`, ZWNJ `\u200C`, ZWJ `\u200D`, Word Joiner `\u2060`. Prefer ZWSP.
NOT working: Soft Hyphen `\u00AD`.

**Preferred:** use `fmt.*` helpers from `./skill/blocks.ts` — ZWSP auto-applied once:

```ts
import { fmt, b, el, txt, blocks } from "./skill/blocks.ts";
fmt.bold("굵게"); // → *굵게*\u200B
fmt.italic("기울임"); // → _기울임_\u200B
fmt.strike("취소선"); // → ~취소선~\u200B
fmt.code("코드"); // → `코드`\u200B
```

Raw bun fallback (no blocks.ts):

```sh
bun -e "
const z = '\u200B';
console.log(JSON.stringify([
  {type:'section',text:{type:'mrkdwn',text:\`*굵게*\${z}한글 _기울임_\${z}텍스트\`}}
]));
"
```

## Context block inline images (placehold.co)

Slack context block `image` element only accepts `https://` URLs returning raster images (PNG/JPG/GIF/WEBP).
SVG (`content-type: image/svg+xml`), `data:` URIs — all rejected by Slack image proxy.

**placehold.co** generates dynamic placeholder images usable as inline icons/badges in context blocks.

### URL pattern

```
https://placehold.co/{W}x{H}/{BG}/{FG}.png?text={TEXT}&font=PT+Sans
```

- retina: use 2x pixel dimensions (e.g. 30x30 for 15x15 logical) — do NOT use `@2x` suffix (bug: renders text as #999)
- `BG`/`FG`: 6-digit hex (`FFFFFF`) or CSS name (`orange`, `tomato`, `dodgerblue`)
- transparent bg: `transparent` keyword (not `00000000`)
- `.png` required — default response is SVG which Slack rejects
- special chars (●): omit `font` param (default font renders them); ASCII/latin: `font=PT+Sans`
- `text` value: use `encodeURIComponent()` in code, or raw URL-encode

### Recipes

```
# status dot (transparent bg, default font)
https://placehold.co/30x30/transparent/EF4444.png?text=●     # critical (red)
https://placehold.co/30x30/transparent/F59E0B.png?text=●     # warning (amber)
https://placehold.co/30x30/transparent/22C55E.png?text=●     # healthy (green)
https://placehold.co/30x30/transparent/94A3B8.png?text=●     # inactive (gray)

# status badge (colored bg, PT Sans)
https://placehold.co/30x30/22C55E/FFFFFF.png?text=OK&font=PT+Sans   # pass
https://placehold.co/30x30/EF4444/FFFFFF.png?text=X&font=PT+Sans    # fail
https://placehold.co/30x30/F59E0B/FFFFFF.png?text=!&font=PT+Sans    # warn
https://placehold.co/30x30/3B82F6/FFFFFF.png?text=i&font=PT+Sans    # info

# numbered step
https://placehold.co/30x30/6366F1/FFFFFF.png?text=1&font=PT+Sans

# label tag (non-square)
https://placehold.co/60x30/6366F1/FFFFFF.png?text=FE&font=PT+Sans
```

### Builder helper

```ts
const ph = (w: number, h: number, bg: string, fg: string, text: string, font?: string) => {
  let url = `https://placehold.co/${w * 2}x${h * 2}/${bg}/${fg}.png?text=${encodeURIComponent(text)}`;
  if (font) url += `&font=${encodeURIComponent(font)}`;
  return url;
};
// usage in context block:
{ type: "image", image_url: ph(15, 15, "EF4444", "FFFFFF", "X", "PT Sans"), alt_text: "fail" }
```

### Constraints

- context block only (max 10 elements); `image` element = non-interactive
- also usable in section accessory (ImageElement)
- Slack caches aggressively — same URL = same image; vary params to bust cache

## Message write/edit/delete (raw CLI — fallback only)

> **원칙: 메시지 전송은 항상 `./skill/blocks.ts` 빌더 패턴 우선.**
> raw `slack messages post/reply/update` 사용 전 반드시 사용자에게 이유를 설명하고 명시적 동의를 받을 것.
> 동의 없이 raw CLI로 전송 금지.

```sh
slack messages post <channel-id|#name|name> <text(required,non-empty)> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|-|@file>] [--payload-out=<file> --dry-run] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] --xoxp|--xoxb
slack messages post-ephemeral <channel-id> <user-id> <text(required,non-empty)> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] --xoxp|--xoxb
slack messages reply <channel-id|#name|name|permalink> <thread-ts> <text(required,non-empty)> [--blocks[=<json|bool|->]] [--payload-out=<file> --dry-run] [--reply-broadcast[=<bool>]] --xoxp|--xoxb
slack messages reply <thread-permalink> <text(required,non-empty)> [--blocks[=<json|bool|->]] [--dry-run[=<bool>]] [--reply-broadcast[=<bool>]] --xoxp|--xoxb
slack messages update <message-url> <text(required,non-empty)> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]]
slack messages update <channel-id> <ts> <text(required,non-empty)> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]]
slack messages delete <message-url>
slack messages delete <channel-id> <ts>
```

- raw CLI default: run `--dry-run --payload-out=message.json --json`, inspect it, then send the exact normalized artifact with `slack messages post --payload=@message.json --xoxp|--xoxb --json`.
- `--blocks` behavior: bare `--blocks` reads stdin and auto-builds Block Kit payload. `text` still required even with `--blocks`.
- `--payload`: object/stdin input, or `@file` for a normalized post artifact. rejects unknown fields.
- `--dry-run`: validates normalized req without posting. `--payload-out` writes that req for exact reuse.
- `text` with `--blocks`: plaintext fallback (notification/accessibility). `blocks()` auto-generates from all block content (mrkdwn stripped). Raw CLI: `text` arg must be near-verbatim transcription of block content.
- Channel post guard: allowlist/denylist policy may block post.
- Post/reply channels accept IDs, `#name`, or bare names. Name resolution needs `channels:read` or `groups:read`; use an ID with write-only tokens.
- Thread deletion: "delete thread" req → clarify root-only vs full thread. Deleting root leaves orphan replies; fetch via `replies <cid> <thread-ts>`, delete each ts.
- Delete/update token match: msg created by xoxp → must delete/update with `--xoxp`. Same for xoxb. No auto-fallback; mismatch throws `cant_delete_message`/`cant_update_message`.

## Pins + reactions

```sh
slack messages pin <channel-id> <ts>
slack messages unpin <channel-id> <ts>
slack messages pins <channel-id>

slack reactions add <channel-id> <ts> <emoji-name>
slack reactions remove <channel-id> <ts> <emoji-name>
slack reactions list <channel-id> <ts>
```

## Users

```sh
slack users list [<query>] [--cursor=<cursor>] [--limit=<n>]
slack users get <user-id> [user-id ...]
slack users search [<query>] [--cursor=<cursor>] [--limit=<n>]
slack users status get [user-id]
slack users status set <emoji> <text> [--expiration=<30m|1h|2h|4h|today|unix-ts>]
slack users status clear
```

- `status set/clear` are xoxp-only. `--xoxb` throws immediately.
- `users status get` accepts optional `<user-id>`; omit for self.

## Usergroups

```sh
slack usergroups list [--include-users] [--include-disabled] [--include-count]
slack usergroups get <usergroup-id> [usergroup-id ...] [--include-users] [--include-disabled] [--include-count]
slack usergroups create <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>]
slack usergroups update <usergroup-id> <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>]
slack usergroups users update <usergroup-id> <user-id> [user-id ...] --yes
slack usergroups me list
slack usergroups me join <usergroup-id>
slack usergroups me leave <usergroup-id>
```

- `usergroups users update` is destructive replace. `--yes` mandatory.

## Attachment / misc

```sh
slack attachment get <file-id>
slack resources [--json]
slack tools [--json]
slack batch "<command arg...>" "<command arg...>" [--stop-on-error[=<bool>]] [--fail-on-error[=<bool>]]
slack version
```

## Output + JSON policy

- All commands accept `--json`.
- Default: no `--json` (token-efficient, human read).
- Use `--json` only for parsing/integration/debug.
- Error shape: `{ ok: false, error, message, hint }`.
- On error, read `hint` first.

## Timestamp + examples

- Slack ts format: `seconds.fraction` (example `1712345678.123456`).
- Used by `--thread-ts`, `history`, `replies`, `delete`, `update`, `pin`, `unpin`, `reactions`.

```sh
CID=$(slack channels list --json | jq -r '.data[] | select(.name=="general") | .id')
TS=$(slack messages search "keyword" --json | jq -r '.data.messages[0].ts')
slack messages post "$CID" "reply" --thread-ts="$TS"

slack usergroups users update <gid> $(slack users search "team" --json | jq -r '[.data[].id] | join(" ")') --yes
```
