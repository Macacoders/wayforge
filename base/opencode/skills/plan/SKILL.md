---
name: plan
description: Investigate a repository and produce a grounded, executable implementation plan of outcome-based task contracts. Use when an approved intent needs concrete, independently reviewable tasks.
compatibility: opencode
metadata:
  workflow: plan
  agents: planner-research
---

# Plan

Use this skill to turn an approved intent into an implementation plan made of outcome-based task
contracts.

## Planning

For this turn, you are planning only.

- Do not implement code.
- Do not edit project files except the plan markdown file under `docs/ai/plans/`.
- Do not run mutating terminal commands, commit, push, or perform external actions.
- You may inspect the repo or other context with read-only commands/tools when needed.

---

# Writing the Plan Well

The rest of this skill is the craft of authoring a *good* implementation plan — the content that goes
inside the markdown file.

Assume the implementer is a skilled developer who knows almost nothing about the toolset or problem
domain. A good plan makes implementation obvious; it does not script it.

## Task Economy

Classify scope as `single-task`, `multi-task`, `too-large`.

- Prefer 1 task for a single coherent outcome; add tasks only when deliverables are genuinely
  separable.
- A task is a coherent, independently reviewable outcome that one focused agent execution can
  reasonably complete. It is not a file-count or minute-count rule, and it is not a multi-feature
  epic.
- Prefer vertical slices over horizontal layers unless architecture requires otherwise.
- More than 3 tasks requires a Task budget rationale.
- 6–8 tasks requires user confirmation before implementation handoff.
- More than 8 tasks is `too-large`: do not create one plan; propose a split into independently
  plannable pieces.

**Too fine** — three tasks for one deliverable:

```markdown
### Task 1: Create User model
### Task 2: Add password hash field
### Task 3: Create password hashing utility
```

**Right** — one reviewable outcome:

```markdown
### Task 1: Password login works end to end
(model field, hashing utility, endpoint, and tests)
```

## Task Contracts

Each task states a deliverable and how it is judged. The implementer decides the coding steps; the
planner decides the outcome and the guardrails.

Required fields:

- **ID** — stable (`Task 1`, `Task 2`). Never renumber after implementation starts.
- **Objective** — the single outcome the task delivers, in one or two sentences.
- **Context** — the repository facts an implementer needs and does not have: relevant paths and
  symbols, existing patterns, utilities, or tests to reuse, and prior decisions.
- **Acceptance criteria** — observable conditions a reviewer can verify against the diff and the
  tests. Write "X behaves like Y when Z", not "implement X". Do not manufacture a criterion for an
  unresolved product or architectural choice; identify the decision and its approval authority instead.
- **Constraints** — scope limits, invariants, what must not change, and the reuse expectation.
- **Depends on** — task IDs that must be `accepted` first, or `none`.
- **Validations** — commands with an owner (`agent` or `human`), only where the task needs something
  beyond the repository default.

When a task affects a shared configuration constraint, resource budget, API schema, serialization
format, or integration assumption, identify the affected documented contract and available counterpart
in its context. This supplies focused task-review evidence; it does not add a phase gate. Declare a
phase integration gate separately only when cross-task integration acceptance is actually needed.

Do **not** prescribe a fixed step sequence, a test-first order, or the commit command — `delivery`
commits. Do keep concrete technical detail where it genuinely matters: mandatory interfaces,
architectural invariants, known regressions, repository conventions, and the exact files for
boundary-sensitive changes.

## Validation Ownership

Every planned validation has an owner: `agent` or `human`.

- `agent`: bounded, non-interactive, safe validations that terminate on their own — targeted tests,
  linting, static analysis, type checks, ordinary local builds.
- `human`: containers, long-running processes, external infrastructure, deployment,
  interactive/manual verification, or commands that may block or need supervision.

Agents MUST NOT execute human validations; they report the exact command and expected result. If
ownership is uncertain, classify as `human`.

## Phases (optional)

- A phase is a logical milestone that groups related tasks and, when needed, declares integration
  acceptance criteria.
- A phase is not an execution barrier: task dependencies control scheduling, and only an explicit
  integration gate blocks progression.
- Do not create phases for simple plans where they add nothing.

## Plan Document Structure

Save the plan under `./docs/ai/plans/YYYY-MM-DD_HHMMSS-<slug>.md`:

```markdown
---
status: planned | in-progress | completed | superseded
created: YYYY-MM-DD
task: 0/<total>
required_gates:
  architect_review: true | false
  memory_update: true | false
---

# [Feature name] Implementation plan

**Goal:** [One sentence describing what this delivers]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Scope classification:** [`single-task` | `multi-task`]

**Plan acceptance criteria:**
- [What must be true when the whole plan is delivered]

## Phase 1: [Milestone name] (optional)

**Integration acceptance criteria:** [What must hold across this phase's tasks, or omit the section
when no integration gate is needed]

### Task 1: [Descriptive name]

**Status:** pending
**Depends on:** none

**Objective:** [One or two sentences]

**Context:**
- `path/to/file` — [why it matters]
- Reuse: [existing pattern, utility, or test to follow]

**Acceptance criteria:**
- [Observable condition]

**Constraints:**
- [Invariant, scope limit, or thing that must not change]

**Validations:**
- `agent`: `npx vitest run path/to/test` — expected: passes
- `human`: [command or procedure] — expected: [observable result]

**Proposed commit message:** `type: description`
```

Frontmatter notes:

- `task:` is a summary progress cursor. `delivery` tracks authoritative per-task state in each task's
  `**Status:**` line (`pending | in-progress | accepted | blocked`).
- `required_gates` is optional. Set it at approval time and only for gates the plan actually needs;
  `delivery` checks the gates declared and nothing else.
- Plans written before ADR-0048 have neither per-task `**Status:**` lines nor `**Depends on:**` fields.
  Read them, plan on top of them, and leave the older tasks alone; `delivery` derives and backfills
  those fields at execution time (see `delivery-policy`). Do not migrate historical plans by hand.

**A good plan makes implementation obvious without scripting it.**
