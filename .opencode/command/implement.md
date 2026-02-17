---
description: Implement a requested feature through dependency-aware parallel delegation with wave-based stabilization and commit loops
argument-hint: [implementation-goal]
---

## Task

Implement `$ARGUMENTS` end-to-end by splitting work into dependency-aware waves, delegating aggressively in parallel where safe, and keeping git state stable between waves.

If `$ARGUMENTS` is empty, infer the implementation goal from current conversation context.

## Operating Model

Use this execution loop repeatedly until implementation is complete:

1. **Plan the next wave**
   - Break pending work into independent tasks by dependency and risk.
   - Mark which tasks are parallelizable vs blocked by prerequisites.
   - Prefer small, composable units with clear ownership boundaries.

2. **Delegate in parallel**
   - Launch multiple subagents for independent tasks in one wave.
   - Give each subagent a strict scope (files, behavior, tests, constraints).
   - Require each subagent to run relevant verification for its scope.

3. **Integrate and stabilize wave output**
   - Resolve overlaps/conflicts from parallel edits.
   - Keep implementation minimal-impact and style-consistent.
   - Add explicit actionable `TODO:` markers for intentional deferrals.

4. **Wave gate: prove stable git state**
   - Delegate verification of:
     - `git status --short`
     - repo-standard typecheck
     - repo-standard tests
   - If failing/dirty unexpectedly, delegate minimal fixes and re-run checks.
   - Continue only when the wave is stable and understood.

5. **Commit via git delegation**
   - Delegate commit creation to git specialist agent.
   - Use logical intent-based commit units (single or multi as appropriate).
   - Require concise English commit messages focused on intent/impact.
   - After commit, re-check `git status --short --branch`.
   - If hooks/formatters introduce drift after commit, handle in a follow-up stabilization mini-wave and commit again.

6. **Repeat waves**
   - Continue wave loop until feature is fully implemented and verified.

## Requirements

- Prefer parallel delegation by default; serialize only when dependencies require it.
- Between every wave, verify repo health before proceeding.
- Never leave unresolved conflicts or unknown dirty state.
- Keep production code constraints enforced (repo policy):
  - no non-null assertions unless explicitly allowed
  - no type assertions unless explicitly allowed
  - const function expressions preferred
- For deferred work, leave actionable `TODO:` comments including:
  - owner scope
  - next action
  - removal condition

## Commit Policy

- Do not push unless explicitly requested.
- Do not amend unless explicitly requested.
- Do not bypass hooks unless explicitly requested.
- Prefer grouped commits by logical intent unit.

## Definition of Done

All of the following must hold:

- Implementation goal is delivered.
- Typecheck and tests pass.
- Git working tree is stable (clean unless user requested otherwise).
- Commits are logically structured and readable.
- Any intentional deferrals are documented with actionable `TODO:` markers.
