---
name: shared-task
description: Use for shared GitHub Issues workflow via /issue and the gh-issue helper.
compatibility: opencode
metadata:
  workflow: issue-github-issues
---

# Shared Task GitHub Issues Helper

Reference for the `gh-issue.ts` CLI that backs `/issue`.

Run as: `npx tsx .agents/skills/shared-task/scripts/gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] <operation> [args]`

## Operations

### list

List open issues (pull requests filtered out). Prints `#<n>\t<title>\tassignee:<login>\t<status-labels>` per issue. Requires the required labels to exist.

### create `<title>` [`--body-file <path>`] [`--label <name>`]...

Create an issue. `--body-file` reads the body from a file (e.g. `temp/issue-<slug>.md`); `--label` may be repeated. Validates that all required labels exist, then prints the issue URL.

### edit `<issue-number>` [`--title <title>`] [`--body-file <path>`] [`--add-label <name>`]... [`--remove-label <name>`]...

Update the title, body, and/or labels of an existing open issue. Requires at least one of `--title`, `--body-file`, `--add-label`, or `--remove-label`; rejects pull requests and closed issues. The issue number must be a positive integer, unknown options and options missing their value are rejected, and empty or whitespace-only `--title`, `--add-label`, and `--remove-label` values are rejected. `--body-file` requires a non-empty path, resolves relative to cwd unless absolute, and an empty file is a valid way to clear the body. All four value flags accept `--flag=value`; repeated label additions and removals are deduplicated, and supplying the same label to both is rejected. Argument validation, including `--dry-run`, happens before any API call. On a real run, if any label is added the repository must contain the full required label set, added labels must already exist in the repo, and removed labels must already be present on the issue (no auto-create). Title and/or body are applied together in one PATCH; labels are then added one request at a time and removed one request at a time (no transaction — see `Safety minimums`). `--dry-run` validates the arguments, prints intended actions to stderr, and does not fetch the issue or check label state. Success prints the issue URL; `--json` prints `{ number, url, updated_fields }` where `updated_fields` lists `title`, `body`, `label+<name>`, and `label-<name>` in applied order; failures print to stderr with exit 1. Case-sensitive label matching and shared output behavior are covered by `Safety minimums` and `Output conventions`.

### claim `<issue-number>`

Assign the issue to the current user, set `status:doing`, drop `status:to-do`, and comment. Fails if the issue is already assigned or already `status:doing`.

### assign `<issue-number>` `<collaborator>`

Same as `claim`, but assigns to `<collaborator>`.

### release `<issue-number>` [`--blocked <reason>`]

Unassign the current user and drop `status:doing`. With `--blocked <reason>`, sets `status:blocked`; otherwise returns to `status:to-do` (dropping `status:blocked` and `status:in-review`).

### close `<issue-number>` [`completion-summary`]

Comment (default `"Completed and validated."`), drop all status labels, and close the issue.

### prclose `<issue-number>` [`completion-summary`]

Create a pull request for the issue. Requires an active local branch and (on non-protected branches) a clean working tree. The current branch must already exist on `origin` — push it first, because `prclose` only pushes a branch it auto-creates itself. On a protected branch (`main`/`master`/`develop`) it auto-creates `feature/issue-<n>-<slug>`, commits, and pushes. The PR body is `temp/pr-body-<issue>.md` when present, else `.github/pull_request_template.md`, else default Summary / Testing / Breaking changes sections. Prints the PR URL, comments on the issue, and sets `status:in-review`. After creating the PR it requests a review from the `wayforge-maintainers` team; if that request fails (e.g. the team does not exist in the repo's org), it only prints a warning to stderr and the command still succeeds. Also rejects pull request numbers before any branch/commit side effect.

### show `<issue-number>`

Print title, state, assignees, labels, and body. For issue comments, use `gh issue view <number>`.

### check

Verify GitHub access. Prints `OK: GitHub access verified for <repo>`.

### labels-check

Verify that all required labels exist; lists any missing labels and exits 1 if any are missing.

## Output conventions

- `create`, `edit`, and `prclose` print the resulting URL on success.
- `claim`, `assign`, `release`, and `close` are silent on success (exit 0).
- `--json` emits machine-readable JSON instead of human-readable output; for `edit` it emits `{ number, url, updated_fields }` where `updated_fields` lists the applied changes (e.g. `["title","body","label+status:blocked","label-status:to-do"]`).
- `--dry-run` prints the intended actions to stderr without mutating anything.
- Failures print to stderr with exit 1 — check the exit code if captured output looks incomplete.

## Safety minimums

- Credential resolution is `GITHUB_TOKEN`, then `GH_TOKEN`, then an internal
  `gh auth token` lookup. Use a fine-grained, repository-scoped PAT for the
  environment variables, or use `gh auth login` only when a machine-wide
  GitHub CLI credential is appropriate.
- Agents must not print tokens, put them in files or prompts, or run
  `gh auth token` directly. The helper performs its private fallback without
  forwarding credential output.
- Required labels must already exist:
  - Status: `status:to-do`, `status:doing`, `status:in-review`, `status:blocked`
  - Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
  - Priority: `priority:high`, `priority:medium`, `priority:low`
- Do not auto-create labels.
- Mutating commands (`claim`, `assign`, `release`, `close`, `prclose`, `edit`) reject pull request numbers; `show` is read-only and still accepts them. `--dry-run` does not resolve the target, so PR rejection applies to real runs only.
- Label names are matched case-sensitively (repo labels, issue labels, and `edit` add/remove conflicts) — keep this behavior for consistency with `ensureRequiredLabels`.
- `edit` validates its arguments before the first mutation, but a network/5xx failure between sequential API calls can still leave earlier changes applied (the REST API has no transaction).
- Do not use `gh repo view`.
- Do not mutate issues without clear user intent.
