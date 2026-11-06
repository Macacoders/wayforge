---
status: completed
created: 2026-11-06
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Issue #288: Refine `/issue edit` documentation — Implementation plan

**Goal:** Rewrite the `### edit` section of `base/skills/shared-task/SKILL.md` into scannable, grouped bullets that describe `cmdEdit` accurately and do not contradict `Output conventions` or `Safety minimums`.

**Architecture:** Documentation-only change to the shared-task skill source template. The content is derived from `cmdEdit` and its helpers in `base/skills/shared-task/scripts/gh-issue.ts`. The generated `.opencode/skills/shared-task/SKILL.md` is not edited; it is rebuilt from `base/**` by the installer.

**Tech Stack:** Markdown; TypeScript/Vitest only as a read-only reference and regression validation.

**Scope classification:** `single-task`

**Task budget rationale:** One cohesive deliverable — one section of one file. There is no behavior change, migration, or cross-component contract to split into separate reviewable tasks.

## Tasks

### Task 1: Rewrite the `edit` reference section

**Objective:** Replace the dense `### edit` paragraph with grouped bullets covering fields, preflight validation, execution order, dry-run semantics, and output.

**Files:**
- Modify: `base/skills/shared-task/SKILL.md:25-27` (the `### edit` section only)
- Validate (read-only reference): `base/skills/shared-task/scripts/gh-issue.ts` — `cmdEdit` (~648-754), `ensureMutableIssue` (~366-374), `preflightLabelEdits` (~376-392), `resolveBodyFile` (~571-575), `splitFlagArg` (~554-557), `ensureRequiredLabels` (~253-261)
- Validate: `tests/typescript/gh-issue/gh-issue.test.ts` (`describe('cmdEdit', ...)`, ~649)
- Do not modify: `.opencode/skills/shared-task/SKILL.md` (generated artifact), `gh-issue.ts`, or any tests

**Step 1: Establish expected behaviour**

Read `cmdEdit` and confirm the documented contract before writing. Verified facts:

- Usage: `edit <issue-number> [--title <title>] [--body-file <path>] [--add-label <name>]... [--remove-label <name>]...`.
- The issue number must be a positive integer.
- At least one of title, body file, add-label, or remove-label must be supplied.
- Unknown options and options missing their value are rejected.
- `--title`, `--add-label`, and `--remove-label` reject empty/whitespace-only values.
- `--body-file` rejects an empty path, resolves relative paths against the current working directory, and accepts an empty file as a valid way to clear the body.
- `--flag=value` is accepted for all four value flags (`splitFlagArg`).
- Repeated add-label/remove-label values are deduplicated (sets).
- Supplying the same label to both `--add-label` and `--remove-label` is rejected before any API call.
- `--dry-run` validates argument parsing, the add/remove conflict, the body-file path, and the at-least-one-field rule; it prints intended actions to stderr and does **not** fetch the issue, check the target state, check repo labels, or check labels present on the issue.
- On a real run, after argument validation:
  - the target must be an **open issue**; pull requests and closed issues are rejected (`ensureMutableIssue`);
  - if any label is added, the repository must contain the full required label set (`ensureRequiredLabels`), even when the added label is not itself one of the required labels;
  - added labels must exist in the repository and removed labels must already be present on the issue (`preflightLabelEdits`).
- Mutation order: title/body are applied together in one `PATCH`; then labels are added one request at a time; then labels are removed one request at a time.
- Success prints the issue URL. `--json` prints `{ number, url, updated_fields }`, where `updated_fields` lists `title`, `body`, `label+<name>`, and `label-<name>` in applied order.
- Failures print to stderr with exit 1.
- Cross-operation rules — case-sensitive label matching and the lack of a transaction across sequential API calls — stay in `Safety minimums`; the `edit` section should reference them instead of restating them.

**Step 2: Add or update validation**

No new tests: issue #288 explicitly limits the change to the skill document and forbids code/test changes.

Validation is a consistency read-through of every rewritten bullet against the symbols listed above, plus the existing suite:

- `npx vitest run tests/typescript/gh-issue` proves the documented behavior still matches the implementation.
- `make check` proves the workspace remains green and no unrelated files changed.

Do not add a documentation-snapshot test; that would exceed this issue's scope and couple the skill text to implementation details.

**Step 3: Write minimal implementation**

Replace only the `### edit` section (keep the heading line and its usage signature). Use this structure:

1. **Intro** — one sentence: updates title, body, and/or labels on an open issue; at least one field is required.
2. **Fields** — bullets for `--title`, `--body-file`, `--add-label`/`--remove-label`, including non-empty rules, cwd-relative path, empty-file-clears-body, repeatability/deduplication, and case-sensitive labels.
3. **Preflight** — bullets for argument validation (issue number, unknown/missing flags, empty values, add/remove conflict, at-least-one-field) and real-run validation (open issue only; additions exist in repo; removals present on issue; full required label set when adding labels).
4. **Execution and dry-run** — title/body in one `PATCH`, then label adds, then removals; `--dry-run` validates arguments but skips issue/repo/label-state resolution and prints to stderr.
5. **Output** — issue URL on success; `{ number, url, updated_fields }` under `--json`; stderr + exit 1 on failure; link to `Output conventions` and `Safety minimums` for shared behavior.

Keep the section scannable: short bullets, no dense paragraph, no examples section. Every statement must be traceable to `cmdEdit` or its helpers.

**Step 4: Run test to verify pass**

Run:

```bash
npx vitest run tests/typescript/gh-issue
make check
```

Expected:
- All `gh-issue` tests pass; no test file changed.
- `make check` is green.
- Manual read-through: every bullet maps to a code path above; no claim contradicts `Output conventions` or `Safety minimums`; no mention of unrelated operations.

**Step 5: Commit**

Start from `develop` on a dedicated branch (for example `feature/issue-288-refine-edit-docs`) so this docs change does not ride on the open #293 branch.

```bash
git add base/skills/shared-task/SKILL.md
git commit -m "docs(shared-task): refine edit operation reference (Issue #288)"
```
