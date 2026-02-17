## 0. Hard Rules

- Docs language: English only.
- Commit message language: English only.
- Runtime/tooling default: Bun stack, not Node stack.
- Do not start servers (`bun start`, `bun serve`, `bun dev`, or equivalent) unless user explicitly requests it in the current conversation turn.
- Do not kill processes without explicit user approval for that specific kill action; approval is single-use and must be re-confirmed each time.

## 1. Worktree Ops (from `main/` only)

- For sibling worktrees, use `git -C <path> ...`.
- Do not switch `workdir` to sibling worktrees.
- Rationale: avoid `external_directory` permission prompts.
- Workspace layout reference: `../AGENTS.md`.

Valid:

```sh
git -C ../worktree-1 status -sb
git -C ../worktree-2 checkout --detach main
```

Invalid:

```sh
# workdir: ../worktree-1
git status -sb
```

## 2. Command Mapping (enforced)

- `bun <file>` (not `node`, `ts-node`)
- `bun test` (not `jest`, `vitest`)
- `bun build <file.html|file.ts|file.css>` (not `webpack`, `esbuild`)
- `bun install` (not `npm|yarn|pnpm install`)
- `bun run <script>` (not `npm|yarn|pnpm run`)
- `bunx <pkg> <cmd>` (not `npx`)
- Bun auto-loads `.env`; do not add `dotenv` bootstrap for basic env loading.

## 3. API/Library Preference

- HTTP server: `Bun.serve()`; do not introduce `express`.
- SQLite: `bun:sqlite`; do not introduce `better-sqlite3`.
- Redis: `Bun.redis`; do not introduce `ioredis`.
- Postgres: `Bun.sql`; do not introduce `pg` or `postgres.js`.
- WebSocket: built-in `WebSocket`; do not introduce `ws`.
- File IO: prefer `Bun.file` over `node:fs` read/write patterns where practical.
- Shell exec: prefer `Bun.$` over `execa`.

## 4. Testing

- Test runner: `bun test`.
- Minimal example:

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## 5. Frontend (Bun-native)

- Use `Bun.serve()` + HTML imports.
- Do not add `vite` for standard app serving/bundling.
- HTML can import `*.tsx|*.jsx|*.js` directly.
- CSS can be linked/imported directly; Bun bundles it.

Server skeleton:

```ts
import index from "./index.html";

Bun.serve({
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});
```

Run:

```sh
bun --hot ./index.ts
```

Reference docs: `node_modules/bun-types/docs/**.mdx`.
