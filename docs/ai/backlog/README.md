# AI Backlog

GitHub Issues is the operational source of truth for shared repository tasks. Use issues for active teamwork: create, list, claim, release, and close work.

`tasks.jsonl` remains durable local memory/backlog transition history for repository context and continuity.

Use `/newtask` to create shared tasks as GitHub Issues.
Use `/tasks` for list/claim/release/close operations.

Rule: each person/collaborator should use one responsible agent/session to interact with GitHub Issues for this repository to reduce duplicate updates and race conditions.

## GitHub Issues Workflow

1. **Create**: Use `/newtask <description>` to open a new GitHub Issue.
2. **List available work**: Use `/tasks list` and focus on open issues with `status:to-do` and no assignee.
3. **Claim**: Use `/tasks claim <issue-number>`.
   - First verify the issue is not assigned and does not already have `status:doing`.
   - Then assign yourself and set `status:doing` (remove `status:to-do` if present).
   - Add a short claim comment before implementation.
4. **Release**: Use `/tasks release <issue-number>` when pausing or handing off.
   - Remove self assignee.
   - Set `status:to-do` unless blocked (then set `status:blocked` with a short reason).
5. **Close**: Use `/tasks close <issue-number>` after completion and validation.
   - Ensure acceptance criteria are addressed.
   - Close the issue with a short completion summary comment.

Duplicate-work prevention is process-based: always check assignee and `status:doing` before starting, then claim via assignee + status label + comment.

## Labels

Minimum useful labels:

- Status:
  - `status:to-do`
  - `status:doing`
  - `status:blocked`
- Type:
  - `type:task`
  - `type:feature`
  - `type:bug`
  - `type:docs`
  - `type:chore`
- Priority:
  - `priority:high`
  - `priority:medium`
  - `priority:low`

## Files

- `tasks.jsonl`: One backlog task per line. Each line must be valid JSON.

## Task Schema

Required fields:

- `id`: Stable task id, using `task-NNN`.
- `legacy_id`: Previous id when migrated from another inventory, or `null`.
- `title`: Short actionable title.
- `status`: Current state.
- `priority`: Relative priority.
- `type`: Task kind.
- `area`: Repository area affected.
- `source`: Where the task came from.
- `problem`: Problem or opportunity that motivates the task.
- `goal`: Desired outcome.
- `current_state`: Current known state.
- `affected_components`: Agents, scripts, docs, or config touched by the task.
- `related_files`: Relevant file paths.
- `related_decisions`: Relevant ADR ids.
- `dependencies`: Blocking or related task ids.
- `acceptance_criteria`: Verifiable completion criteria.
- `suggested_next_step`: Next concrete action.
- `risk_if_unresolved`: Risk of leaving the task unresolved.
- `created_at`: Date the task entered the backlog.
- `updated_at`: Date the task was last changed.

Optional fields:

- `mitigation_summary`: Required when `status` is `mitigated`.
- `done_summary`: Required when `status` is `done`.

## Status Values

- `open`: Identified and not started.
- `in_progress`: Currently being worked on.
- `blocked`: Waiting on a decision, dependency, or external input.
- `mitigated`: Partially addressed with controls or policy, but still needs real-world validation.
- `done`: Completed and validated.
- `cancelled`: Explicitly discarded.

## Priority Values

- `critical`: Blocks safe or useful repository operation.
- `high`: Important workflow, quality, or maintainability improvement.
- `medium`: Useful improvement without immediate operational risk.
- `low`: Nice-to-have or cleanup.

## Maintenance Rules

- Keep GitHub Issues as the operational shared tracker.
- Keep `tasks.jsonl` as durable local memory and transition history.
- Add new shared tasks through `/newtask` by default.
- Update `updated_at` whenever a task changes.
- Prefer `mitigated` over `done` when a policy or guardrail has been added but still needs validation in consuming repositories.
- Link ADRs when a task creates or changes durable decisions.
- Do not store raw diffs, transcripts, or long logs in the backlog.
