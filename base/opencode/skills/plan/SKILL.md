---
name: plan
description: Investigate a repository and produce a grounded, executable implementation plan through phased delivery. Use when an approved intent needs to be turned into concrete, bite-sized tasks.
compatibility: opencode
metadata:
  workflow: plan
  agents: planner-research
---

# Plan

Use this skill to investigate a repository and produce a grounded, executable implementation plan through phased delivery.

## Planning

For this turn, you are planning only.

- Do not implement code.
- Do not edit project files except the plan markdown file.
- Do not run mutating terminal commands, commit, push, or perform external actions.
- You may inspect the repo or other context with read-only commands/tools when needed.

---

# Writing the Plan Well

The rest of this skill is the craft of authoring a *good* implementation plan — the content that goes inside the markdown file above.

Assume the implementer is a skilled developer but knows almost nothing about the toolset or problem domain. Assume they don't know good test design very well.

**Core principle:** A good plan makes implementation obvious. If someone has to guess, the plan is incomplete.

## Task Economy

Classify scope as `quick-sized`, `single-task`, `multi-task`, `too-large`.

- Prefer 1 task for simple or single-outcome work; 2–3 tasks for meaningfully separable deliverables.
- Tasks are reviewable deliverables, not technical steps. Keep related files, helpers, validation, and docs within their owning task.
- Prefer vertical slices over horizontal layers unless architecture requires otherwise.
- More than 3 tasks requires a Task budget rationale.
- 6–8 tasks requires user confirmation before implementation handoff.
- More than 8 tasks is too-large: do not create an implementation plan; propose a split into smaller independently plannable tasks.

## Bite-Sized Task Granularity

**Each task = 2-5 minutes of focused work.**

Every step is one action:
- "Establish expected behaviour" — step
- "Add or update validation" — step
- "Write minimal implementation" — step
- "Run test to verify pass" — step
- "Commit" — step

**Too big:**
```markdown
### Task 1: Build authentication system
[50 lines of code across 5 files]
```

**Right size:**
```markdown
### Task 1: Create User model with email field
[10 lines, 1 file]

### Task 2: Add password hash field to User
[8 lines, 1 file]

### Task 3: Create password hashing utility
[15 lines, 1 file]
```

## Plan Document Structure

Once Discovery is confirmed, propose a phased plan using this structure, and save it under `./docs/ai/plans/YYYY-MM-DD_HHMMSS-<slug>.md`:

```md
---
status: planned | in-progress | completed | superseded
created: YYYY-MM-DD
task: <n>/<total>        # current task / total tasks
required_gates:            # optional; set at plan-approval time
  test_verdict: true | false
  architect_review: true | false
  memory_update: true | false
---

# [Feature name] Implementation plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Scope classification:** [`quick-sized` | `single-task` | `multi-task` | `too-large`]

## Tasks

### Task N: [Descriptive Name]

**Objective:** What this task accomplishes (one sentence)

**Files:**
- Create: `path/to/file` 
- Modify: `path/to/file[:location]` 
- Validate: `path/to/test-or-validation-target`

**Step 1: Establish expected behaviour**

Describe the behavior, invariant, acceptance condition, or regression being addressed.

**Step 2: Add or update validation**

Specify the appropriate test, check, build, lint, type-check, manual verification, or existing validation path.

**Step 3: Write minimal implementation**

Describe the minimal code/configuration/documentation changes required, including relevant symbols or components.

**Step 4: Run test to verify pass**

Run: `<command(s)>` 
Expected: `<passing checks and observable behavior>`

**Step 5: Commit**

`git add [files]`
`git commit -m "type: description"`

```

**A good plan makes implementation obvious.**