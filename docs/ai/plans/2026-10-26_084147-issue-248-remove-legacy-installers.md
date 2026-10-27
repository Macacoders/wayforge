---
status: completed
created: 2026-10-26
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Remove frozen legacy installers and retire legacy test surface (Issue #248) Implementation plan

**Goal:** Delete the frozen `install/legacy/**` installers and legacy-only tests, replace the stale TS-vs-legacy integration harness with a TS-only install smoke test, and reconcile durable docs/ADR/changelog with the post-removal state.

**Architecture:** The TypeScript CLI (`wfg`) is already the sole supported installer. This change removes the last in-repo copy of the retired Bash/PowerShell path (eight files), retires the two tests that only exercised it, and narrows `cli/tests/integration/run.sh` to a TS-only install smoke across four provider/runtime combinations. No TS CLI code, release-artifact contract, or manifest format changes.

**Tech Stack:** Bash integration script, bats, Pester, GNU Make, TypeScript CLI invoked via `npx tsx`, Markdown docs/ADRs.

**Scope classification:** `multi-task`

## Verified facts

- `install/legacy/` contains exactly the eight files named in the issue (`bootstrap-legacy.{sh,ps1}`, `bootstrap-thin.{sh,ps1}`, `uninstall-legacy.{sh,ps1}`, `lib/managed_sync-legacy.{sh,ps1}`), all git-tracked.
- Live stale references are confined to:
  - `cli/tests/integration/run.sh:85` invoking `install/bootstrap-legacy.sh` with the wrong path, and lines 103/107/120 comparing `.ai-config-managed`;
  - `tests/bash/bootstrap_cli.bats` and `tests/powershell/bootstrap.Tests.ps1`, which target only `install/legacy/**`;
  - `docs/ai/architecture.md:36` and `:95`.
- `docs/ai/decisions/ADR-0033-legacy-installer-deprecation-interop-boundary.md` is Accepted and still describes the deletion trigger as pending. `ADR-0035` is superseded by ADR-0036, and `ADR-0044` explicitly says historical ADR prose is left unchanged.
- `qa/check-bats` discovers `tests/bash/*.bats`; `qa/check-pester` discovers `tests/powershell/*.Tests.ps1`. Neither has a hardcoded per-test manifest to update.
- `Makefile`: `check` runs `check-ts`, `check-node`, and `check-duplication` only. `check-integration`, `check-bats`, and `check-pester` are separate targets; `check-integration` is wired into `check-tests`, not `check`.
- No live references were found in `README.md`, `RELEASE.md`, `Makefile`, `qa/`, or `AGENTS.md`.
- `VERSION` is `1.0.2`; `CHANGELOG.md` latest entry is `[1.0.2] - 2026-10-16`.
- Host is Windows: `bash` is absent from the PowerShell PATH but Git Bash exists at `C:\Program Files\Git\bin\bash.exe` and exposes `make`, `bats`, `node`, and `pwsh`.

## Blocking decisions

1. **ADR-0033 trigger / parity gate.** ADR-0033's literal trigger requires "integration parity is established", but the issue confirms the integration arm is stale rather than a working parity gate. Recommended: the architect confirms the trigger is satisfied by migration completion plus the release-surface facts (legacy was never shipped), and the ADR amendment records that the stale parity arm was retired rather than passed.
2. **Reference-sweep scope.** Treat `docs/ai/decisions/**` as historical decision records, following ADR-0044's explicit "historical prose left unchanged" rule, and amend only ADR-0033. If reviewers require a literal sweep, also add historical notes to ADR-0035 and ADR-0044.
3. **Changelog/version.** Recommended: add `## [1.0.3] - 2026-10-26` with a `### Removed` entry and bump `VERSION` to `1.0.3`, matching the 1.0.2 precedent. Alternative: add `[Unreleased]` and leave `VERSION` unchanged.
4. **Integration gate.** Recommended: retain a TS-only smoke test and leave `make check` unchanged, so integration remains a separate `make check-integration` target. This follows the issue preference and the minimal-change rule.

## Tasks

### Task 1: Delete legacy installer tree and legacy-only tests

**Objective:** Remove the eight frozen legacy installer files and the two legacy-only test suites, leaving only current-installer tests.

**Files:**
- Delete: `install/legacy/**` (eight tracked files)
- Delete: `tests/bash/bootstrap_cli.bats`
- Delete: `tests/powershell/bootstrap.Tests.ps1`
- Validate: `tests/bash/install_sh.bats`, `tests/bash/bashrc_snippet.bats`, `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

`install/legacy/` must no longer exist. `tests/bash/` must retain `install_sh.bats` and `bashrc_snippet.bats`; `tests/powershell/` must retain `install.Tests.ps1`. No live source, QA script, or Make target may import or enumerate the deleted legacy tests.

**Step 2: Add or update validation**

No new tests are needed; this is deletion of dead code and tests for dead code. Confirm the remaining suites are discovered by glob (`qa/check-bats`, `qa/check-pester`) rather than by a hardcoded list. Do not edit the remaining tests or `qa/` scripts.

**Step 3: Write minimal implementation**

Run the deletions as tracked removals:

```bash
git rm -r install/legacy
git rm tests/bash/bootstrap_cli.bats tests/powershell/bootstrap.Tests.ps1
```

Do not touch `tests/bash/install_sh.bats`, `tests/bash/bashrc_snippet.bats`, or `tests/powershell/install.Tests.ps1`.

**Step 4: Run test to verify pass**

Run:

```bash
make check-bats
make check-pester
```

Expected: bats discovers the two remaining Bash suites and passes; Pester discovers `install.Tests.ps1` and passes. The prior legacy-only suites must not appear in the output.

On Windows, run through Git Bash:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/DEV/wayforge && make check-bats && make check-pester'
```

If Pester fails with the known `run_pwsh_heredoc` extension issue, record it as an environment limitation and escalate to human/CI; do not modify `qa/_helpers.sh` in this task.

**Validation owner:** agent

**Step 5: Commit**

```bash
git add -A install/legacy tests/bash/bootstrap_cli.bats tests/powershell/bootstrap.Tests.ps1
git commit -m "chore: remove frozen legacy installers and legacy-only tests"
```

### Task 2: Rework integration harness into a TS-only smoke test

**Objective:** Replace the stale TS-vs-legacy comparison in `cli/tests/integration/run.sh` with a TS-only install smoke test over four provider/runtime combinations.

**Files:**
- Modify: `cli/tests/integration/run.sh`
- Validate: `cli/tests/integration/run.sh` via `make check-integration`

**Step 1: Establish expected behaviour**

For each combination below, a fresh TS CLI install must exit 0 and produce:
- `.wayforge-managed`
- `opencode.jsonc` for `opencode`, `kilo.jsonc` for `kilocode`
- `AGENTS.md`
- `.opencode/agents/`

Combinations:
- `free-tier` + `opencode`
- `openai` + `opencode`
- `openai,github-copilot` + `opencode`
- `openai` + `kilocode`

The script must not invoke any `install/legacy/**` file, must not read or compare `.ai-config-managed`, and must not retain the legacy-normalization helpers.

**Step 2: Add or update validation**

The integration script is the validation. No unit tests or Makefile changes are required because `make check-integration` already points at this script and the target is being retained. Do not add integration to `make check`.

**Step 3: Write minimal implementation**

Rewrite `cli/tests/integration/run.sh` to:

1. Keep `#!/usr/bin/env bash`, `set -euo pipefail`, `ROOT_DIR`, cleanup trap, and pass/fail counters.
2. Rename `TMP_BASE` from `/tmp/ai-config-integration-test` to `/tmp/wayforge-integration-test`.
3. Delete `strip_permissions()`, `strip_trailing_blanks()`, `compare_manifests()`, the legacy install arm, and the manifest/directory diff.
4. Implement `run_test()` as:
   - create a fresh temp repo;
   - run `npx tsx cli/src/index.ts install --repo "$repo" --providers "$providers" --runtime "$runtime" --no-track` from `ROOT_DIR`;
   - pass only when the install exits 0 and the four expected paths exist;
   - print a focused failure (provider/runtime plus which assertion failed), increment counters, and continue to the next combination.
5. Keep the four `run_test` calls and the final non-zero exit when any test fails.

Preserve the smoke-test scope: first-install success and expected output presence, not install/uninstall idempotency or runtime execution.

**Step 4: Run test to verify pass**

Run:

```bash
make check-integration
```

Expected: `4/4 passed` and `All integration tests passed.`

On Windows, run through Git Bash:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/DEV/wayforge && make check-integration'
```

**Validation owner:** agent

**Step 5: Commit**

```bash
git add cli/tests/integration/run.sh
git commit -m "test: replace legacy integration comparison with TS-only smoke"
```

### Task 3: Reconcile architecture, ADR-0033, changelog, and memory

**Objective:** Describe the post-removal state in durable memory and record the removal under the next release version.

**Files:**
- Modify: `docs/ai/architecture.md:36`, `docs/ai/architecture.md:95`
- Modify: `docs/ai/decisions/ADR-0033-legacy-installer-deprecation-interop-boundary.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION` (only if the 1.0.3 decision is approved)
- Modify: `docs/ai/logs/2026-10.md`
- Validate: repository-wide reference sweep, `make check`, `git diff --check`

**Step 1: Establish expected behaviour**

Architecture must no longer present `install/legacy/**` as a live part of the repository. ADR-0033 must record that its deletion trigger was executed. `CHANGELOG.md` must contain a `Removed` entry under the next version. The monthly memory log must record the completed change and its validation.

**Step 2: Add or update validation**

No new automated test is needed. The acceptance check is a reference sweep plus the existing gates:

```bash
rg -n "install/legacy|bootstrap-legacy|bootstrap-thin|uninstall-legacy|managed_sync-legacy" \
  -g '!docs/ai/plans/**' \
  -g '!docs/ai/logs/**' \
  -g '!docs/ai/reports/**' \
  -g '!docs/ai/decisions/**' \
  -g '!CHANGELOG.md'
```

Expected: no output. The exclusions are the historical plan/log/report surfaces named in the issue, plus `docs/ai/decisions/**` under blocking decision 2 and the historical changelog entries. If decision 2 is resolved the other way, add historical notes to ADR-0035 and ADR-0044 and adjust the exclusion.

**Step 3: Write minimal implementation**

- `docs/ai/architecture.md`: remove the **Legacy references** bullet at line 36. Rewrite line 95 to state that the canonical install surface is `install/install.sh` / `install/install.ps1` plus `wfg install --repo <path>`, and that the former frozen legacy installers were removed after ADR-0033's trigger was executed; no legacy bootstrap entrypoints remain.
- `ADR-0033`: add an `**Amended**: 2026-10-26` line recording that the deletion trigger was executed and the eight `install/legacy/**` files plus legacy-only tests were removed. Rewrite Decision 4 into past tense. Add a consequence bullet that the historical interop warnings now apply only to out-of-tree copies of the frozen scripts.
- `CHANGELOG.md`: add `## [1.0.3] - 2026-10-26` above `[1.0.2]` with `### Removed` explaining that `install/legacy/**` and its legacy-only bats/Pester tests were removed, that `wfg` is the only supported installer, that release artifacts are unchanged, and that contributors relying on the frozen source scripts lose them. Add the `[1.0.3]` link reference at the bottom.
- `VERSION`: set to `1.0.3` if blocking decision 3 is approved.
- `docs/ai/logs/2026-10.md`: add a `## 2026-10-26` entry above `## 2026-10-23` summarizing the removal, the TS-only integration smoke, validation commands, gates, and a link to this plan.
- Do not edit `README.md`, `RELEASE.md`, `Makefile`, `qa/`, or historical plan/log/report files; the reference sweep confirms they have no live legacy references.

**Step 4: Run test to verify pass**

Run:

```bash
# Reference sweep (expected: no output)
rg -n "install/legacy|bootstrap-legacy|bootstrap-thin|uninstall-legacy|managed_sync-legacy" \
  -g '!docs/ai/plans/**' \
  -g '!docs/ai/logs/**' \
  -g '!docs/ai/reports/**' \
  -g '!docs/ai/decisions/**' \
  -g '!CHANGELOG.md'

make check
git diff --check
git status --short
```

Expected: the sweep is empty; `make check` passes (Vitest, `tsc`, ESLint, Prettier, duplication); `git diff --check` is clean; `git status` contains only the intended Task 1–3 files.

On Windows, on the host that lacks `bash` on PATH, use Git Bash for any Make target that invokes a shell script; `make check` itself is runnable from PowerShell.

**Validation owner:** agent

**Step 5: Commit**

```bash
git add docs/ai/architecture.md docs/ai/decisions/ADR-0033-legacy-installer-deprecation-interop-boundary.md CHANGELOG.md VERSION docs/ai/logs/2026-10.md
git commit -m "docs: record legacy installer removal"
```

## Handoff

- Run the `architect` review gate before Task 1, focused on blocking decision 1 (deletion trigger versus the literal parity requirement) and the ADR-0033 amendment.
- After Task 3, run the `memory_update` gate and update this plan's frontmatter to `status: completed` with `task: 3/3`.
- After validation, use the shared-task workflow to open the issue PR (`prclose 248`) because this change should be its own PR. Do not merge or close the issue until the PR is reviewed.
- No TS CLI behavior, release artifact, or manifest-format changes are in scope. Do not edit `.opencode/` or `opencode.jsonc`; they are generated and gitignored.
