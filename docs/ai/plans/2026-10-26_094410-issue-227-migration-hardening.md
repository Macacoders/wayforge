---
status: planned
created: 2026-10-26
task: 0/3
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #227 follow-up: migration hardening (high + medium review findings) — Implementation plan

**Goal:** make the legacy `.opencode` → `.agents/` upgrade path behave like a fresh install (agent permissions intact, generated config pointing at `.agents/`), make `--dry-run` honest, fail fast on a corrupt managed manifest, and stop stranding Windows junction pointers in `uninstall`.

**Architecture:** no design change. All fixes stay inside the existing refresh/migration branch of `cli/src/commands/install.ts`, the shared managed-path helpers in `cli/src/lib/manifest.ts`, the pointer residual collector in `cli/src/lib/pointers.ts`, one config-staleness helper in `cli/src/lib/config-gen.ts`, and the single `rm()` primitive in `cli/src/lib/files.ts`. Everything remains governed by ADR-0046 (canonical `.agents/` tree, per-runtime pointers, migration/residual policy, symlink → junction → deferred stub).

**Scope classification:** `multi-task` (3 tasks). Three reviewable commits: migration correctness (the two blocking defects), dry-run/manifest-robustness, junction-safe removal plus docs and the full gate.

**Source of findings:** deep review of branch `feature/issue-227-agents-artifact-dir` against [the original plan](2026-10-25_075150-issue-227-agents-artifact-dir.md) and ADR-0046. Findings 1–2 are blocking, findings 3–5 are medium. Low findings and ponytail harvest are explicitly not in this plan.

**Out of scope:**

- Low findings: residual symlinks inside the legacy `.opencode` tree are not reported, migration log noise (`new managed path discovered` / `skip conflict with unmanaged file` for wayforge's own files), `trackInstalledProject` running before the blocked-pointer `exit 1`, `.jsonc` files never tracked in the manifest.
- The ponytail harvest noted in review (dead `INPUT_CATEGORIES`/`PointerCategory`/`ContentCategory` exports, `normalize` vs `posixPath` duplication, double residual reporting shape, `ponytail: temporal` marker on the migration block, test-helper dedupe between `unit/migration.test.ts` and `integration/install-layout.test.ts`).
- Verifying Windows junction creation/relocation/removal on a real Windows host (stays a human item in `docs/compatibility-matrix.md`).
- Any change to agent/command/skill content, generated config shape, pointer mechanism, or manifest format.

## Baseline (verified 2026-10-26)

Branch head `6853319`, working tree clean. `make check` green; `npx vitest run` = 16 files / 378 tests. OpenCode 1.18.35 and Kilo 7.8.17 both load agents/commands/skills/plugin from `.agents/` on a **fresh** install.

**Finding 1 (critical) — the first post-upgrade run strips the permission model.** `injectPermissions` (`install.ts:401`, gate at `install.ts:412`) skips every migrated agent because `isManagedFile` (`manifest.ts:214`) finds `.wayforge-managed` at the repo root and `break`s, so destinations tracked in `.wayforge-managed.tmp` read as unmanaged. Reproduced with a real develop-made legacy install:

```
grep -c 'permission:' <repo>/.agents/agents/planner.md
# fresh install  -> 1
# migrated run   -> 0   (exit 0, "repo bootstrap complete")
# second run     -> 1   (self-heals, so tests and spot checks miss it)
```

Persists even with `--force`. `isManagedDir` (`manifest.ts:245`) has the same early-`break` shape.

**Finding 2 (high) — migration keeps the legacy generated config.** `install.ts:149` only regenerates on `--force` or a missing file, while the legacy cleanup (`install.ts:211-233`) deletes `.opencode/plugins/**` and `.opencode/skills/**`. Reproduced on the migrated repo:

```
opencode.jsonc:71  "plugin": ["./.opencode/plugins/ponytail/ponytail.mjs"]   # file deleted
# no "skills" key; .opencode/skills gone
opencode debug config -> plugin: file://<repo>/.opencode/plugins/ponytail/ponytail.mjs
opencode debug skill  -> only built-in "customize-opencode" (all wayforge skills gone)
```

`--force` fixes the config but not Finding 1. `isManagedOpenCodeFile` (`manifest.ts:282`) already detects wayforge-owned configs (first line equals `MANAGED_OPENCODE_HEADER`) and is currently unused by `cli/src`.

**Finding 3 (medium) — dry-run is dishonest.** `collectResiduals` (`pointers.ts:56`) lists every file in a non-empty pointer directory, including legacy files a real run would have deleted: a seeded legacy repo reports 22 blocking paths in dry-run vs 1 for the real run, contradicting the `collectLegacyResiduals` comment. Both blocked-pointer sites (`install.ts:220`, `install.ts:260`) also suppress the exit under `ctx.dryRun` and then print `repo bootstrap complete` with exit 0.

**Finding 4 (medium) — corrupt manifest dead-ends the migration.** When `.wayforge-managed` exists but parses to zero paths, `install.ts:141-145` falls through to a full sync that writes `.agents/` but can never classify or remove legacy `.opencode` files, so pointers stay blocked forever behind a "move these paths into `.agents/` or remove them" message that is wrong for wayforge-owned files.

**Finding 5 (medium) — uninstall cannot remove a junction.** `rm()` (`files.ts:12`) is `fs.unlinkSync`; `uninstall.ts` uses it for every manifest entry including pointer directories, which on the Windows fallback are directory junctions (`pointers.ts:180-186`, `type = 'junction'`). `unlink` on a directory reparse point fails on Windows; uninstall aborts mid-run. No test covers junction removal (all pointer tests gate on `canSymlink()`).

## Tasks

### Task 1: Migration keeps agent permissions and a layout-correct config

**Objective:** a single post-upgrade install (no `--force`) produces permission-bearing agents and a generated config that points at `.agents/`.

**Files:**
- Modify: `cli/src/lib/manifest.ts` (`isManagedFile`, `isManagedDir` — both-manifest scan)
- Modify: `cli/src/lib/config-gen.ts` (export `isLayoutStaleConfig` using `isManagedOpenCodeFile`)
- Modify: `cli/src/commands/install.ts` (refresh config guard at `:147-155`)
- Modify: `cli/tests/unit/manifest.test.ts`, `cli/tests/unit/migration.test.ts`, `cli/tests/integration/install-layout.test.ts`

**Step 1: Establish expected behaviour**

- After one refresh over a legacy install, all six `.agents/agents/*.md` contain the rendered `permission:` block (`"rm -rf*": deny`, `external_directory`, `task`), and a second run leaves their content unchanged.
- After one refresh, `opencode.jsonc`/`kilo.jsonc` contain `"plugin": ["./.agents/plugins/ponytail/ponytail.mjs"]` and `"skills": ["./.agents/skills"]`, so `opencode debug skill` lists the wayforge skills and `opencode debug config` resolves the plugin under `.agents/`.
- A config without the wayforge header (user-authored) is still preserved and still requires `--force`. `--force` behaviour is unchanged.

**Step 2: Add or update validation**

- `manifest.test.ts`: `isManagedFile`/`isManagedDir` return true when the path is listed only in `.wayforge-managed.tmp` while `.wayforge-managed` exists, and still true when listed only in `.wayforge-managed`. (owner: **agent**)
- `migration.test.ts`: after one refresh, planner and architect contain `permission:` and `"rm -rf*": deny`; the generated config contains both `.agents` strings; a second refresh does not rewrite the permission block. (owner: **agent**)
- `integration/install-layout.test.ts`: extend the seeded-legacy migration case with the same permission and config-string assertions. (owner: **agent**)

**Step 3: Write minimal implementation**

1. `manifest.ts`: in `isManagedFile` (`:214`) and `isManagedDir` (`:245`), stop skipping the second marker at an ancestor — check both `MANAGED_DIR_MARKER` and `${MANAGED_DIR_MARKER}.tmp` before leaving that directory (remove the early `break`, keep the ancestor walk). Legacy lookups keep resolving through `.wayforge-managed`, so `removeManagedLegacyPaths` and `collectLegacyResiduals` are unaffected.
2. `config-gen.ts`: export `isLayoutStaleConfig(filePath): boolean` — `isManagedOpenCodeFile(filePath)` **and** (`content.includes(LEGACY_ARTIFACT_ROOT + '/')` **or** `!content.includes('"skills"')`). Import `LEGACY_ARTIFACT_ROOT` from `layout.ts`.
3. `install.ts:149`: regenerate when `savedForce || !exists || isLayoutStaleConfig(dst)`; keep the existing "kept existing … (use --force to regenerate)" log for genuine user configs. Do not add a flag; do not touch the fresh-install path.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit cli/tests/integration && cd cli && npx tsc --noEmit && npx eslint src/ && npx prettier --check src/` (owner: **agent**).

Then reproduce the baseline defect against a develop-made legacy install and confirm it is gone: `grep -c 'permission:' …/.agents/agents/planner.md` → `1` on the **first** run; `grep -nE '"plugin"|"skills"' …/opencode.jsonc` → both `.agents` strings. Runtime smoke (owner: **agent**, OpenCode 1.18.35 is installed): `opencode debug skill` lists `ai-memory`, `intent`, `ponytail`, … and `opencode debug config` shows the plugin under `.agents/`. Kilo re-check is optional here (owner: **human**) via `npx --yes @kilocode/cli@7.8.17 debug skill`.

**Step 5: Commit**

`git add cli`
`git commit -m "fix(migration): keep agent permissions and regenerate stale layout config (Issue #227)"`

### Task 2: Honest dry-run and fail-fast on a corrupt managed manifest

**Objective:** `--dry-run` reports the same residual set a real run would leave and never claims success when pointers would block; a corrupt manifest stops before content is synced.

**Files:**
- Modify: `cli/src/lib/pointers.ts` (`collectResiduals`)
- Modify: `cli/src/commands/install.ts` (corrupt-manifest guard at `:141`, blocked-pointer messaging at `:220-233` and `:260-309`)
- Modify: `cli/tests/unit/pointers.test.ts`, `cli/tests/unit/migration.test.ts`

**Step 1: Establish expected behaviour**

- Dry-run over a seeded legacy install with one unmanaged `.opencode/agents/local.md` reports exactly one blocking path (not the 22 including managed legacy files) and prints a `DRY-RUN: install would fail …` line instead of `repo bootstrap complete`; exit code stays 0 and the filesystem is untouched.
- A real run keeps its current behaviour: residuals pruned/reported as today, blocked pointers exit 1, manifest finalized first.
- A `.wayforge-managed` that parses to zero paths stops the install with a non-zero exit, an explicit "corrupt/truncated manifest" message naming the file, and remediation (repair/remove the manifest, or remove `.opencode` content manually; note `--force` cannot classify those files because they are no longer traceable). No `.agents/` content is written and the `.wayforge-managed.tmp` created earlier in the run is removed.

**Step 2: Add or update validation**

- `pointers.test.ts`: dry-run residual collection ignores managed files (seed a managed file plus an unmanaged file in the pointer dir; expect only the unmanaged path) and is unchanged for real runs. (owner: **agent**)
- `migration.test.ts`: dry-run reports one residual and the would-fail line; corrupt manifest (`managed_paths:` with no entries) throws `process.exit:1`, leaves `.agents/` absent, leaves the original manifest byte-identical, and leaves no `.wayforge-managed.tmp`. (owner: **agent**)

**Step 3: Write minimal implementation**

1. `pointers.ts:56`: in `collectResiduals`, skip an entry when `ctx.dryRun && isManagedFile(entry)` (pass `ctx` into the helper; `isManagedFile` is already imported in the module). Real runs are unchanged because cleanup happens before the pointer pass.
2. `install.ts`: add one small helper (e.g. `finalizeBlocked(repo, blockedPointers, ctx)`) used at both blocked sites — when `blockedPointers.length > 0`, log `DRY-RUN: install would fail — N path(s) block the runtime pointer(s)` under dry-run and return without the "repo bootstrap complete" line; keep the existing `exit 1` for real runs.
3. `install.ts:141`: replace the silent `falling back to full sync` branch with the corrupt-manifest error path. Because `initManagedManifest` already created `.wayforge-managed.tmp`, remove that tmp file (`fs.rmSync`) before logging the remediation and `process.exit(1)`. Do not attempt to delete anything under `.opencode`.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit cli/tests/integration && cd cli && npx tsc --noEmit && npx eslint src/` (owner: **agent**).

Manual confirmation (owner: **agent**): seeded legacy repo + `--dry-run` → one residual line + would-fail line + exit 0, filesystem unchanged; corrupt manifest → exit 1, no `.agents/`, manifest untouched, no `.tmp` left.

**Step 5: Commit**

`git add cli`
`git commit -m "fix(install): honest dry-run residuals and fail fast on corrupt managed manifest (Issue #227)"`

### Task 3: Junction-safe pointer removal, docs, and full gate

**Objective:** `uninstall` removes junction-based pointers, the decision record and compatibility matrix state the verified scope accurately, and `make check` is green.

**Files:**
- Modify: `cli/src/lib/files.ts` (`rm`)
- Modify: `cli/tests/unit/uninstall.test.ts`
- Modify: `docs/ai/decisions/ADR-0046-generic-agents-artifact-directory.md`, `docs/compatibility-matrix.md`, `docs/ai/logs/2026-10.md`

**Step 1: Establish expected behaviour**

- `rm()` removes a symlink as today, and falls back to `fs.rmdirSync(path)` when `unlinkSync` fails with `EPERM`/`EISDIR` (a Windows junction is a directory reparse point; `rmdir` removes only the link). Normal files and `ENOENT` behaviour are unchanged.
- `uninstall` over a mixed install still removes `.agents/`, both pointer sets, and the manifest; the fallback path is covered by a mocked-`EPERM` test that runs on every platform.
- ADR-0046 no longer claims the Kilo smoke is pending (Task 7 of the original plan verified 7.8.17 via `npx --yes @kilocode/cli@7.8.17`) and records the junction-removal fallback plus the two migration fixes. The matrix marks Windows removal as `pending` (human), never `verified`.

**Step 2: Add or update validation**

- `uninstall.test.ts`: with `fs.unlinkSync` mocked to throw `EPERM` for pointer entries, uninstall still removes the pointer paths via `rmdirSync` and exits cleanly; existing happy-path test unchanged. (owner: **agent**)
- Docs check: `rg -n "pending" docs/ai/decisions/ADR-0046-*.md docs/compatibility-matrix.md` shows only genuinely pending items (Windows creation/relocation/removal). (owner: **agent**)

**Step 3: Write minimal implementation**

1. `files.ts:12`: keep the dry-run log; wrap `fs.unlinkSync` with a catch that re-throws unless the code is `EPERM`/`EISDIR`, in which case `fs.rmdirSync(path)` (which also succeeds for an empty directory). Keep `ENOENT` ignored as today.
2. ADR-0046: correct the Kilo evidence paragraph to `verified 2026-10-26 (7.8.17 via npx)`, extend the pointer-mechanism/Consequences sections with the `rmdir` fallback, and add one line each for the migration permission/config fixes. Do not rewrite the decisions.
3. `docs/compatibility-matrix.md`: pointer-mechanism table — Windows row stays `pending` with a note that removal falls back to `rmdir`; add the fallback to the verification notes.
4. `docs/ai/logs/2026-10.md`: one dated entry for the three fixes with commit SHAs, the two reproduced defects (permissions stripped, skills invisible after migration), and the gate result. Set this plan to `status: completed`, `task: 3/3`.

**Step 4: Run test to verify pass**

Run: `npx vitest run && make check` (owner: **agent**). Expected: all suites green (16+ files / 381+ tests), typecheck, ESLint, Prettier, jscpd under threshold.

Re-run the end-to-end matrix smoke (owner: **agent** for OpenCode, **human** for Kilo/Windows): fresh install per runtime, mixed install, seeded legacy migration (permissions + config assertions), uninstall, then `opencode debug config` / `opencode debug skill` and `npx --yes @kilocode/cli@7.8.17 debug config` / `debug skill`. Windows junction creation, relocation, and removal remain explicitly pending.

**Step 5: Commit**

`git add cli docs`
`git commit -m "fix(uninstall): remove junction pointers and record migration fixes (Issue #227)"`

## Acceptance summary

| Finding | Severity | Task | Evidence of fix |
| --- | --- | --- | --- |
| 1. Migration strips agent permissions | critical | 1 | `permission:` present after the first post-upgrade run; unit + migration + integration assertions |
| 2. Migration keeps legacy config (dangling plugin, no skills) | high | 1 | `.agents` plugin + `skills` strings; `opencode debug skill` lists wayforge skills |
| 3. Dry-run overcounts residuals and claims success | medium | 2 | one residual + `DRY-RUN: install would fail …`, exit 0, filesystem untouched |
| 4. Corrupt manifest dead-ends migration | medium | 2 | non-zero exit before content sync, no `.tmp` left, remediation message |
| 5. Uninstall cannot remove junctions | medium | 3 | mocked-`EPERM` fallback test + ADR/matrix note; Windows verification still pending |

No new flags, no new dependencies, no change to `.agents/` layout, pointer locations, generated config shape, or manifest format.
