## Global Rules

- APPLY: docs/commit-msg text -> English only.
- APPLY: runtime/tooling choice -> Bun-first, not Node-first.
- APPLY: process control.
  - NEVER start server (`bun start|serve|dev|--hot`) unless user explicitly requests in current turn.
  - NEVER kill process without explicit per-action user approval (single-use).

## Worktree Rules

- APPLY: only when operating sibling worktrees from `main/`.
  - MUST use `git -C ../worktree-* ...`.
  - NEVER switch tool `workdir` to sibling worktree.

## Bun Mapping

- APPLY: command selection.
  - MUST prefer: `bun`, `bun test`, `bun build`, `bun install`, `bun run`, `bunx`.
  - NEVER default to: `node|ts-node`, `jest|vitest`, `webpack|esbuild`, `npm|yarn|pnpm`, `npx`.
  - NOTE: Bun auto-loads `.env`; avoid dotenv bootstrap for basic env load.

## Lib Preference

- APPLY: new deps or replacements.
  - Server: `Bun.serve()` not `express`.
  - SQLite: `bun:sqlite` not `better-sqlite3`.
  - Redis: `Bun.redis` not `ioredis`.
  - Postgres: `Bun.sql` not `pg|postgres.js`.
  - WS: built-in `WebSocket` not `ws`.
  - IO/exec: prefer `Bun.file`, `Bun.$`.

## Commit Conditions

- APPLY: user asks `commit`.
  - DEFAULT: grouped commits by logical task/intent unit.
  - NEVER interpret `split commits well` as hunk split in one file.
  - NEVER use one mega commit when multiple logical units exist.
  - PREFER grouping by file/module purpose (`feat|fix|refactor|test|docs|chore`).
  - FALLBACK: if split needs hunk surgery, use one combined commit + reason in body.
  - MSG: English, concise, unit impact.

## Git Delegation Contract

- APPLY: delegating commit work to git agent.
  - Caller sends only: intent unit(s), topology (`single|multi|combined-exception`), include/exclude.
  - Git agent owns: `status/log/diff`, staging plan, commit execution, msg draft.
  - Keep safety defaults: no push/amend/force/hook-bypass unless explicitly requested.
