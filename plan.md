# Parity Iteration Plan

## Iteration

- ID: `i2-bicycle-close`
- Objective: close bicycle boundary by hardening `messages replies` parity and removing public contract drift.

## Boundary Recon

- Above boundary (`messages history`): `done` (time-range parsing + `#channel` resolution already shipped).
- Below boundary (`messages replies`): `partial` (core functionality shipped, contract/validation gaps remain).

## Worktree Assignment

- `worktree-1` → unit `u1-replies-limit-guard`
  - Branch: `feat/parity-i2-replies-validation-wt1`
  - Scope: strict input validation + targeted handler tests
- `worktree-2` → unit `u2-replies-contract-surface`
  - Branch: `feat/parity-i2-replies-contract-docs-wt2`
  - Scope: CLI command surface alignment + help contract tests
- `worktree-3` → unassigned (kept idle to avoid overlap)

## Conflict Avoidance

- `u1` owns only:
  - `packages/commands/src/handlers/messages-replies.ts`
  - `packages/commands/src/__tests__/messages-replies.test.ts`
- `u2` owns only:
  - `packages/config/src/index.ts`
  - `packages/commands/src/__tests__/help.test.ts`
- Rule: no cross-edit beyond owned files in this iteration.
