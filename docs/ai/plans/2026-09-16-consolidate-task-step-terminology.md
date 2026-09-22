---
status: complete
created: 2026-09-16
task: 3/3
required_gates:
  architect_review: false
  memory_update: true
---

# Consolidate workflow terminology to task/step

**Goal:** Eliminate residual "phase"/"stage" vocabulary from every *active* workflow surface so agents load one consistent word set — "task" for the unit of work, "step" for its sub-units, and `task:` for the plan frontmatter field — while leaving historical records untouched.

**Architecture:** Issue #47 / ADR-0038 migrated planning from phase-based to task-based, and plans now decompose into tasks with steps (`task: <n>/<total>` frontmatter). The wording drift is incomplete in the runtime-loaded templates (`base/opencode/**` agents + skills), the root `README.md`, the memory router `docs/ai/README.md`, the active `docs/ai/architecture.md`, and the just-authored ADR-0042. This is a documentation-only sweep: no code behavior, installer, or logic changes. `base/opencode/**` is the source of truth (the installer regenerates `.opencode/**` from it), so edits land there and never in the gitignored `.opencode/`.

**Tech Stack:** Markdown agent/skill templates and one TypeScript string literal. No code or dependency changes.

**Scope classification:** `multi-task` (3 reviewable deliverables: template sweep, active-docs rewrite, memory record).

## Resolved decisions

1. **Include `docs/ai/architecture.md`** (approved): lines 144 and 163 say "atomic stage" ×2. It is active memory (memory router + progressive disclosure), not historical. Change "atomic stage" → "atomic step".
2. **Include `base/opencode/skills/ai-memory/scripts/ai-memory.ts`** (approved): line 218 embeds a `docs/ai/README.md` scaffold containing "phase status", which `/init` regenerates. It is a string literal only (no behavior change) and sits under `base/opencode/**`, so the grep acceptance criterion already requires it. Change "phase status" → "task status".
3. **"stage" as git staging is exempt** (`base/opencode/skills/shared-task/scripts/gh-issue.ts` line 852 "stage only tracked files") — leave as-is.
4. **Historical records are immutable**: ADRs 0002–0038 and completed plan files (e.g. `2026-09-16-slim-code-agent.md`, which itself uses phase/stage wording) are not edited and are excluded from every grep acceptance check.

## Out of scope

- Historical ADRs (0002–0038) and completed plan files — leave as-is, including ADR-0026's `phase:` standardization text.
- The `.opencode/` generated tree and `opencode.jsonc` (gitignored; regenerated from `base/opencode/**`).
- `cli/src/**`, `install/`, `scripts/`, `qa/`, the ponytail plugin, and any TS/installer behavior.
- The `gh-issue.ts` "stage only tracked files" git-staging comment.

## Tasks

### Task 1: Sweep `base/opencode/**` templates to task/step vocabulary

**Objective:** Remove every workflow "phase"/"stage" token from the runtime-loaded agents and skills, leaving only the git-staging "stage" in `gh-issue.ts`.

**Files:**
- Modify: `base/opencode/agents/planner.md`
- Modify: `base/opencode/agents/troubleshooter.md`
- Modify: `base/opencode/agents/architect.md`
- Modify: `base/opencode/agents/delivery.md`
- Modify: `base/opencode/skills/plan/SKILL.md`
- Modify: `base/opencode/skills/memory-maintenance/SKILL.md`
- Modify: `base/opencode/skills/ai-memory/SKILL.md`
- Modify: `base/opencode/skills/ai-memory/scripts/ai-memory.ts`
- Validate: `base/opencode/**` grep (below)

**Step 1: Establish expected behaviour**

Each replacement is a mechanical word swap (no prose restructuring). Exact before → after:

- `planner.md` line 8: "approved, phase-based implementation plans" → "approved, task-based implementation plans".
- `planner.md` line 29: "Decompose work into executable phases using the `plan` skill for scope and phase-budget rules." → "Decompose work into executable tasks using the `plan` skill for scope and task-budget rules."
- `troubleshooter.md` line 18: "want a phased implementation plan. Choose `code` when you have an approved phase to implement." → "want a task-based implementation plan. Choose `code` when you have an approved task to implement."
- `architect.md` line 2 (frontmatter description): "without authoring code or phases." → "without authoring code or tasks."
- `architect.md` line 12: "Identify when a phase touches an architectural boundary." → "Identify when a task touches an architectural boundary."
- `architect.md` line 16: "generate code, or create implementation phases." → "generate code, or create implementation tasks."
- `architect.md` line 28: "Invoke `architect` only when a phase touches one of these explicit boundary categories:" → "Invoke `architect` only when a task touches one of these explicit boundary categories:"
- `delivery.md` line 23: "for its stage of the task loop." → "for its step of the task loop."
- `plan/SKILL.md` line 3 (description) and line 12: "through phased delivery" → "through task-based delivery".
- `plan/SKILL.md` line 75: "propose a phased plan using this structure" → "propose a task-based plan using this structure".
- `memory-maintenance/SKILL.md` line 24: "with no recent `phase:` bump in the YAML frontmatter" → "with no recent `task:` bump in the YAML frontmatter".
- `memory-maintenance/SKILL.md` line 32: "for approved plan progress and phase status" → "for approved plan progress and task status".
- `ai-memory/SKILL.md` line 36: "as evidence during phase closeout or review." → "as evidence during task closeout or review."
- `ai-memory/scripts/ai-memory.ts` line 218 (inside the `TEMPLATE_*` doc string): "- Approved plans and phase status" → "- Approved plans and task status".

**Step 2: Add or update validation**

No new tests. `make check` is TS-only and targets `cli/**`, so it does not cover `base/**`; a green run is a sanity check only. The real gate is the grep below.

**Step 3: Write minimal implementation**

Apply the swaps above. `ai-memory.ts` is the only non-Markdown file — change only the string literal, no code. Do not touch `gh-issue.ts`.

**Step 4: Run test to verify pass**

Run: `grep -rniE '\b(phase|stage)' base/opencode/`

Expected: the only remaining match is `base/opencode/skills/shared-task/scripts/gh-issue.ts` line 852 (`stage only tracked files`, git staging — exempt). No other `phase`/`stage`/`phases`/`stages`/`staged` token remains.

Run: `make check` — expected green (sanity; no behavior change).

**Step 5: Commit**

```sh
git add base/opencode/agents/planner.md base/opencode/agents/troubleshooter.md base/opencode/agents/architect.md base/opencode/agents/delivery.md base/opencode/skills/plan/SKILL.md base/opencode/skills/memory-maintenance/SKILL.md base/opencode/skills/ai-memory/SKILL.md base/opencode/skills/ai-memory/scripts/ai-memory.ts
git commit -m "docs: consolidate base/opencode workflow terminology to task/step"
```

---

### Task 2: Rewrite active docs to task/step wording

**Objective:** Rewrite the root `README.md`, the memory router `docs/ai/README.md`, and active `docs/ai/architecture.md` so workflow prose uses "task"/"step" and describes `code` implementing one task across atomic steps.

**Files:**
- Modify: `README.md`
- Modify: `docs/ai/README.md`
- Modify: `docs/ai/architecture.md`
- Validate: grep over the three files (below)

**Step 1: Establish expected behaviour**

- `README.md` line 12: "**Staged delivery** is the single delivery path" → "**Task-based delivery** is the single delivery path".
- `README.md` line 20: "### Staged delivery" → "### Task-based delivery".
- `README.md` line 26: "implements one task at a time in atomic stages, pausing after each for your approval." → "implements one task at a time in atomic steps, pausing after each for your approval."
- `README.md` line 61: "Discovery, phased planning, clarifying questions" → "Discovery, task-based planning, clarifying questions".
- `README.md` line 65: "Implements one task across atomic stages, pausing after each for manual validation." → "Implements one task across atomic steps, pausing after each for manual validation."
- `README.md` line 267: "Prefer explicit review gates for staged delivery." → "Prefer explicit review gates for task-based delivery."
- `docs/ai/README.md` line 25: "Approved plans and phase status" → "Approved plans and task status".
- `docs/ai/architecture.md` line 144: "Pause after each atomic stage for manual validation." → "Pause after each atomic step for manual validation."
- `docs/ai/architecture.md` line 163: "Keep manual validation checkpoints between atomic stages." → "Keep manual validation checkpoints between atomic steps."

**Step 2: Add or update validation**

No new tests. Verification is the grep below plus a manual read that the README now states `code` implements one task across atomic steps.

**Step 3: Write minimal implementation**

Apply the swaps above. Keep the "Staged delivery" workflow *name* concept intact — it becomes "Task-based delivery"; do not otherwise restructure the sections.

**Step 4: Run test to verify pass**

Run: `grep -rniE '\b(phase|stage)' README.md docs/ai/README.md docs/ai/architecture.md`

Expected: no output (zero matches).

**Step 5: Commit**

```sh
git add README.md docs/ai/README.md docs/ai/architecture.md
git commit -m "docs: rewrite README and memory router to task/step wording"
```

---

### Task 3: Correct ADR-0042 and record canonical vocabulary

**Objective:** Fix the just-authored ADR-0042 to describe current state, and record the canonical vocabulary (task = unit, step = sub-unit, field = `task:`) in a new ADR and the monthly log.

**Files:**
- Modify: `docs/ai/decisions/ADR-0042-code-agent-standing-contract.md`
- Create: `docs/ai/decisions/ADR-0043-workflow-terminology-task-step.md`
- Modify: `docs/ai/logs/2026-09.md`
- Validate: `close-check` + scoped grep (below)

**Step 1: Establish expected behaviour**

ADR-0042 corrections (current `code.md` already uses "Step Loop"/"step"; ADR-0042 lags):
- line 11: "Per-task specifics (phase goal, acceptance criteria, atomic stages, ..." → "Per-task specifics (task goal, acceptance criteria, atomic steps, ...".
- line 12: "restated the one-line role and the Stage Loop." → "restated the one-line role and the Step Loop."
- line 19: "the Stage Loop, the checkpoint format" → "the Step Loop, the checkpoint format".
- line 29: "remains responsible for staged execution" → "remains responsible for stepwise execution".

New ADR-0043 records, as canonical vocabulary:
- The unit of work is a **task**; its sub-units are **steps** (atomic steps).
- The plan frontmatter progress field is `task: <n>/<total>` (renamed from ADR-0026's `phase:` field per the Issue #47 task-based migration).
- "phase" and "stage" (workflow sense) are retired; "stage" survives only as git staging.
- Status: Accepted. Date: 2026-09-16. Related: amends ADR-0026, follows ADR-0038.

Monthly log `docs/ai/logs/2026-09.md`: append one bullet under `## 2026-09-16` recording the consolidation and the canonical vocabulary (task/step/`task:`).

**Step 2: Add or update validation**

Manual: ADR-0043 is numbered sequentially (latest is ADR-0042) and routed from `docs/ai/README.md` (`decisions/*.md` already covered). Scoped grep must be clean; do NOT grep the whole `decisions/` dir (historical ADRs intentionally retain "phase"/"stage").

**Step 3: Write minimal implementation**

- Apply the four ADR-0042 swaps.
- Create ADR-0043 with Context/Decision/Consequences stating the canonical vocabulary and the `task:` field rename.
- Append the 2026-09 log bullet.

**Step 4: Run test to verify pass**

Run: `grep -rniE '\b(phase|stage)' docs/ai/decisions/ADR-0042* docs/ai/decisions/ADR-0043* docs/ai/logs/2026-09.md`

Expected: no output.

Run: `npx tsx .opencode/skills/ai-memory/scripts/ai-memory.ts close-check` — expected clean (plan consistent, log present, ADRs listed, no stale `phase:` signal).

Run: `make check` — expected green (sanity).

**Step 5: Commit**

```sh
git add docs/ai/decisions/ADR-0042-code-agent-standing-contract.md docs/ai/decisions/ADR-0043-workflow-terminology-task-step.md docs/ai/logs/2026-09.md
git commit -m "docs: record canonical task/step vocabulary (ADR-0043) and correct ADR-0042"
```
