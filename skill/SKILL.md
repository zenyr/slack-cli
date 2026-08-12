---
name: slack
description: Unified Slack skill for lookup, auth, Block Kit composition, dry-run, and message delivery via local Slack CLI
---

# Slack CLI skill (local)

## CLI discovery

- Binary: global `slack`.
- Reuse syntax already visible in the current context. Do not query help defensively.
- Unknown namespace: run `slack --help` once.
- Known namespace, unknown operation: run `slack <namespace> --help` once.
- Known operation: run `slack schema <namespace> <operation>` once. This is the narrowest, most token-efficient source for args, side effects, stdin/raw-payload/dry-run support, and token policy.
- Add `--json` to `schema` only when code must parse it. Human schema output is smaller.
- On a CLI error, read its `hint`; make at most one targeted help/schema lookup if the hint is insufficient.
- Never dump the full schema or enumerate every namespace to answer one command question.
- Never truncate CLI output with `head`, `tail`, or line slicing. Narrow the query at the CLI instead.
- Do not repeat equivalent help/schema queries in the same task.

## Execution policy

- Prefer plain output. Use `--json` only for structured extraction, integration, or debugging.
- Before a mutation, resolve human names to stable IDs with the relevant narrow `search`, `list`, or `info` command.
- Read exact auth and token requirements from the target command schema; do not memorize command lists.
- Prefer typed `send*` helpers for messages. They validate locally and send once.
- For raw message mutations, prefer `--payload` over long flag chains; dry-run to an artifact, inspect it, then send that exact artifact.

## User context

- Owner: `<user-id>`
- Bot: `<bot-user-id>`
- Test channel: `<test-channel-id>`
- If user says only "테스트 채널", use `<test-channel-id>`
- "테스트해줘" / "test it": post an ephemeral message to the owner in the test channel.
- Resolve the ephemeral user with `slack auth whoami --json`; reuse a known unchanged owner ID instead of re-querying.

## Message lookup routing

- `messages fetch`: one message from a permalink; request its thread only when needed.
- `messages replies`: a full thread when channel + thread timestamp are known.
- `messages context`: nearby messages around a permalink.
- `messages history`: recent messages in a known channel.
- `messages search`: cross-channel or filtered discovery.

### posting target resolution

- Extract the channel ID from a Slack archive URL.
- If a reply/update lacks a timestamp, inspect a small recent-message window first; ask only if still ambiguous.
- Query the exact command schema before adding filters or performing a mutation.

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
import { b, el, fmt, blocks, sendPost, runMain } from "./skill/blocks.ts";

runMain(async () => {
  const payload = blocks([
    b.header("제목"),
    b.section(`${fmt.bold("굵게")}텍스트`),
    b.actions([el.button("확인", "btn_ok", { style: "primary" })]),
  ]);

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
  - `inspectSchema([...])`: programmatic schema access when code must inspect fields; do not call for known helper usage

Exports: `b` (blocks), `el` (elements), `txt` (text objects), `fmt` (mrkdwn format), `blocks` (payload assembler), `payload`, `inspectSchema`, `createSendHelpers`, `sendPost`, `sendReply`, `sendUpdate`, `sendEphemeralPost`, `sendEphemeralReply`, `runMain`

- `blocks()` 2nd arg: `{ text?: string }` — push notification / accessibility 용 plaintext 요약
  - 4+ sections 등 rich 메시지: `blocks([...], { text: "한줄 요약" })` 필수 — auto-derive 는 content dump 되어 push 에서 읽기 불편
  - 1-2 sections 간단한 메시지: 생략 OK, auto-derive 충분

### agent-first send pattern

```ts
import { blocks, b, sendUpdate } from "./skill/blocks.ts";

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

> Prefer `./skill/blocks.ts`. Before raw `post`, `reply`, or `update`, explain why and obtain explicit user approval.

- Run `slack schema messages <operation>` for current syntax and token policy. Do not retain copied signatures here.
- Default raw-send flow: dry-run to a payload artifact, inspect it, then send that exact normalized artifact.
- Use a faithful plaintext `text` fallback for notification and accessibility when sending blocks.
- Channel post guard: allowlist/denylist policy may block post.
- For "delete thread," clarify root-only versus all messages; deleting the root can leave replies orphaned.
- Update/delete with the same token identity that authored the message.

## Other CLI workflows

- Use root help to discover the namespace, namespace help to discover the operation, then exact schema for invocation.
- Treat schema-reported mutations, token policy, confirmation, raw-payload, stdin, and dry-run fields as authoritative.
- Replacement-style operations are destructive even when the command name says `update`; inspect the exact schema and require its confirmation guard.
- Slack timestamps use `seconds.fraction`.

## Output + JSON policy

- All commands accept `--json`.
- Default: no `--json` (token-efficient, human read).
- Use `--json` only for parsing/integration/debug.
- Error shape: `{ ok: false, error, message, hint }`.
- On error, read `hint` first.
