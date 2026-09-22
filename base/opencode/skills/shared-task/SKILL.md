---
name: shared-task
description: Use for shared GitHub Issues workflow via /issue and the gh-issue helper.
compatibility: opencode
metadata:
  workflow: issue
---

# Shared Task GitHub Issues Helper

Reference for the `gh-issue.ts` CLI that backs `/issue`.

Run as: `npx tsx .opencode/skills/shared-task/scripts/gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] <operation> [args]`

## Operations

### list

List open issues (pull requests filtered out). Prints `#<n>\t<title>\tassignee:<login>\t<status-labels>` per issue. Requires the required labels to exist.

### create `<title>` [`--body-file <path>`] [`--label <name>`]...

Create an issue. `--body-file` reads the body from a file (e.g. `temp/issue-<slug>.md`); `--label` may be repeated. Validates that all required labels exist, then prints the issue URL.

### claim `<issue-number>`

Assign the issue to the current user, set `status:doing`, drop `status:to-do`, and comment. Fails if the issue is already assigned or already `status:doing`.

### assign `<issue-number>` `<collaborator>`

Same as `claim`, but assigns to `<collaborator>`.

### release `<issue-number>` [`--blocked <reason>`]

Unassign the current user and drop `status:doing`. With `--blocked <reason>`, sets `status:blocked`; otherwise returns to `status:to-do` (dropping `status:blocked` and `status:in-review`).

### close `<issue-number>` [`completion-summary`]

Comment (default `"Completed and validated."`), drop all status labels, and close the issue.

### prclose `<issue-number>` [`completion-summary`]

Create a pull request for the issue. Requires an active local branch and (on non-protected branches) a clean working tree. On a protected branch (`main`/`master`/`develop`) it auto-creates `feature/issue-<n>-<slug>`, commits, and pushes. The PR body is `temp/pr-body-<issue>.md` when present, else `.github/pull_request_template.md`, else default Summary / Testing / Breaking changes sections. Prints the PR URL, comments on the issue, and sets `status:in-review`.

### show `<issue-number>`

Print title, state, assignees, labels, and body. For issue comments, use `gh issue view <number>`.

### check

Verify GitHub access. Prints `OK: GitHub access verified for <repo>`.

### labels-check

Verify that all required labels exist; lists any missing labels and exits 1 if any are missing.

## Output conventions

- `create` and `prclose` print the resulting URL on success.
- `claim`, `assign`, `release`, and `close` are silent on success (exit 0).
- `--json` emits machine-readable JSON instead of human-readable output.
- `--dry-run` prints the intended actions to stderr without mutating anything.
- Failures print to stderr with exit 1 — check the exit code if captured output looks incomplete.

## Safety minimums

- Authentication uses the GitHub App Device Flow via `gh-app-auth.ts`. First use requires browser authorization; the token is cached for subsequent runs.
- Set `GITHUB_TOKEN` to bypass app authentication.
- Required labels must already exist:
  - Status: `status:to-do`, `status:doing`, `status:in-review`, `status:blocked`
  - Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
  - Priority: `priority:high`, `priority:medium`, `priority:low`
- Do not auto-create labels.
- Do not use `gh repo view`.
- Do not mutate issues without clear user intent.
