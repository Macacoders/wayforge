# ADR-0011: Standardize PR Creation Workflow for Shared Tasks

Date: 2026-06-16 (amended 2026-06-18, 2026-06-18 rev.2)
Status: Accepted

## Context

The `prclose` workflow (implemented in ADR-0007) creates pull requests from shared GitHub Issues, but lacked standardized conventions for PR titles, body content, and supporting documentation. Without conventions, PRs had inconsistent titles and minimal body content, making review harder.

## Decision

Standardize PR creation in the shared task workflow with these conventions:

1. **PR template file**: Create `.github/pull_request_template.md` with sections for Summary, Testing, and Breaking changes. Each section contains visible italic guidance text (replacing HTML comments) for manual PR creation. Template is *not* read by prclose at runtime — it is preserved for manual PR creation only.
2. **PR title format**: `[Issue #XX] 'Title of issue #XX'` — includes the issue number in brackets followed by the quoted issue title.
3. **PR body sections**: Every PR body must contain:
   - Summary — populated from the issue body, or a descriptive fallback if the issue body is empty
   - Testing — visible italic prompt (not invisible HTML comment) for reviewers to fill in
   - Breaking changes — defaults to "None."
   - `Fixes #XX` is prepended as bare keyword text (not a heading section) for auto-close on merge
4. **prclose auto-population**: Both `gh-issue` scripts (bash and PowerShell) construct the PR body dynamically:
   - Fetch the issue body via `gh issue view --json body`
   - If the issue body is empty or null, use a descriptive fallback
   - Build the body with `Fixes #XX`, `## Summary`, issue body, `## Testing` (visible prompt), `## Breaking changes` (default "None.")
   - No template file is read at runtime; the template exists for manual PR creation only
5. **Protected branch support**: On `main`, `master`, or `develop` branches, `prclose` auto-creates a `feature/issue-N-slug` branch, stages changes, commits with `[Issue #N] Title`, pushes, then creates the PR. On feature branches, the existing clean-tree requirement is preserved.
6. **Documentation location**: Conventions documented in `docs/ai/backlog/README.md` (trimmed to minimal "call the script" reference) and `base/opencode/commands/issue.md` (stripped to 37 lines — script is source of truth).

## Consequences

- All PRs created via `prclose` will have consistent titles and bodies with real issue content as the Summary, visible guidance for Testing, and a "None." default for Breaking changes.
- Scripts are decoupled from the template file — editing the template does not affect prclose output, and vice versa.
- Manual PR creation (outside prclose) benefits from the same `.github/pull_request_template.md` template with visible italic guidance.
- The `gh-issue` scripts for both bash and PowerShell must be kept in sync for all future changes.
- Protected branch auto-branching reduces friction — users no longer need to manually create feature branches before running prclose on main/master/develop.

## Alternatives Considered

- **Keep conventions documentation-only without a template file**: Rejected — the template file provides immediate structure for manual PR creation.
- **Use only a GitHub PR template without prclose changes**: Rejected — prclose is the primary PR creation path for shared tasks and should produce structured output directly.
- **Read the template at runtime**: Initially implemented, then reversed. The template had HTML comments that produced empty rendered sections. Switching to dynamic body construction eliminated the template dependency and allowed real issue body content to populate the Summary.
- **Auto-generate body content by analyzing commits**: Rejected — premature complexity; structured sections with visible prompts let users fill in context that automation cannot capture reliably.
