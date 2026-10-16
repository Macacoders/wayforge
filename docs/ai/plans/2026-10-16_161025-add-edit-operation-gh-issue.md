---
status: completed
created: 2026-10-16
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Add `edit` operation to gh-issue helper — Implementation plan

**Goal:** Add an `edit` operation to `gh-issue.ts` so the shared-task workflow can update an existing issue's title, body, and labels, and document/test it.

**Architecture:** Extend the single-file TypeScript helper (`base/opencode/skills/shared-task/scripts/gh-issue.ts`) with a `cmdEdit` handler that mirrors the existing `cmdCreate` argument-parsing conventions and reuses the existing helpers (`getIssue`, `ensureOpenIssue`, `ensureRequiredLabels`, `addLabel`, `removeLabel`, `output`). Title/body go through one `PATCH /repos/{repo}/issues/{n}`; labels reuse the existing add/remove helpers. `SKILL.md` (the durable contract) is updated in the same task. No new dependencies; generated `.opencode/**` is not edited (per repo boundary — tests import `base/**` directly).

**Tech Stack:** TypeScript (Node), vitest 4.x, `@opencode-ai/plugin` not involved. Formatting via Prettier (`useTabs`, no semicolons, single quotes); lint via ESLint.

**Scope classification:** `single-task`

**Task budget rationale:** Single cohesive outcome (one new CLI operation) with implementation + unit tests + docs belonging together. No horizontal layers; no split needed.

## Tasks

### Task 1: Implement and document the `edit` operation

**Objective:** Add a working `edit <issue-number> [--title] [--body-file] [--add-label]... [--remove-label]...` operation with unit + e2e coverage and updated skill docs.

**Files:**
- Modify: `base/opencode/skills/shared-task/scripts/gh-issue.ts` (new `cmdEdit`, `case 'edit'` in `main()` dispatch, one `printUsage()` line, export `cmdEdit`)
- Modify: `base/opencode/skills/shared-task/SKILL.md` (add `edit` under **Operations**; extend **Output conventions**)
- Modify: `tests/typescript/gh-issue/gh-issue.test.ts` (new `describe('cmdEdit', ...)`)
- Modify: `tests/typescript/gh-issue/e2e.test.ts` (dry-run assertion in `gh-issue.ts dry-run lifecycle`)
- Validate: `tests/typescript/gh-issue/gh-issue.test.ts`, `tests/typescript/gh-issue/e2e.test.ts`

**Step 1: Establish expected behaviour**

Confirm the contract from issue #220:

- Usage: `gh-issue.ts [--repo OWNER/REPO] [--json] [--dry-run] edit <issue-number> [--title <title>] [--body-file <path>] [--add-label <name>]... [--remove-label <name>]...`
- `--body-file` resolves exactly like `cmdCreate` (absolute, else `path.resolve(process.cwd(), ...)`); read via `readFileSync`.
- At least one of `--title` / `--body-file` / `--add-label` / `--remove-label` is required; empty invocation → `Error:` on stderr, exit 1, **no** API call.
- Title and/or body → a single `PATCH /repos/${ctx.repo}/issues/${n}` with `{ title?, body? }`.
- `--add-label` / `--remove-label` reuse `addLabel` / `removeLabel` (do not auto-create labels; must already exist — `ensureRequiredLabels` still guards).
- Guard order: `ensureRequiredLabels` → `getIssue` → `ensureOpenIssue` (only on non-dry-run), matching `cmdClaim`/`cmdClose`.
- `--dry-run` prints `[DRY-RUN] would edit issue #<n> ...` to stderr and mutates nothing (no `fetch`).
- `--json` emits `{ number, url, updated_fields }` where `url` is `issue.html_url` and `updated_fields` lists applied changes (e.g. `["title","body","label+status:blocked","label-status:to-do"]`).
- Non-JSON success prints the issue `html_url` (consistent with `create`/`prclose` printing a URL).
- Unknown option (e.g. `--bogus`) and a dangling `--body-file`/`--title`/`--add-label`/`--remove-label` (no value) → `Error:` on stderr, exit 1.

**Step 2: Add or update validation**

- In `tests/typescript/gh-issue/gh-issue.test.ts`, add `describe('cmdEdit', ...)` using the existing `mockWithLabels(urlPattern, data, method)` helper and `baseCtx`:
  - `--title` only → asserts `PATCH` called with `{ title }` (use `mockWithLabels('/issues/1', ISSUE, 'PATCH')`; assert `mockFetch` call method/body).
  - `--body-file` only → seed `mockReadFileSync.mockReturnValue('new body')` and `mockExistsSync` as needed; assert `PATCH` body `{ body: 'new body' }`.
  - `--add-label` / `--remove-label` only → assert POST to `/issues/1/labels` and DELETE to `/issues/1/labels/<name>`.
  - combined `--title` + `--body-file` → single `PATCH` containing both `title` and `body`.
  - empty args (`[]`) → `rejects.toThrow(Error)`.
  - unknown option and dangling-value cases → `rejects.toThrow(Error)`.
  - `--dry-run` → `expect(mockFetch).not.toHaveBeenCalled()`.
  - `--json` → parse stdout and assert `{ number, url, updated_fields }`.
- In `tests/typescript/gh-issue/e2e.test.ts`, under `describe('gh-issue.ts dry-run lifecycle')`, add:
  `it('edit prints dry-run message', ...)` invoking `[...base, 'edit', '1', '--title', 'Renamed']` and asserting `r.stderr` contains `[DRY-RUN] would edit issue #1`.

**Step 3: Write minimal implementation**

In `gh-issue.ts`:

1. Add `cmdEdit(ctx: GhContext, args: string[]): Promise<void>`:
   - Parse `args[0]` as issue number (`Number.isInteger`, `>= 1`, else `Error: invalid issue number.`).
   - Loop remaining args, supporting both `--flag value` and `--flag=value` for `--title`, `--body-file`, `--add-label`, `--remove-label`; collect `addLabels[]`, `removeLabels[]`; unknown option → `Error: unknown edit option: <arg>`.
   - If no title/body/labels supplied → `console.error('Error: edit requires at least one of --title, --body-file, --add-label, --remove-label.')` and `throw new Error()`.
   - If `ctx.dryRun` → print `[DRY-RUN] would edit issue #<n>` plus the intended fields to stderr and `return` (before any API call).
   - `await ensureRequiredLabels(ctx)`; `const issue = await getIssue(ctx, issueNumber)`; `await ensureOpenIssue(issue)`.
   - Build `patch: { title?: string; body?: string }`; for `--body-file`, resolve path like `cmdCreate` and `readFileSync(resolvedFile, 'utf8')`.
   - If `patch` non-empty → `await api(ctx, 'PATCH', `/repos/${ctx.repo}/issues/${issueNumber}`, patch)`.
   - `for (const l of addLabels) await addLabel(ctx, issueNumber, l);` and likewise `removeLabel`.
   - `updated_fields` = ordered list of applied changes; `outputJson({ number, url: issue.html_url, updated_fields })` when `ctx.jsonMode`, else `process.stdout.write(issue.html_url + '\n')`.
2. In `main()`, add `case 'edit': await cmdEdit(ctx, cmdArgs); break;`.
3. In `printUsage()`, add the `edit` usage line.
4. Add `cmdEdit` to the `export { ... }` list (tests import it).

In `base/opencode/skills/shared-task/SKILL.md`:

- Add an `### edit <issue-number> [--title <title>] [--body-file <path>] [--add-label <name>]... [--remove-label <name>]...` section under **Operations** describing: updates title/body/labels of an existing issue; requires at least one field; `--body-file` like `create`; one PATCH for title/body.
- Under **Output conventions**, note `edit` prints the issue URL on success and `--json` emits `{ number, url, updated_fields }`.

**Step 4: Run test to verify pass**

Run:
```
npx vitest run tests/typescript/gh-issue/gh-issue.test.ts tests/typescript/gh-issue/e2e.test.ts
npm run typecheck
```
Expected: new `cmdEdit` unit tests and the `edit` e2e dry-run test pass; no regressions in the gh-issue suites; typecheck clean.

Then run the full gate:
```
make check
```
Expected: typecheck + lint + format + duplication all pass (no new duplication).

**Step 5: Commit**

```
git add base/opencode/skills/shared-task/scripts/gh-issue.ts base/opencode/skills/shared-task/SKILL.md tests/typescript/gh-issue/gh-issue.test.ts tests/typescript/gh-issue/e2e.test.ts
git commit -m "feat(shared-task): add edit operation to gh-issue helper (Issue #220)"
```

**Validation ownership:**
- `agent`: the vitest runs, `npm run typecheck`, `make check`, ESLint/Prettier.
- `human`: none required (no containers, network mutation, or interactive checks). The first real `edit` against a live issue (for #221) is a separate, later task, not part of this plan's validation.

## Blocking decisions

None. The CLI shape, `--body-file` semantics, one-issue-per-invocation scope (no bulk mode), and non-JSON URL output are already fixed by issue #220 and the existing `cmdCreate` conventions.

## Required gates (proposed)

- `architect_review: false` — additive subcommand; no new boundary; already covered by ADR-0017 (single TS `gh-issue`).
- `memory_update: false` — the durable contract (`SKILL.md`) is updated within Task 1; no separate ADR required.
