# ADR-0007: Use GitHub Issues As Operational Shared Task Tracker

Date: 2026-05-14
Status: Accepted

## Context

Shared repository tasks were tracked in `docs/ai/backlog/tasks.jsonl`, which is durable and auditable but not ideal for concurrent team coordination (claiming, releasing, and closing work in real time).

## Decision

Use GitHub Issues as the operational source of truth for shared team tasks in this repository.

- `/newtask` creates GitHub Issues for normal shared tasks.
- `/tasks` manages shared task operations: `list`, `claim`, `release`, `close`.
- Status is tracked with labels (`status:to-do`, `status:doing`, `status:blocked`) plus assignee state.
- Duplicate-claim prevention is process-based: verify assignee and `status:doing`, then assign + label + comment before implementation.
- Each person/collaborator uses one responsible agent/session for GitHub Issue interactions in this repository.
- Credentials policy for issue operations (superseded; historical rationale):
  - Each collaborator uses their own fine-grained token scoped to this repository only.
  - Minimum permissions are Metadata (read-only) and Issues (read/write).
  - Tokens are not shared and broad/global `gh` credentials were not used for shared task operations.
  - Repository-local `GH_CONFIG_DIR` was used with explicit repository targeting.
  - Repository resolution order is `GH_REPO` first, otherwise derive `OWNER/REPO` from `git remote get-url origin`.
  - Do not require `gh repo view` because issue-scoped tokens may not have broader repository permissions.

Open unresolved tasks from `docs/ai/backlog/tasks.jsonl` were migrated to GitHub Issues, and the local JSONL backlog was removed. Durable task state now belongs in GitHub Issues; durable design context belongs in ADRs, plans, architecture notes, and short logs.

## Credential-policy supersession (2026-10-27)

Only the credential-policy subsection above is superseded. Its original
repository-local credential rationale is retained as historical context; the
decision to use GitHub Issues as the shared-task tracker remains accepted.

Per ADR-0016's 2026-10-27 reversal, the current credential contract is
`GITHUB_TOKEN` → `GH_TOKEN` → optional internal `gh auth token` fallback.
Environment tokens remain suitable for fine-grained, repository-scoped access;
the fallback uses an already-authenticated, machine-wide `gh` login. Refer to
ADR-0016 for the current migration and credential-handling boundary.

## Consequences

- Team coordination improves through native issue assignment, comments, and status labels.
- Task workflow docs and command contracts must stay aligned with GitHub Issues operations.
- Durable task state lives in GitHub Issues; historical local JSONL context remains available through git history when needed.

## Alternatives Considered

- Keep `tasks.jsonl` as the only shared tracker: rejected due to higher duplicate-work risk in concurrent collaboration.
- Introduce GitHub Projects immediately: rejected for now to keep the workflow minimal; labels are sufficient initially.
