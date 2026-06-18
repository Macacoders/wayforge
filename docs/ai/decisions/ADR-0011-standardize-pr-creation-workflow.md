# ADR-0011: Standardize PR Creation Workflow for Shared Tasks

Date: 2026-06-16 (amended 2026-06-18)
Status: Accepted

## Context

The `prclose` workflow (implemented in ADR-0007) creates pull requests from shared GitHub Issues, but lacked standardized conventions for PR titles, body content, and supporting documentation. Without conventions, PRs had inconsistent titles and minimal body content, making review harder.

## Decision

Standardize PR creation in the shared task workflow with these conventions:

1. **PR template file**: Create `.github/pull_request_template.md` with sections for Summary, Testing, and Breaking changes. Each section contains detailed comment guidance.
2. **PR title format**: `[Issue #XX] 'Title of issue #XX'` — includes the issue number in brackets followed by the quoted issue title.
3. **PR body sections**: Every PR body must contain:
   - Summary — describes the purpose and scope
   - Testing — describes validation performed
   - Breaking changes — lists any breaking changes (or "None")
   - `Fixes #XX` is prepended as bare keyword text (not a heading section) for auto-close on merge
4. **prclose auto-population**: Both `gh-issue` scripts (bash and PowerShell) read the `.github/pull_request_template.md` template at runtime, prepend `Fixes #XX` as bare keyword text, and use the combined content as the PR body. Users edit the body sections after PR creation to fill in details.
5. **Documentation location**: Conventions documented in `docs/ai/backlog/README.md` (PR Creation Standards section) and `base/opencode/commands/issue.md` (prclose conventions subsection).

## Consequences

- All PRs created via `prclose` will have consistent titles and bodies populated from the template with `Fixes #XX` prepended.
- Users must edit the template's detailed placeholder sections after PR creation to add meaningful content.
- Manual PR creation (outside prclose) benefits from the same `.github/pull_request_template.md` template with detailed comment guidance.
- The `gh-issue` scripts for both bash and PowerShell must be kept in sync for any future changes to the template-reading logic.
- The template file and script body generation are now linked: changes to the template automatically affect `prclose`-generated PR bodies.

## Alternatives Considered

- **Keep conventions documentation-only without a template file**: Rejected — the template file provides immediate structure for manual PR creation.
- **Use only a GitHub PR template without prclose changes**: Rejected — prclose is the primary PR creation path for shared tasks and should produce structured output directly, but the template is now consumed at runtime for consistency.
- **Hardcode the full body in the script instead of reading the template**: Rejected — this caused the reported bug where PR bodies were not populated with the template's detailed comments; prclose now reads the template at runtime.
- **Auto-generate body content by analyzing commits**: Rejected — premature complexity; placeholder sections let users fill in manual context that automation cannot capture reliably.
