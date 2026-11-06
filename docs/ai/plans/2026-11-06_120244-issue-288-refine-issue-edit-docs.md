---
status: completed
created: 2026-11-06
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Issue #288: Refine `/issue edit` documentation — Implementation plan

**Goal:** Replace the dense `### edit` paragraph in `base/skills/shared-task/SKILL.md` with one condensed reference paragraph that matches the sibling operation style, describes `cmdEdit` accurately, and delegates shared semantics to `Output conventions` and `Safety minimums` instead of restating them.

**Architecture:** Documentation-only change to the shared-task skill source template. The content is derived from `cmdEdit` and its helpers in `base/skills/shared-task/scripts/gh-issue.ts`. The generated `.opencode/skills/shared-task/SKILL.md` is not edited; it is rebuilt from `base/**` by the installer.

**Tech Stack:** Markdown; TypeScript/Vitest only as a read-only reference and regression validation.

**Scope classification:** `single-task`

**Task budget rationale:** One cohesive deliverable — one section of one file. There is no behavior change, migration, or cross-component contract to split into separate reviewable tasks.

## Tasks

### Task 1: Rewrite the `edit` reference section

**Objective:** Replace the dense `### edit` paragraph with a single condensed paragraph covering fields, preflight validation, dry-run semantics, and output, linking shared behavior to `Output conventions` and `Safety minimums`.

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

Validation is a consistency read-through of every rewritten statement against the symbols listed above, plus the existing suite:

- `npx vitest run tests/typescript/gh-issue` proves the documented behavior still matches the implementation.
- `make check` proves the workspace remains green and no unrelated files changed.

Do not add a documentation-snapshot test; that would exceed this issue's scope and couple the skill text to implementation details.

**Step 3: Write minimal implementation**

Replace only the `### edit` section (keep the heading line and its usage signature). Delivered as one condensed paragraph matching the other operations' style, covering the open-issue/PR constraint, at-least-one-field rule, label flag behavior, preflight and required-label validation, no auto-create, and argument-only `--dry-run`, then referencing `Output conventions` and `Safety minimums`.

Deliberate compression (confirmed by the ponytail review):
- Grouped bullets were dropped because every sibling operation is a single paragraph; one line keeps the diff minimal and consistent.
- Shared output, failure, credential, and cross-operation rules stay in the referenced sections rather than being restated.
- These accurate details were intentionally left out of the paragraph and remain true of `cmdEdit`: `--title` rejects empty values, an empty `--body-file` clears the body, unknown options and missing flag values are rejected, and title/body are applied in one `PATCH` before label mutations.

**Step 4: Run test to verify pass**

Run:

```bash
npx vitest run tests/typescript/gh-issue
make check
```

Result:
- `npx vitest run tests/typescript/gh-issue` — 143 tests passed (2 files); no test file changed.
- `make check` — green (typecheck, lint, format, duplication; 5.24% duplicated lines, under the 8% threshold).
- Read-through confirmed every statement maps to `cmdEdit` or its helpers and no claim contradicts `Output conventions` or `Safety minimums`.

**Step 5: Commit**

Done on `feature/issue-288-refine-edit-docs`, branched from `develop` (not the open #293 branch), as four incremental commits that progressively condensed the paragraph:

```text
0e4fe0b docs(shared-task): refine edit operation reference (Issue #288)
ef50dd0 docs(shared-task): match edit reference to operation paragraph style (Issue #288)
35a835f docs(shared-task): condense edit reference (Issue #288)
b84b0b0 docs(shared-task): shorten edit reference (Issue #288)
```

## Outcome

Delivered a one-line replacement of the `### edit` paragraph in `base/skills/shared-task/SKILL.md`; no code, tests, or generated artifacts changed. The final text covers the open-issue/PR constraint, at-least-one-field rule, label flag behavior, preflight and required-label validation, no auto-create, and argument-only `--dry-run`, then delegates output and safety rules to the existing sections.

Deviations from the original plan:
- Grouped bullets became a single condensed paragraph to match the other operations and keep the diff minimal.
- These accurate details were intentionally omitted and are listed above in Step 3: `--title` non-empty validation, empty-file-clears-body, unknown/missing-value flag rejection, and the single-`PATCH`-before-labels mutation order.

Validation: `npx vitest run tests/typescript/gh-issue` (143 passed) and `make check` (green).
