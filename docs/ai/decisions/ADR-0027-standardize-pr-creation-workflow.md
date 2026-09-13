# ADR-0027: Standardize PR Creation Workflow for Shared Tasks

Date: 2026-06-16 (amended 2026-06-18, 2026-06-18 rev.2, 2026-06-18 rev.3, 2026-06-18 rev.4, 2026-06-18 rev.5, 2026-06-23)
Status: Accepted (partially superseded by ADR-0017)

## Context

The `prclose` workflow (implemented in ADR-0007) creates pull requests from shared GitHub Issues, but lacked standardized conventions for PR titles, body content, and supporting documentation. Without conventions, PRs had inconsistent titles and minimal body content, making review harder.

## Decision

Standardize PR creation in the shared task workflow with these conventions:

1. **PR template file**: Create `.github/pull_request_template.md` with sections for Summary, Testing, and Breaking changes. Each section contains visible italic guidance text (replacing HTML comments) for manual PR creation. The template is used as the fallback PR body when no pre-populated temp file exists.
2. **PR title format**: `[Issue #XX] 'Title of issue #XX'` — includes the issue number in brackets followed by the quoted issue title.
3. **PR body sections**: Every PR body must contain:
   - Summary — describes the change; populated by the agent in the temp file, or a visible placeholder from the template
   - Testing — describes validation performed; populated by the agent, or a visible prompt from the template
   - Breaking changes — lists breaking changes; populated by the agent, or "None." from the template
   - `Fixes #XX` is prepended as bare keyword text (not a heading section) for auto-close on merge
4. **prclose auto-population** — Two-mode workflow:
   - **Agent pre-population mode** (preferred): The agent creates `temp/pr-body-<issue>.md` with fully populated PR content (Fixes, Summary, Testing, Breaking changes). The script detects the existing file and passes it directly to `gh pr create --body-file`.
   - **Template fallback mode**: If no temp file exists, the script reads `.github/pull_request_template.md`, prepends `Fixes #XX`, writes to `temp/pr-body-<issue>.md`, then passes to `--body-file`. If the template is missing, a built-in fallback is used.
   - In both modes, the temp file is cleaned up after PR creation. The hardcoded path is `temp/pr-body-<issue>.md` under the repository root.
5. **Protected branch support**: On `main`, `master`, or `develop` branches, `prclose` auto-creates a `feature/issue-N-slug` branch, stages **all working-tree changes** (`git add -A`: tracked + untracked; gitignored files such as `temp/`, `build/`, `.opencode/`, `.gh-config/` excluded; the staged file list is printed via `git status --porcelain` before committing), commits with `[Issue #N] Title`, pushes, then creates the PR. Because every working-tree change is committed, commit or stash unrelated work before running. On feature branches, the existing clean-tree requirement is preserved.
6. **Documentation location**: Conventions documented in `docs/ai/backlog/README.md` (trimmed to minimal "call the script" reference) and `base/opencode/commands/issue.md` (stripped to 37 lines — script is source of truth).

## Consequences

- All PRs created via `prclose` will have consistent titles and bodies. When an agent pre-populates the temp file, the body contains real content. When no temp file exists, the body defaults to the template or built-in fallback.
- The temp file at `temp/pr-body-<issue>.md` is the contract between agent and script: the agent writes it, the script consumes it. After PR creation, the file is cleaned up.
- Manual PR creation (outside prclose) benefits from `.github/pull_request_template.md` with visible italic guidance.
- ~~The `gh-issue` scripts for both bash and PowerShell must be kept in sync for all future changes.~~ *(Superseded 2026-06-23 by ADR-0017: single TypeScript `gh-issue.ts` replaces both scripts.)*
- Protected branch auto-branching reduces friction — users no longer need to manually create feature branches before running prclose on main/master/develop.

## Alternatives Considered

- **Keep conventions documentation-only without a template file**: Rejected — the template file provides immediate structure for manual PR creation and serves as the fallback body.
- **Use only a GitHub PR template without prclose changes**: Rejected — prclose is the primary PR creation path for shared tasks and should produce structured output directly.
- **Read the template at runtime**: Initially implemented, then reversed. The template had HTML comments that produced empty rendered sections. Switching to temp-file-based body construction eliminated the template dependency.
- **Populate Summary from issue body**: Initially implemented, then reversed. Issue bodies contain ACs, open questions, detailed context that is not appropriate for a PR Summary.
- **Hardcode body in scripts**: Reversed. Two-mode approach (agent pre-population or template fallback via temp file) keeps scripts generic and content flexible.
- **Auto-generate body content by analyzing commits**: Rejected — premature complexity; structured sections let agents populate meaningful context that automation cannot derive reliably.
