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
- Key patterns: `base/opencode/**` and `base/AGENTS.md` are reusable source-of-truth; `base/AGENTS.md` stays generic with placeholders for onboarding; root `AGENTS.md` is curated repo-specific guidance for this repository; `.opencode/**` and root `opencode.jsonc` are generated/local runtime artifacts

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
- Review requirements: review source templates and installer logic rather than generated local output where possible; include git diff evidence, relevant local validation, and keep root `AGENTS.md` aligned with this repository's actual guidance while preserving generic placeholders in `base/AGENTS.md`

## Workflow & Engineering Rules

The `planner` agent is the single source of truth for workflow rules, progressive disclosure, repository boundary, engineering rules, validation rules, and definition of done. These are runtime invariants enforced by planner at plan, handoff, and review time. Agent files carry their own Repository Boundary section for safety. See the installed planner agent for the canonical ruleset.
