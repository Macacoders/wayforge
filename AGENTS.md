# AGENTS.md

## Mission

Use the installed OpenCode workflows to onboard repositories and deliver minimal, reviewed, and documented changes. Staged delivery is the default conservative path; quick delivery handles clear, small, low-risk tasks via `/quick` or proactive planner suggestion.

## AI Memory Index

This file is the practical entrypoint for AI agents working in this repository. For durable memory (architecture, decisions, approved plans, and logs), see `docs/ai/README.md`.

Treat `docs/ai/README.md` as a tiny router. Do not load all memory files by default; use `/memory` (planner) or `memory-maintenance` for low-token lookup/freshness/update routing.

## Repository Guidance

### Project Overview

`ai-config` is a project-local OpenCode/Kilo Code configuration repository. It provides reusable workflow sources, installer scripts, and durable AI-memory conventions for repositories that want staged delivery, quick delivery, progressive disclosure, and shared GitHub Issue task workflows. The main users are maintainers of this repo and maintainers of consuming repositories that install this configuration. Start with `README.md` for the installation model and workflow contract.

### Build/Test Commands

- Build/generate installed output: `./install/bootstrap.sh --repo /path/to/repo --providers openai` or `./install/bootstrap.sh --repo /path/to/repo --runtime kilocode --providers openai`; PowerShell equivalent: `./install/bootstrap.ps1 -Repo /path/to/repo -Providers openai`
- Preview changes safely: `./install/bootstrap.sh --repo /path/to/repo --dry-run` or `./install/bootstrap.ps1 -Repo /path/to/repo -DryRun`
- Test: no dedicated automated test suite was found; use targeted validation such as `bash -n install/bootstrap.sh` and PowerShell parsing/smoke checks when `pwsh` is available
- Lint/format: no repo-wide linter/formatter config was found; preserve existing Markdown, Bash, PowerShell, YAML, and JSONC formatting conventions
- Run locally: source `install/bashrc_snippet.sh` or `install/powershell_profile_snippet.ps1` to expose `ai-setup-repo` and `ai-setup-repo-dry-run` helpers

### Code Style & Conventions

- Language/Framework: Markdown, Bash, PowerShell, JSONC, YAML; OpenCode/Kilo Code agent/command/skill configuration
- Style guide: keep docs concise and operational; preserve progressive disclosure; keep workflow contracts explicit; prefer the smallest safe diff
- Formatter: no enforced formatter found; match surrounding style and indentation
- Key patterns: `base/opencode/**` and `templates/**` are reusable source-of-truth; `templates/AGENTS.md` stays generic with placeholders for onboarding; root `AGENTS.md` is curated repo-specific guidance for this repository; `.opencode/**` and root `opencode.jsonc` are generated/local runtime artifacts

### Testing Expectations

- Test framework: no dedicated framework found in this repository
- Coverage target: none documented
- Test types: script syntax checks, dry-run installer verification, git diff review, and targeted runtime checks in a consuming repository when installer behavior changes
- CI requirements: no tracked GitHub Actions workflow was found during onboarding; before merge, run the smallest relevant local checks and record exactly what was and was not validated

### Security Notes

- Secrets handling: never commit `.env*`, `.gh-config/`, tokens, or generated auth state; OpenAI and GitHub Copilot auth should be established in OpenCode via `/connect`; laberit credentials live in local environment variables such as `OPENAI_BASE_URL` and `OPENAI_API_KEY`
- Auth patterns: OpenCode `/connect` for model providers; fine-grained GitHub token for shared-task issue operations, ideally through repository-local `GH_CONFIG_DIR`
- Sensitive data: this repo should store templates and workflow logic, not live credentials; consuming repositories receive generated config, but secrets remain local
- Dependencies: prefer conservative script/docs changes, inspect generated-surface implications carefully, and avoid editing `.opencode/node_modules` or other local runtime artifacts

### Deployment

- Platform: not a deployed service; this repository is consumed by local/project-level installs into target repositories
- Environments: source repository (`ai-config`) plus generated runtime output in consuming repositories; supported runtimes are OpenCode (default) and Kilo Code
- CI/CD: issue template exists under `.github/ISSUE_TEMPLATE/`; no tracked GitHub Actions workflow was found during onboarding
- Release process: manual repository updates, then rerun installer scripts in consuming repositories; use `--dry-run` first and `--force` only when intentionally refreshing managed runtime trees

### PR/Commit Guidance

- Commit format: no enforced convention was found; use concise imperative subjects that describe the affected area, for example `docs: clarify installer guidance`
- PR template: no PR template was found; summarize workflow impact, source-vs-generated surface touched, validation run, and any follow-up needed in consuming repositories
- Branch naming: no enforced convention was found; use short descriptive names
- Review requirements: review source templates and installer logic rather than generated local output where possible; include git diff evidence, relevant local validation, and keep root `AGENTS.md` aligned with this repository's actual guidance while preserving generic placeholders in `templates/AGENTS.md`

## Workflow

1. Use `planner` for orchestration, questions, workflow selection, planning, handoffs, and git-based review.
2. Use `/plan` for staged delivery when work needs onboarding, planning, architecture or safety review, multiple phases, or has meaningful regression risk.
3. Use `/quick` for quick delivery when the task is clear, small, low-risk, and safely validated with local checks. `planner` may also proactively suggest quick delivery for clearly eligible tasks, but must ask for explicit user confirmation before proceeding.
4. Use `research` for repository onboarding before planning changes in unfamiliar repos.
5. For staged delivery, use one `code` child session per approved phase; `code` stops after each atomic stage and waits for manual validation.
6. Keep staged plans compact: phases are reviewable deliverables, not technical microtasks.
7. Justify plans with more than 3 phases, require explicit confirmation for 6-8 phases, and split work that appears to require more than 8 phases.
8. For quick delivery, `planner` may invoke `quickcode` for one approved low-risk task; `quickcode` works without staged pauses and reports once for planner review.
9. Escalate quick delivery back to staged delivery if scope, risk, validation, or acceptance criteria become unclear.
10. Use `test` when completed changes need critical testing review or regression coverage.
11. Use `/issue` to create and manage shared repository tasks as GitHub Issues.
12. Update durable memory under `docs/ai/` only for onboarding findings, backlog tasks, approved plans, decisions, architecture changes, and short logs.
13. Use `/memory` (planner) or `memory-maintenance` for low-token memory find/check/update routing.

## Progressive Disclosure

- Read this file and the repository `README.md` first.
- Read `docs/ai/README.md` before loading other AI memory.
- Use GitHub Issues through `/issue` when selecting or creating repository improvement tasks.
- Load only task-relevant plans, ADRs, architecture notes, or logs.
- Run onboarding before implementation planning if `docs/ai/` memory is missing or stale.
- Pass compact handoff briefs with paths and reasons to load references.
- Do not paste full docs, diffs, logs, or chat transcripts into handoffs.

## Repository Boundary

- Treat the installed target repository root as the default boundary for searches, reads, edits, and commands.
- Do not operate outside that root unless the user explicitly approves the external path.
- Include `Repository root:` in handoffs so child agents inherit the boundary.
- Require explicit user approval before reviewing cross-repository or external paths.

## Engineering Rules

- Prefer the smallest correct change.
- Prefer the fewest phases that preserve clear acceptance criteria and safe review.
- Preserve unrelated user changes in the worktree.
- Avoid speculative abstractions and broad refactors.
- Update documentation when behavior, configuration, or workflows change.
- Do not commit unless the user explicitly asks.

## Validation Rules

- Start with checks closest to the changed code.
- For staged delivery, propose manual validation commands after each atomic stage.
- For quick delivery, report validation run and any validation still recommended in the single completion report.
- Prefer existing safe validation before recommending new tests.
- Create or request new tests only for concrete uncovered regression risk tied to observable behavior.
- Keep test budgets explicit and minimal; use `none` when new tests are not approved or not needed.
- For low-risk, docs-only, mechanical, or configuration-only changes, a clear no-test rationale is acceptable.
- Report exactly what was run and what was not run.
- Treat missing validation as a review risk.

## Definition Of Done

- The approved phase acceptance criteria are satisfied.
- Staged-delivery manual checkpoints were offered between atomic stages, or quick-delivery results received planner review.
- Relevant tests, existing validation, or a no-test rationale were reviewed.
- Documentation and durable AI memory are updated when needed.
- The final handoff includes changed files, validation, risks, and a proposed commit message.
