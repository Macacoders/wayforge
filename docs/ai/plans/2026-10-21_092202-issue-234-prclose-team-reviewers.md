---
status: in-progress
created: 2026-10-21
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Request `wayforge-maintainers` team review on prclose Implementation plan

**Goal:** Make `prclose` request a review from the `wayforge-maintainers` GitHub team whenever it creates a pull request, without making an otherwise successful `prclose` fail if the review request cannot be completed.

**Architecture:** Add one exported constant and one small helper to `gh-issue.ts`. After the PR is created and assigned, `cmdPrclose` calls `POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` with `team_reviewers: ['wayforge-maintainers']`. The helper catches API errors and writes a warning to stderr, so the existing PR creation, issue comment, and `status:in-review` transitions still complete. Existing full-flow tests get the new endpoint in their fetch mocks; new tests assert the request body and the non-fatal failure path.

**Tech Stack:** TypeScript run via `tsx`, native `fetch`, GitHub REST API v2022-11-28, Vitest 4.

**Scope classification:** `single-task`

## Verified facts

- `cmdPrclose` lives in `base/opencode/skills/shared-task/scripts/gh-issue.ts` (~788-906). It creates the PR, assigns the current user (`addAssignee`), comments on the issue, then moves labels to `status:in-review`.
- The reusable GitHub API helper is `api(ctx, method, path, body)` (~137-201). It throws `Error('GitHub API error (<status>): <detail>')` on non-OK responses; `apiPost` (~209) is the POST wrapper.
- The API response type for a created PR is `GitHubPR` (~52), which includes `number` and `html_url`.
- There is no existing reviewer logic: searching the script for `reviewer` returns no implementation.
- `REQUIRED_LABELS` (~17) and the test export block (~1020-1025) are the patterns for adding an exported constant/helper.
- `tests/typescript/gh-issue/gh-issue.test.ts` mocks `fetch` globally. The two full-flow `cmdPrclose` tests (~1056-1168) reject unexpected fetches, so both must learn the new endpoint or they will fail.
- Test mocks can simulate API failure with `errorResponse(status, message)` (~58). The existing warning style in the script uses `process.stderr.write('⚠ ...\n')` (~391).
- `base/opencode/skills/shared-task/SKILL.md` documents `prclose` (~44-46) and is the source of truth; `.opencode/skills/shared-task/**` is gitignored generated output.
- Root `tsconfig.json` includes `base/opencode/skills/shared-task/scripts/**/*.ts`; `npm run typecheck` covers the changed script.

## Decision

- Use a single exported constant `PR_REVIEW_TEAM = 'wayforge-maintainers'` rather than a new CLI flag. The issue allows a constant, and one constant avoids repeating the slug while keeping the change minimal.
- The review request applies to every repo where the shared-task skill is installed. If `GH_REVIEW_TEAM`-style per-repo configuration is wanted later, it is a separate change.
- A failed request is non-fatal: warn on stderr, keep the PR and issue transitions. This also covers 422 responses when the team is missing or includes the PR author.

## Tasks

### Task 1: Request the team reviewer after creating the PR

**Objective:** `prclose` posts a team review request for the new PR, prints a warning and still completes when that request fails, and the `shared-task` docs describe the behavior.

**Files:**
- Modify: `base/opencode/skills/shared-task/scripts/gh-issue.ts`
- Modify: `base/opencode/skills/shared-task/SKILL.md`
- Validate: `tests/typescript/gh-issue/gh-issue.test.ts`
- Validate: `tests/typescript/gh-issue/e2e.test.ts`

**Step 1: Establish expected behaviour**

After a PR is created in `cmdPrclose`, a POST to `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` must carry `{ "team_reviewers": ["wayforge-maintainers"] }`. The PR URL must still be printed, the issue comment posted, and labels moved to `status:in-review`. If the review request returns any error (for example 422 because the team is absent), `cmdPrclose` must resolve successfully and write a warning to stderr that names the issue/PR and the team. Dry-run must not perform the request.

**Step 2: Add or update validation**

In `tests/typescript/gh-issue/gh-issue.test.ts`:

- Add `if (url.includes('/pulls/42/requested_reviewers') && method === 'POST') return Promise.resolve(okResponse({}, 201))` to both full-flow `cmdPrclose` fetch mocks (~1066 and ~1126).
- Extend the full-flow test (~1056) to assert the review request URL and JSON body, for example:
  `expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/test/repo/pulls/42/requested_reviewers', expect.objectContaining({ method: 'POST', body: JSON.stringify({ team_reviewers: ['wayforge-maintainers'] }) }))`.
- Add a test "warns and still completes when the team review request fails": same happy-path mock, but the `requested_reviewers` POST returns `errorResponse(422, 'Reviews may only be requested from collaborators.')`. Spy on `process.stderr.write`, await `gh.cmdPrclose(baseCtx, ['1'])`, and assert it resolves, the PR URL was printed, the warning contains `wayforge-maintainers`, and the label/comment calls still happened (for example, a POST to `/issues/1/labels`).
- Optionally assert `--dry-run` emits a review-request dry-run line; keep it only if the implementation adds one.

**Step 3: Write minimal implementation**

In `base/opencode/skills/shared-task/scripts/gh-issue.ts`:

- Add `const PR_REVIEW_TEAM = 'wayforge-maintainers';` under `// ── Constants` (~12-30).
- Add a helper near `addAssignee`/`addComment` (~272-294), following the existing dry-run-aware helper pattern:
  - `async function requestTeamReview(ctx: GhContext, prNumber: number, team: string): Promise<void>`
  - In `ctx.dryRun`, write `[DRY-RUN] request review from team '<team>' on PR #<n>` to stderr and return.
  - Otherwise `await apiPost(ctx, '/repos/${ctx.repo}/pulls/${prNumber}/requested_reviewers', { team_reviewers: [team] })` inside `try/catch`.
  - In `catch`, `process.stderr.write('⚠ could not request review from team \'${team}\' on PR #${prNumber}: ${message}\n')` and do not rethrow.
- In `cmdPrclose`, after `await addAssignee(ctx, pr.number, me)` (~884), call `await requestTeamReview(ctx, pr.number, PR_REVIEW_TEAM)`. Keep it before the temp-file cleanup/comment/label updates so the warning appears even if later steps fail for unrelated reasons.
- Add the new dry-run line to the existing early dry-run branch (~803-807).
- Export `PR_REVIEW_TEAM` and `requestTeamReview` from the test export block (~1020-1025).
- In `base/opencode/skills/shared-task/SKILL.md`, update the `prclose` paragraph to state that it requests review from the `wayforge-maintainers` team and that a failed request only warns.
- Do not edit `.opencode/skills/shared-task/**`; it is generated/gitignored.

**Step 4: Run test to verify pass**

Run from the repository root:

- `npx vitest run tests/typescript/gh-issue/gh-issue.test.ts`
- `npx vitest run tests/typescript/gh-issue/e2e.test.ts`
- `npm run typecheck`

Expected: all tests pass; the new test observes the `team_reviewers` payload and the non-fatal 422 warning; typecheck reports no errors.

**Step 5: Commit**

`git add base/opencode/skills/shared-task/scripts/gh-issue.ts base/opencode/skills/shared-task/SKILL.md tests/typescript/gh-issue/gh-issue.test.ts`

`git commit -m "feat(shared-task): request wayforge-maintainers review on prclose (Issue #234)"`

## Validation ownership

- **Agent:** Steps 2 and 4 (targeted Vitest runs and `npm run typecheck`).
- **Human gate before merge:** confirm the `Macacoders` organization actually has a team with slug `wayforge-maintainers` and that it can be requested on PRs. There is no local `gh` CLI on this machine and unauthenticated access cannot read org teams, so verify via GitHub org settings or an authenticated API call. If the slug differs, change the constant before merging.

## Out of scope

- Adding `--review-team` / `GH_REVIEW_TEAM` configuration or disabling the request per repo.
- Requesting individual user reviewers.
- Changing PR assignee, title, body, or label behavior.
- Editing generated `.opencode/` output or adding an ADR (the change stays inside the documented `prclose` workflow; ADR-0027 does not cover reviewers).
