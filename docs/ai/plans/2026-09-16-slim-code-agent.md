---
status: completed
created: 2026-09-16
task: 2/2
required_gates:
  architect_review: false
  memory_update: true
---

# Slim `code.md` to its standing operating contract

**Goal:** Reduce `base/opencode/agents/code.md` to only the standing operating contract (stage loop, checkpoint format, safety rules, and `docs/ai/**` authorization), removing content that duplicates the `/implement-task` handoff brief or the ponytail plugin.

**Architecture:** `code` is a subagent invoked by `delivery` via `/implement-task`, which already supplies per-task specifics (Phase, Goal, Repository root, Acceptance criteria, Atomic stages, Relevant files, Confirmed decisions, Constraints, References, and a reuse expectation). The ponytail plugin also injects the "Ponytail Reuse-First Discipline" ladder into the system prompt via `experimental.chat.system.transform` whenever mode ≠ `off`. Therefore the ladder and per-task guidance in `code.md` are duplicated and removable. This continues the Issue #47 / 2026-09-15 dedup direction (ADR-0012, ADR-0038).

**Tech Stack:** Markdown agent template; no code or dependencies involved. No installer change (file location unchanged, so `base/opencode/agents/code.md` → `.opencode/agents/code.md` propagation is unaffected).

**Scope classification:** `multi-task` (2 reviewable deliverables: the template trim, then the memory record).

## Resolved decisions

1. **Aggressiveness:** minimal — keep only the standing contract (stage loop + checkpoint, safety rules, `docs/ai/**` authorization). Remove the ponytail ladder (plugin-injected), the duplicate scope bullets, the `## Mission` section, and the redundant "Update relevant documentation" phase-completion bullet.
2. **Keep intact:** frontmatter, the one-line title, the Stage Loop, the checkpoint format (including `Reuse check outcome`), "wait for explicit approval" contract, and the `docs/ai/**` write rules.
3. **Memory:** monthly log entry is required; a new ADR is optional (the principle is already recorded in ADR-0012/ADR-0038).

## Out of scope / deferred

- Editing `.opencode/` or `opencode.jsonc` (generated artifacts — `base/opencode/agents/code.md` is the source of truth).
- Changes to `delivery.md`, `/implement-task`, or the plan-task format.
- Any restructure of the delivery/plan workflow itself.

## Tasks

### Task 1: Trim `code.md` to the standing contract

**Objective:** Rewrite `base/opencode/agents/code.md` so it contains only the stage loop, checkpoint format, safety rules, and `docs/ai/**` authorization.

**Files:**
- Modify: `base/opencode/agents/code.md`

**Step 1: Establish expected behaviour**

The file must no longer contain (verified this session):
- The ponytail ladder comment and reuse bullets (lines 17, 22–23) — the plugin injects the ladder and `/implement-task` carries the reuse expectation.
- The `## Mission` section (lines 11–13) — restates the one-liner and the Stage Loop.
- Two separate scope bullets "Do not expand the phase scope" / "Do not start a new phase" — collapse to one.
- The "Update relevant documentation" phase-completion bullet — already covered by the Operating Rules.

It must still contain: frontmatter, one-line role, Operating Rules (brief-first + reference loading + scope + preserve worktree + no commit + `docs/ai/**` authorization), the Stage Loop with its checkpoint format (including `Reuse check outcome`), and the "wait for explicit approval" contract.

**Step 2: Add or update validation**

No new tests. Verification is a manual content review: confirm the target content matches below, frontmatter is intact, no broken fenced blocks, and no residual duplication of the brief/plugin. `make check` does not cover `base/**` (TS-only lint/type/dup), so no suite change is expected; a green `make check` is a sanity check only.

**Step 3: Write minimal implementation**

Replace the file body with exactly:

```md
---
description: Implements one approved phase across atomic stages and pauses for manual validation after each stage.
mode: subagent
temperature: 0.1
---

# Code Agent

You implement exactly one approved phase per child session.

## Operating Rules

- Read the `Code Handoff Brief` first.
- Load only references listed in the brief unless a missing fact blocks implementation.
- Stay within the phase scope; do not start a new phase.
- Preserve unrelated worktree changes.
- Do not commit changes.
- Update relevant project documentation when behavior, configuration, or workflow changes.
- You may update ordinary project documentation when needed, but update `docs/ai/**` only when explicitly authorized in the handoff or acceptance criteria.
- When `docs/ai/**` updates are not explicitly authorized, propose concise memory updates to `planner` instead of editing durable memory files.

## Stage Loop

For each atomic stage:

1. Restate the stage in one sentence.
2. Inspect the minimum required files.
3. Implement the smallest safe change.
4. Run only checks that are safe and relevant, if appropriate.
5. Stop and report.

Use this checkpoint format:

```md
## Stage Completed

Stage:
Files changed:
Behavior/config/docs changed:
Validation run:
Manual validation commands:
Risks or observations:
Reuse check outcome:
Next proposed stage:

Waiting for approval before continuing.
```

Do not continue to the next stage until the user explicitly approves continuation in this same child session.

## Phase Completion

After the final stage, return control to `planner` for git-based review, reporting all changed files, validation performed and still recommended, residual risks, and a proposed commit message.
```

**Step 4: Run test to verify pass**

Run: `make check`
Expected: all checks pass (they exercise `cli/` only; `base/**` is excluded from jscpd). Manually confirm the file diff shows only the intended removals and the checkpoint format/`docs/ai/**` rules remain intact.

**Step 5: Commit**

```sh
git add base/opencode/agents/code.md
git commit -m "refactor: slim code agent to its standing operating contract"
```

---

### Task 2: Record the change in memory

**Objective:** Record the trim in the monthly log (and optionally an ADR note) so future work knows `code.md` deliberately omits the ladder/per-task guidance.

**Files:**
- Modify: `docs/ai/logs/2026-09.md`
- Create (optional): `docs/ai/decisions/ADR-0042-code-agent-standing-contract.md`

**Step 1: Establish expected behaviour**

The 2026-09 log gains an entry under `2026-09-16` describing the trim and the rationale (brief + plugin supply per-task specifics and the reuse ladder; `code.md` now holds only the standing contract).

**Step 2: Add or update validation**

Manual: confirm the log entry is dated correctly and reads as a concise continuity note, not a transcript. If an ADR is added, route it from `docs/ai/README.md` (already covers `decisions/*.md`) and number it sequentially (ADR-0041 is the latest per the 2026-09 log).

**Step 3: Write minimal implementation**

- Append a bullet under `## 2026-09-16` in `docs/ai/logs/2026-09.md`, e.g. "Slimmed `base/opencode/agents/code.md` to its standing operating contract: removed the ponytail ladder (plugin-injected) and per-task guidance (supplied by `/implement-task` brief); merged duplicate scope bullets; dropped `## Mission`. Kept the Stage Loop, checkpoint format, safety rules, and `docs/ai/**` authorization."
- Only if a durable decision is wanted: add a short ADR capturing "the `code` agent file holds only its standing contract; per-task specifics and reuse rules come from the handoff brief and ponytail plugin" (supersedes nothing; complements ADR-0012/ADR-0038).

**Step 4: Run test to verify pass**

Run: `npx tsx .opencode/skills/ai-memory/scripts/ai-memory.ts close-check` (or `list-plans`) to confirm the plan and log are consistent, and `git diff --stat` to confirm only memory files changed.

**Step 5: Commit**

```sh
git add docs/ai/logs/2026-09.md [docs/ai/decisions/ADR-0042-code-agent-standing-contract.md]
git commit -m "docs: log code agent standing-contract trim"
```
