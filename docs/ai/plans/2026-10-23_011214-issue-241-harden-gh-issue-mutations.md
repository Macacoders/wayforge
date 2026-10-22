---
status: planned
created: 2026-10-23
task: 1/2
required_gates:
  architect_review: false
  memory_update: false
---

# Harden remaining gh-issue mutations (Issue #241) — Implementation plan

**Goal:** Make every mutating `gh-issue.ts` command reject pull-request targets before mutating, and close the remaining `edit`/`create` argument-validation gaps, with unit tests and an updated skill contract.

**Architecture:** Add one shared `ensureNotPullRequest(issue)` guard next to `ensureOpenIssue` in `base/opencode/skills/shared-task/scripts/gh-issue.ts` and call it from `claim`, `assign`, `release`, `close`, `prclose`, and `edit` (replacing `edit`'s inline check). The existing preflight ordering (labels → `getIssue` → open-state) already covers most deterministic failures, so this plan only inserts the PR guard and hardens `cmdEdit` parsing; no new dependencies and no changes to generated `.opencode/**`. `SKILL.md` is the durable contract and is updated in the owning tasks.

**Tech Stack:** TypeScript (Node), vitest 4.x, Prettier/ESLint via `make check`.

**Scope classification:** `multi-task`

**Task budget rationale:** Two independently reviewable behavior changes: (1) PR-target rejection across commands — a safety fix with a shared guard, (2) `edit`/`create` argument validation and missing `create` coverage — input hygiene plus tests. They touch the same script but disjoint test areas and can ship separately. Docs are split so each task updates its own section.

## Baseline (verified 2026-10-23)

- `npx vitest run tests/typescript/gh-issue/gh-issue.test.ts tests/typescript/gh-issue/e2e.test.ts` → 126 passed.
- `develop` is clean and in sync with `origin/develop`; #222 (edit operation) is merged as `69baecb`.
- Already resolved by #222, do **not** re-implement: `resolveBodyFile()` empty-path rejection in `create`/`edit`, label dedupe via `Set`, `edit` PR guard (inline), `edit` preflight of labels.
- Already preflighted before mutation (verified in source): `claim`/`assign` check assignee and `status:doing`; `release` checks assignee; `close`/`prclose` check open state and required labels. The only missing deterministic guard is the PR target.

## Tasks

### Task 1: Reject pull-request targets in every mutating command

**Objective:** Share one `ensureNotPullRequest` guard and apply it to `claim`, `assign`, `release`, `close`, `prclose`, and `edit`, with tests proving zero mutations on rejection.

**Files:**
- Modify: `base/opencode/skills/shared-task/scripts/gh-issue.ts` (new guard near `ensureOpenIssue` at ~L351; calls in `cmdClaim` ~L742, `cmdAssign` ~L785, `cmdRelease` ~L841, `cmdClose` ~L895, `cmdPrclose` ~L1005, replace inline check in `cmdEdit` ~L685; add guard to the `export {}` block)
- Modify: `tests/typescript/gh-issue/gh-issue.test.ts` (PR-target cases in `describe('cmdClaim')`, `cmdAssign`, `cmdRelease`, `cmdClose`, `cmdPrclose`)
- Modify: `base/opencode/skills/shared-task/SKILL.md` (mutating operations + Safety minimums)
- Validate: `tests/typescript/gh-issue/gh-issue.test.ts`, `tests/typescript/gh-issue/e2e.test.ts`

**Step 1: Establish expected behaviour**

- `GET /repos/{repo}/issues/{n}` returns PRs too. The guard keys off the presence of `issue.pull_request` (already typed as `pull_request?: unknown` on `GitHubIssue`), so `{}` also counts as a PR.
- Error contract: `#<n> is a pull request, not an issue.` — same message `edit` uses today.
- Guard order: after `getIssue` and `ensureOpenIssue`, before the first mutation:
  - `claim`: before `getCurrentUser`/`addAssignee`.
  - `assign`: before `getCurrentUser`/`addAssignee`.
  - `release`: before `getCurrentUser`/`removeAssignee`.
  - `close`: before `addComment`.
  - `prclose`: after the local branch/clean-tree checks and after `ensureRequiredLabels`/`getIssue`, before the protected-branch `checkout -b` / `commit` / `push` and before `POST /pulls`.
  - `edit`: replace the inline `if (issue.pull_request)` block with the shared guard; behavior unchanged.
- Dry-run keeps returning before token/API resolution in every command, so a PR target is not looked up in dry-run (no `fetch`). Document this; do not add API calls to dry-run.
- `show` remains read-only and keeps accepting PRs (decision below). `list` already filters PRs.

**Step 2: Add or update validation**

In `tests/typescript/gh-issue/gh-issue.test.ts`:

- Add fixture next to `DEFAULT_ISSUE` (L76):
  `const PULL_REQUEST_ISSUE = { ...DEFAULT_ISSUE, pull_request: { url: 'https://api.github.com/repos/test/repo/pulls/1' } };`
- Add a small helper:
  ```ts
  function mutatingCalls() {
    return mockFetch.mock.calls.filter(([, opts]) => ((opts as RequestInit)?.method ?? 'GET') !== 'GET');
  }
  ```
- For each of `cmdClaim`, `cmdAssign`, `cmdRelease`, `cmdClose`, `cmdPrclose`, add:
  `it('rejects a pull request target without mutating', ...)` using `mockWithLabels('/issues/1', PULL_REQUEST_ISSUE)` (pagination-aware labels + issue GET only), then:
  - `await expect(gh.cmdX(baseCtx, [...])) .rejects.toThrow(/pull request/i);`
  - `expect(mutatingCalls()).toHaveLength(0);`
  - For `prclose`, also assert no branch side effects: no `mockExecFileSync` call whose args start with `checkout`/`commit`/`push`.
- Keep the existing `edit` PR-target test (L737) as the regression anchor; optionally add an assertion there that `mutatingCalls()` is empty (currently it only asserts `mockFetch` not called after rejecting).
- Confirm existing dry-run tests still assert `mockFetch` is untouched.

**Step 3: Write minimal implementation**

In `gh-issue.ts`, add next to `ensureOpenIssue`:

```ts
function ensureNotPullRequest(issue: GitHubIssue): void {
  if (issue.pull_request) {
    throw new Error(`#${issue.number} is a pull request, not an issue.`);
  }
}
```

- Call `ensureNotPullRequest(issue)` immediately after `await ensureOpenIssue(issue)` in `cmdClaim`, `cmdAssign`, `cmdRelease`, `cmdClose`, `cmdPrclose`.
- In `cmdEdit`, replace the inline block (L685-687) with `ensureNotPullRequest(issue);`.
- Export `ensureNotPullRequest` in the `export { ... }` block (tests import the module as `gh`).
- Do not reorder unrelated preflight checks; `claim`/`assign` may keep their assignee/status checks before or after the guard, but the guard must precede every mutation.

In `base/opencode/skills/shared-task/SKILL.md`:

- Add to `claim`, `assign`, `release`, `close`, and `prclose` sections that they reject pull-request numbers before mutating.
- Under **Safety minimums**, add: mutating commands (`claim`, `assign`, `release`, `close`, `prclose`, `edit`) reject pull request numbers; `show` is read-only and still accepts them; `--dry-run` does not resolve the target, so PR rejection applies to real runs only.

**Step 4: Run test to verify pass**

Run:
```
npx vitest run tests/typescript/gh-issue/gh-issue.test.ts tests/typescript/gh-issue/e2e.test.ts
npm run typecheck
```
Expected: 126 baseline tests plus the new PR-target cases pass; no regressions; typecheck clean.

**Step 5: Commit**

```
git add base/opencode/skills/shared-task/scripts/gh-issue.ts base/opencode/skills/shared-task/SKILL.md tests/typescript/gh-issue/gh-issue.test.ts
git commit -m "fix(shared-task): reject PR targets in all mutating gh-issue commands (Issue #241)"
```

### Task 2: Harden `edit` argument validation and cover `create --body-file`

**Objective:** Reject contradictory, empty, or whitespace-only `edit` arguments before any API call, add the missing `create` empty-`--body-file` tests, and document label-matching/residual-risk behavior.

**Files:**
- Modify: `base/opencode/skills/shared-task/scripts/gh-issue.ts` (`cmdEdit` parsing ~L633-670)
- Modify: `tests/typescript/gh-issue/gh-issue.test.ts` (`describe('cmdEdit')` ~L593, `describe('cmdCreate')` ~L522)
- Modify: `base/opencode/skills/shared-task/SKILL.md` (`edit` section + Safety minimums)
- Validate: `tests/typescript/gh-issue/gh-issue.test.ts`, `tests/typescript/gh-issue/e2e.test.ts`

**Step 1: Establish expected behaviour**

- `--title=` / `--title ''` / whitespace-only → `Error: --title requires a non-empty value.` on stderr, exit 1, zero `fetch` calls (also in `--dry-run`).
- `--add-label=` / `--remove-label=` (or whitespace-only) → `Error: --add-label requires a non-empty value.` / same for `--remove-label`, before any API call.
- Same label in both `--add-label` and `--remove-label` → `Error: cannot add and remove the same label(s): <names>.` before any API call. Match is exact (case-sensitive) and applies to the parsed, deduplicated sets.
- Existing behavior preserved: dedupe of repeated label values, `--body-file` empty-path rejection, at-least-one-field requirement, unknown-option errors, dry-run message.
- `create` already rejects empty `--body-file` via `resolveBodyFile()`; only tests are missing. A valid file with empty content must still POST `{ body: '' }`.

**Step 2: Add or update validation**

In `tests/typescript/gh-issue/gh-issue.test.ts`:

- In `describe('cmdCreate')`, mirror the `edit` cases at L792-816:
  - `rejects an empty --body-file= path without any fetch` — `gh.cmdCreate(baseCtx, ['T', '--body-file='])`.
  - `rejects a separate empty --body-file value without any fetch` — `['T', '--body-file', '']`.
  - `rejects empty --body-file paths in --dry-run without any fetch` — both forms with `dryRun: true`.
  - `sends body: '' for a valid path with empty file content` — `mockWithLabels('/issues', CREATED_ISSUE, 'POST')`, `mockReadFileSync.mockReturnValue('')`, assert POST body is `{ title: 'T', body: '' }`.
- In `describe('cmdEdit')`, add cases (all assert `expect(mockFetch).not.toHaveBeenCalled()`):
  - contradictory label: `['1', '--add-label', 'type:bug', '--remove-label', 'type:bug']` → `rejects.toThrow(/same label/i)`.
  - empty title, both forms: `['1', '--title=']`, `['1', '--title', '']`, plus whitespace `['1', '--title', '   ']`.
  - empty labels, both flags and both forms: `['1', '--add-label=']`, `['1', '--add-label', '']`, `['1', '--remove-label=']`, `['1', '--remove-label', '   ']`.
  - dry-run variants for one contradictory case and one empty-title case, asserting rejection still happens without fetch.
- Keep the existing dedupe/updated_fields test (L760-790) untouched as the regression anchor.

**Step 3: Write minimal implementation**

In `cmdEdit` (`gh-issue.ts` ~L633-670):

- While parsing, after reading `value`, reject empty values before assignment:
  - `--title`: `if (value.trim() === '') { console.error('Error: --title requires a non-empty value.'); throw new Error(); }`
  - `--add-label` / `--remove-label`: same pattern with `Error: ${flag} requires a non-empty value.`
- After the parse loop and before the at-least-one check, compute conflicts:
  ```ts
  const conflicting = [...addLabels].filter((l) => removeLabels.has(l));
  if (conflicting.length > 0) {
    console.error(`Error: cannot add and remove the same label(s): ${conflicting.join(', ')}.`);
    throw new Error();
  }
  ```
- Place all validation before `ctx.dryRun` handling and before `ensureRequiredLabels`/`getIssue`, so dry-run also rejects (consistent with the existing empty `--body-file` behavior).
- Do not trim or normalize stored values (only reject all-whitespace), so legitimate labels/titles keep their exact text.
- No change to `cmdCreate` implementation; it already calls `resolveBodyFile()` before dry-run and uses `resolvedBodyFile !== undefined` for the payload.

In `SKILL.md`:

- Extend the `edit` section: rejects empty `--title`, empty label values, and the same label supplied to both add and remove.
- Under **Safety minimums**: label names are matched case-sensitively (repo labels, issue labels, and add/remove conflicts) — keep this behavior for consistency with `ensureRequiredLabels`; validation happens before the first mutation, but a network/5xx failure between sequential calls can still leave earlier changes applied because the REST API has no transaction.

**Step 4: Run test to verify pass**

Run:
```
npx vitest run tests/typescript/gh-issue/gh-issue.test.ts tests/typescript/gh-issue/e2e.test.ts
npm run typecheck
```
Expected: all new argument-validation and `create` body-file tests pass; no regressions; typecheck clean.

Then run the full gate:
```
make check
```
Expected: typecheck + lint + format + duplication pass (2 new task-local test groups should not trip the 8% duplication threshold; reuse existing helpers).

**Step 5: Commit**

```
git add base/opencode/skills/shared-task/scripts/gh-issue.ts base/opencode/skills/shared-task/SKILL.md tests/typescript/gh-issue/gh-issue.test.ts
git commit -m "fix(shared-task): validate edit arguments and cover create body-file (Issue #241)"
```

## Decisions

- **`show` keeps accepting PR numbers** (read-only, no mutation path; useful for inspecting PR state). Documented in `SKILL.md`. If rejected instead, it becomes a behavior change without a safety benefit.
- **Label matching stays case-sensitive** (finding #5). Normalizing would silently match labels that `ensureRequiredLabels` treats as different; document instead of changing behavior.
- **Dry-run does not resolve targets** (no token/API), so PR-target rejection is real-run only. This preserves the existing "dry-run makes no network calls" contract asserted across all commands.
- **No transaction layer** for multi-call commands: deterministic failures are preflighted; network/5xx residual risk is documented, not engineered away (out of scope, would require an outbox/idempotency design).

## Validation ownership

- `agent`: targeted vitest runs, `npm run typecheck`, `make check` (ESLint/Prettier/duplication).
- `human`: none. No containers, network mutation, or interactive checks; tests mock `fetch`/`execFileSync`.

## Out of scope

- Regenerating the stale local `.opencode/**` copy (the installer owns generated output; tests import `base/**`).
- Reworking `prclose` protected-branch auto-commit behavior beyond moving the PR guard ahead of it.
- Any change to `list`/`show` output formats.
