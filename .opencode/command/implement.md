---
description: Implement feature via fine-grained orchestration, lightweight agent delegation, cross-validation, and iteration-based stabilization
argument-hint: [implementation-goal]
---

## Task

Implement `$ARGUMENTS` end-to-end. If empty, infer from conversation context.

## Orchestrator Identity

You = pure coordinator. Think, design, delegate, adapt. Never touch files/git directly.

**MUST delegate:** file R/W/edit → subagents, commands (typecheck/test/lint/build) → subagents, git ops → git agent, codebase search → explore agent.

**MUST NOT:** call Bash/Read/Write/Edit/Grep/Glob directly (except TodoWrite). No direct git. No direct file reads post-research.

**Exception — initial research:** before first iteration, use explore agents liberally for codebase understanding. Thorough upfront recon prevents bad plans. Once first iteration starts → pure delegation mode.

## Core Loop (per iteration)

### 1. Plan — orchestrator owns all design

- Break work into smallest independent units.
- Each unit spec must contain: exact file paths, fn signatures/type shapes/behavioral contract, expected I/O or test assertions, constraints (no `!`, no `as`, const fn exprs).
- Unit size: completable by haiku/spark in one shot, zero arch decisions.
- Design decisions resolved here, never by subagent.

### 2. Delegate — right-size agent

| Agent       | Scope                                                           |
|-------------|-----------------------------------------------------------------|
| **haiku**   | ≤3-4 files. Mechanical transforms, tests, utils, straightforward impl. **Default.** |
| **spark**   | ≤5-7 files. Cross-module local reasoning, spec fully defined.   |
| **general** | Broad codebase reasoning / cross-module orchestration unresolvable by orchestrator. **Last resort.** |
| **explore** | Read-only recon. Planning + mid-iteration investigation only.   |
| **git**     | Commit delegation only.                                         |

**Rules:**
- Parallel launch for independent tasks within iteration.
- Each prompt: exact scope, file paths, expected behavior, verification cmd.
- Subagent runs own verification before returning.
- Vague prompt ("implement X feature") → STOP, break down further or design yourself.

**Subagent report requirement:**
Each subagent ends report with `delegation_feedback`:
- `context_sufficient: yes | no(what was missing)`
- `wasted_effort: none | description`
Terse metadata for orchestrator, not prose.

### 3. Cross-validate — different agent reviews

Spawn **separate agent** (different type from implementer):
- Satisfies spec from step 1?
- Design-level issues? (not style — biome handles style)
- Edge cases missed? Contract violations? Integration gaps?
- Scope: **abstract correctness** only.
- Verdict: `pass` | `fail(reasons)`.

**Pairing:** haiku/spark implementer → spark/haiku reviewer (cross-type). general implementer → spark reviewer. Reviewer prompt includes: original spec, impl diff summary, review criteria.

### 4. Mutual refinement — converge

On `fail`:
1. Orchestrator triages failure reasons.
2. Spawn implementer w/ **specific fix instructions** (not "fix the issues").
3. Re-run cross-validation.
4. Max 3 rounds per unit. Still failing → orchestrator re-designs, restart unit.

### 5. Iteration gate (delegated)

Delegate to subagent: `git status --short`, typecheck, tests.
Failing → delegate targeted fixes → delegate re-verify. Proceed only when green.

### 6. Commit — git delegation

Git agent handles staging/msg/execution autonomously. Reports `git status --short --branch`. Hook/formatter drift → delegate stabilize + re-commit.

When running from worktree `todo.md` contract, commit timing is strict:
- verification must pass first
- commit must complete next
- only after commit, write final `result.md`
- delete `todo.md` last

If explicit human commit approval is required by current task contract and not yet granted, do not commit; keep `todo.md` present and report blocker in `result.md`.

### 6.1 Todo Terminal Signal Protocol (strict)

`todo.md` deletion is a one-way terminal signal for orchestrator pickup.

Delete `todo.md` only at terminal moment:
1. success terminal: verification passed, commit done, final `result.md` written.
2. abandon terminal: unit proven non-completable now, final `result.md` includes explicit abandonment + blocker evidence.

Paraphrase rule: if still implementing, validating, fixing, or deciding, keep `todo.md`.

### 7. Delegation quality feedback

Review `delegation_feedback` from all iteration subagents:
- Multiple `context_sufficient: no` w/ similar gaps → under-researched. Explore agent fills gap before next iteration.
- `wasted_effort` on recon orchestrator could have provided → include that context type in future prompts.
- **Be critical, not compliant.** Subagents may over-request for convenience. Only adjust on real orchestrator blind spots.
- One-off miss = noise. Same gap ×2 = signal.

### 8. Adaptive replan → next iteration

Review iteration reports. Evaluate remaining plan validity.

**After every subagent report:**
1. **Assumption invalidated?** File missing, API shape differs, missed dependency → explore + adjust.
2. **New work revealed?** Edge case, integration point → add unit.
3. **Planned work unnecessary?** Lib already handles, units overlap → drop/merge.

**Replan scale:**
- Small (reorder, ±1-2 units): inline update, continue.
- Medium (new dep, 3+ units affected): pause iteration, replan remaining, resume.
- Large (fundamental assumption wrong): explore recon, redesign from current state forward. Keep completed work unless harmful.

**Never:** ignore unexpected reports + press original plan. Re-plan from scratch for minor adjust. Let failed assumption cascade across iterations.

## Agent Selection Heuristic

```
Fully specifiable to exact code shape?
├─ Yes → ≤4 files, mostly mechanical?
│        ├─ Yes → haiku
│        └─ No (5-7 files / cross-module) → spark
└─ No → Resolvable via explore first?
         ├─ Yes → explore → re-enter tree
         └─ No → general (document why)
```

## Commit Policy

No push/amend/hook-bypass unless explicitly requested. Grouped commits by logical intent unit.

## Definition of Done

- Impl goal delivered.
- Every unit passed cross-validation.
- Typecheck + tests pass.
- Git tree stable.
- Commits logically structured.
- If `todo.md` protocol applies: strict sequence preserved (`verify -> commit -> result.md -> todo.md delete`).
- `todo.md` removed only at success terminal or abandon terminal.
- Deferrals documented: actionable `TODO:` w/ owner scope, next action, removal condition.
