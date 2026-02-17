---
description: Build iteration-ready execution plan for Go MCP parity migration into main Slack CLI
argument-hint: [planning-goal]
---

## Task

Create an actionable plan for `$ARGUMENTS`.
If empty, infer from conversation context.

Execution model:

- This file is the slash-command prompt template loaded automatically by `/plan`.
- Treat its content as runtime instruction set.
- Do not edit this command file during normal `/plan` execution.

Primary objective: migrate org worktree MCP server capabilities into main Slack CLI with logical, progressive delivery cadence:
`unicycle -> bicycle -> motorcycle -> car`.

This command is not only analysis. It must drive execution orchestration setup:

- parity scan
- iteration plan
- sibling worktree branch prep
- per-worktree `todo.md` drop

## Hard Gate

Before any planning work, verify current workdir is exactly `main` worktree.

- If not `.../slack-cli/main`, immediately bail with a short reason and no further action.
- Do not plan from sibling worktrees.

## Main-Agent Responsibilities

Main agent must:

1. perform parity-boundary analysis
2. design the current iteration units
3. assign units to sibling worktrees (max 3 in parallel)
4. create branch names per worktree from main base
5. write root-level `todo.md` in each assigned sibling worktree (uncommitted)
6. monitor completion via long-polling (`todo.md` deleted => worktree reports done)
   - MUST prefer exit-on-event monitor process with `notifyOnExit=true`.
   - Monitor process exits immediately when any assigned worktree `todo.md` is deleted.
   - On exit notification, main agent identifies completed worktree(s), reads `result.md`, runs validation, then relaunches monitor for remaining worktrees.
7. read sibling `result.md`
8. delegate validation to `haiku` or `spark`
9. on validation fail, regenerate updated `todo.md` for that worktree and continue loop

## Planner Identity

You are planner/orchestrator, not direct implementer.

- Design smallest coherent iterations.
- Maximize safe parallelism across sibling worktrees.
- Keep each unit small enough for one-shot implementation by `implement` command.

## Required Inputs and Artifacts

1. Reference this command design baseline:
   - `.opencode/command/implement.md`
2. Maintain parity tracker:
   - `docs/feature-parity.md`

## Feature Parity Handling Rule

Always handle `docs/feature-parity.md` as source of truth.

1. If file does not exist:
   - Create it with checklist sections for at least:
     - Implemented
     - In Progress Boundary
     - Not Implemented
   - Seed with initial parity items derived from org docs/code and current main.

2. If file exists:
   - Locate implementation boundary between implemented and not-implemented blocks.
   - Pick exactly two checklist items around the boundary:
     - one just above boundary (recently implemented or near-complete)
     - one just below boundary (next missing capability)
   - Delegate short reconnaissance for both items in parallel to `haiku` or `spark`.
   - Each recon reports:
     - current status (done/partial/missing)
     - remaining work (max 3 bullets)
     - smallest next implementation unit

3. Recon may be skipped only when user explicitly instructs to skip investigation.

## Worktree Parallelization Rule

Repo topology:

- `main`
- `wt-1`
- `wt-2`
- `wt-3`

When `plan` runs:

- Split non-conflicting implementation units across up to 3 sibling worktrees.
- Ensure file-level conflict avoidance by construction.
- Prepare assignment map so the main orchestrator can complete the current feature iteration efficiently.
- Use only one worktree when strict serial dependency dominates (do not force parallelism).

### Cross-worktree dependency protocol

If two worktrees must be dependency-coupled, planner must provide explicit interface contract in both `todo.md` files.

Required contract fields:

- producer worktree + consumer worktree
- exact exported type/function/CLI shape
- file path ownership boundaries
- backward-compatibility rule during parallel work
- merge-order expectation
- integration verification command proving combined behavior on main

Rule:

- Never rely on implicit assumptions between worktrees.
- If contract is precise and both sides implement contract faithfully, main integration must succeed without ad-hoc redesign.

### Path and command rule

- Sibling directories may be named `wt-*` or `worktree-*`; discover actual paths first.
- For sibling git ops, use `git -C ../worktree-* ...` style invocation from main context.
- Do not switch orchestrator working directory to sibling worktree.

### Branch provisioning

For each assigned sibling worktree:

- Create or reset to a branch based on current main branch tip.
- Branch naming must be deterministic and iteration-scoped.
- Recommended pattern:
  - `feat/parity-i{iteration}-{unit-key}-wt{n}`
- Record branch name in root `plan.md`.

## Delegation Contract

For each assigned worktree unit, instruct that worktree agent to execute via `implement` command (not ad-hoc coding prompt).

Each unit spec must include:

- exact file paths
- behavioral contract
- validation command(s)
- explicit non-goals
- commit topology (`single` | `multi` | `combined-exception`) and commit policy for that unit

`todo.md` must explicitly include:

- mission goal and scope
- required `/implement` invocation text
- clean git completion requirement
- commit completion requirement (commit hash must be reported in `result.md`)
- explicit commit topology instruction (`single` or `multi`) with commit grouping rule
- completion signal protocol:
  - create/update `result.md`
  - delete `todo.md`
- prohibition on partial-done signaling

Worktree-agent completion contract:

- finish implementation
- finish local verification
- complete commit for finalized changes (only with explicit human approval for that worktree)
- keep git state clean for its own finalized changes after commit
- write concise `result.md`
- remove `todo.md`

## Output Format

Primary output format is per-worktree root `todo.md` files (uncommitted).

For each assigned worktree, create `todo.md` containing:

1. Iteration ID + unit ID + branch name
2. Goal and strict scope
3. Exact target file paths
4. Required `/implement` invocation text
5. Validation commands and pass criteria
6. Non-goals and forbidden edits
7. Completion protocol (`result.md` write + `todo.md` delete)
8. Failure protocol (what to report when blocked)

Optional supporting artifact:

- Root `plan.md` may be updated for orchestration visibility, but it is secondary.

## `todo.md` Canonical Example

Use this exact structure (fill placeholders):

```md
# TODO - <iteration-id> / <unit-id>

## Worktree

- Path: `<../worktree-n>`
- Branch: `<feat/parity-iX-...>`
- Base: `main`

## Mission

- Implement: `<single intent unit>`
- Scope boundary: `<what is included>`
- Out of scope: `<what must not be changed>`

## Required /implement Invocation

Run exactly this command as the worktree main agent:

`/implement <unit-specific implementation goal>`

## Target Files (exact)

- `<path-1>`
- `<path-2>`

## Behavioral Contract

- `<input/output contract 1>`
- `<error/edge contract 2>`

## Verification (must pass)

- `bun run typecheck`
- `bun test <targeted-suite-or-filter>`

Pass criteria:

- all required checks green
- no unrelated file modifications

## Commit Topology (required)

- Mode: `<single | multi | combined-exception>`
- Grouping rule:
  - `single`: one logical commit for entire unit
  - `multi`: multiple commits grouped by intent/module boundaries listed below
  - `combined-exception`: one combined commit allowed because safe split requires risky hunk surgery
- Commit message policy:
  - English only, concise, why-focused
  - include scope prefix when possible (for example `feat(messages): ...`)

If `multi`, define commit plan explicitly:

- Commit 1: `<intent + owned files>`
- Commit 2: `<intent + owned files>`

## Expected Test Failures (optional)

- Allowed failing checks:
  - `<test-or-suite-name>`: `<why failure is expected in isolation>`
- Unblock condition:
  - `<what dependency must land to turn green>`

If this section is absent, zero failures are allowed.

## Cross-Worktree Contract (optional, required when coupled)

- Dependency: `<producer-unit> -> <consumer-unit>`
- Producer must deliver:
  - `<exact API/type/behavior contract>`
- Consumer must assume only:
  - `<strict allowed assumptions>`
- Shared boundary:
  - `<owned files and prohibited edits>`
- Merge order:
  - `<order>`
- Main integration check:
  - `<single command or command set expected to pass after merge>`

## Completion Protocol (required)

1. Run required verification commands and ensure all pass.
2. Complete git commit for finalized changes (single logical commit unless unit explicitly requires multi-commit).
   - If explicit human commit approval is missing, keep `todo.md` present and report blocker in `result.md`.
3. Create `result.md` at worktree root with:
   - implemented changes
   - verification evidence (commands + brief outcomes)
   - commit hash(es)
   - known limitations/TODOs
4. Delete this `todo.md`.

Never delete `todo.md` before both commit completion and `result.md` update.

`todo.md` deletion is the completion signal consumed by main orchestrator.

## If Blocked

- Keep `todo.md` present.
- Append blocker details to `result.md` with concrete ask.
- If blocked only by missing commit approval, explicitly state approval request in `result.md` and do not delete `todo.md`.
- Do not claim completion.
```

## Long-Poll Orchestration Loop

Main agent must run iterative monitor loop per assigned worktree:

1. Spawn one monitor process from main context with `notifyOnExit=true`.
2. Monitor process checks assigned worktree `todo.md` files and exits immediately when any file disappears.
3. On exit notification, treat disappeared `todo.md` worktree(s) as candidate completion.
4. Read candidate worktree `result.md`.
5. Delegate verification of claimed outcome to `haiku` or `spark`.
6. If verification passes and commit evidence is present in `result.md`, accept unit and remove it from pending set.
7. If verification fails, write updated `todo.md` with precise gap-fix instructions and keep unit pending.
8. Relaunch monitor process for remaining pending worktrees; repeat until pending set is empty.

Implementation note (recommended shell shape):

- `while all pending todo.md exist; do sleep <interval>; done; echo completion; exit 0`
- This converts polling into event-like orchestration via process exit + `notifyOnExit`.

Never accept completion without independent verification.

## Shared Ignore Hygiene

Ensure repository ignore rules include root-level transient orchestration files:

- `todo.md`
- `result.md`

These files are signaling artifacts and must remain uncommitted.

## Planning Quality Bar

- Logical progression required; no large leap across maturity stages.
- Prefer incremental capability ladders over broad incomplete scaffolding.
- Keep plans executable without hidden assumptions.
- If assumptions are uncertain, add a bounded investigation unit first.
