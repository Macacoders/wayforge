---
status: completed
created: 2026-10-23
issue: 237
pr: 244
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #237 revision: explicit `wfg update` check and `wfg upgrade`

**Goal:** Replace the automatic release notice and `wfg self-update` with two explicit commands — `wfg update` (check and report only) and `wfg upgrade` (confirm, verify, and install) — so ordinary `wfg` commands other than `update`/`upgrade` never touch the network, while keeping checksum verification and temporary rollback for a failed replacement.

**Architecture:** Keep release resolution in `cli/src/lib/release.ts` but reduce it to the release root, latest-tag lookup, and a read-only `checkForUpdate()` helper; delete the 24-hour update-check cache, its per-user state directory, and the startup notice. Rename the install path from `self-update` to `upgrade`, preserving its download/verify/stage/replace/rollback pipeline. Register `update` and `upgrade` in `index.ts` with no pre-parse hook. Move stale-artifact cleanup to after checksum and archive verification so a failed verification cannot mutate the install. Reconcile README, RELEASE, architecture, ADR-0047, ADR-0031, the existing #237 plan, and the October log.

**Tech Stack:** TypeScript CLI (`cli/src/**`), Commander, Node 18+ `fetch`, Vitest, GitHub release assets, system `tar`.

**Scope classification:** `multi-task`

**Task count:** 3

## Blocking decisions and required gates

1. **Architect review is required before implementation.** The review must accept (a) removing the automatic notice/cache entirely rather than keeping a dormant cache, (b) the `update`/`upgrade` command split and exit-code contract, (c) moving stale cleanup behind verification, and (d) the ADR-0047 rewrite. If the architect requires a different command surface, amend this plan before Task 1.
2. **`wfg update` collides with #238's future managed-project command.** Issue #238 currently plans `wfg update --repo <path>` / `wfg update --all` for managed-project refreshes. This PR follows the review's direction: `wfg update` is the CLI release check. #238 must be re-scoped to a different command (for example `wfg project update` or `wfg sync`) before it is implemented. This is not blocking for #237 because #238 is blocked by #229 and is not being implemented here, but it must be recorded so the collision is not discovered late.
3. **External communication is human-owned.** Update PR #244's title/body/testing/breaking-changes text and, if desired, the Issue #237 body to describe the explicit commands and the removal of automatic checks. The planner must not mutate GitHub work items.
4. **Human validation is required at closure** for a real installed `wfg upgrade` on Windows and one Unix-like host, and for a real checksum-mismatch abort.

## Architect review outcome (2026-10-23)

Verdict: **accept with conditions**. Recorded before Task 1 implementation. The conditions are binding on Task 1 and Task 3:

1. **ADR-0047 must preserve the decision trail.** Add `Amended: 2026-10-23`; keep Decisions 1 (trust anchor / same-origin checksum limits) and 6 (replacement strategy, rollback, system `tar`) substantively intact; explicitly enumerate the withdrawn decisions (24-hour latency budget, TTY/CI/blocked-command gating, `WAYFORGE_NO_UPDATE_CHECK`, cache placement, `WAYFORGE_STATE_DIR`, numeric `CACHE_SCHEMA_VERSION` convention) instead of silently erasing them.
2. **Record the `wfg update` name reservation durably.** ADR-0047 (and/or the architecture command-surface section) must state that `wfg update` is the CLI release check and is reserved; #238's managed-project refresh must adopt a different verb before implementation.
3. **Document exit codes and non-interactive behavior in README.** `wfg update` exits 0 for available/up-to-date and 1 on lookup/parse error. `wfg upgrade` exits 0 for updated/up-to-date/user-declined and 1 for dev-checkout, missing prefix, verification failure, or install failure. Non-interactive `wfg upgrade` without `--yes` auto-declines through `promptYesNo`; automation must pass `--yes`.
4. **Record the passive-discovery consequence in ADR-0047.** Installed users get no in-band signal of new releases; discovery is user-initiated (`wfg update`) or external (GitHub releases page). This is the deliberate trade-off of removing the notice.
5. **`release.ts` post-trim dependency hygiene.** Remove the now-unused `isInstalledBinary` import from `install.js`; `release.ts` must be a read-only release-resolution module with no dependency on install-state detection. The allowed direction is `upgrade.ts` -> `release.js`.
6. **State tracking isolation and orphan-cache acceptance explicitly.** `installed-projects.json` / `tracking.resolveStateDir()` are unaffected (no migration, no code change); leftover `update-check.json` files from test/maintainer installs are accepted disposable residue with no cleanup code.
7. **Record the deliberate `--check`/`--dry-run` removal in ADR-0047.** `wfg upgrade` no longer previews asset URLs; `wfg update` is the only non-mutating surface. This is an accepted trade-off, not a gap.

## Verified facts

- `cli/src/index.ts:138-143` currently calls `shouldNotifyUpdate()`/`maybeNotifyUpdate()` before `program.parseAsync()`. This is the only automatic release-check entry point. `--version` uses `getCurrentVersion()` (`cli/src/index.ts:17`).
- `cli/src/lib/release.ts` currently owns the cached notice: `resolveUpdateStateDir()`, `readUpdateCache()`, `writeUpdateCache()`, `isCacheFresh()`, `shouldNotifyUpdate()`, `maybeNotifyUpdate()`, `CACHE_SCHEMA_VERSION`, and `update-check.json` under the state directory. `resolveLatestReleaseVersion()` fetches `${WAYFORGE_RELEASE_ROOT}/latest`, follows the redirect, parses `/tag/vX.Y.Z`, and validates SemVer.
- `cli/src/lib/self-update.ts` currently owns both check and install behavior behind `selfUpdate({ checkOnly, yes, dryRun })`. `cleanupStaleBackups(prefix)` is called at line 385, before the downloads (lines 406-412) and checksum verification (lines 415-439). This is the review finding: a failed checksum currently runs stale cleanup first and can remove `.old-<pid>` / `.wfg-download-<pid>` / `.wayforge-update-<pid>` artifacts from the install.
- The actual install mutation begins after verification: extraction under `<prefix>/share/.wayforge-update-<pid>`, staging to `<prefix>/bin/.wfg-download-<pid>`, then `replaceInstall()` (share first, binary second, `*.old-<pid>` backups). `replaceInstall()` restores backups on a binary-backup or new-binary failure.
- `cli/src/lib/install.ts` provides `isInstalledBinary()` (running executable named `wfg`/`wfg.exe` plus a resolved source directory containing `base/` and `VERSION`) and `resolveInstallPrefix()` (`WAYFORGE_INSTALL_DIR` first, else `<dir of process.execPath>/..`, requiring `share/wayforge`).
- `cli/src/lib/version.ts` provides `parseSemver()`, `compareVersions()`, `isNewer()`, and `getCurrentVersion()` (`WAYFORGE_VERSION`, then `VERSION` in `resolveSourceDir()`, then `0.0.0`). Release builds inline the real version with `--define` (`.github/workflows/release.yml:58-65`).
- `cli/src/commands/self-update.ts` is a thin wrapper that exits 1 for `dev-checkout`/`no-prefix` and prints the one-shot installer fallback on failure. `cli/src/index.ts:107-127` registers `self-update` with `--check`, `--yes`, and `--dry-run`.
- Release CI already publishes `wayforge-checksums.txt` covering every platform binary and both share archives (`.github/workflows/release.yml:103-108`, uploaded at line 122). No release-workflow behavior change is needed; only the comment mentioning `self-update` should be updated.
- `cli/tests/unit/release.test.ts` (612 lines) contains release resolution, state-directory/cache, installed-binary/prefix, `shouldNotifyUpdate`, and `maybeNotifyUpdate` tests. `cli/tests/unit/self-update.test.ts` (679 lines) contains checksum/extraction/replacement/rollback tests plus `--check`/`--dry-run`/prompt/install tests.
- Active user docs describe the automatic notice and `self-update`: `README.md:103-121`, `RELEASE.md:273`, `docs/ai/architecture.md:28,36`. ADR-0047 records the automatic notice/cache as accepted; ADR-0031's 2026-10-21 amendment adds a `release.ts` state-dir exception for it. The existing plan is `docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md` with `status: completed`.
- Issue #238 (verified through the GitHub API) plans `wfg update --repo <path>` and `wfg update --all` for managed-project refreshes. The command name is now taken by the CLI release check.
- No useful gap remains that requires a `research` subagent; `docs/ai/**` plus direct inspection of the affected source, tests, ADRs, and release workflow are sufficient.

## Resolved decisions

1. **Command surface.**
   - `wfg update` is read-only. It resolves the latest release, prints the current and latest versions, and reports either `update available: run 'wfg upgrade'` or `wayforge is up to date`. It performs no download and writes nothing.
   - `wfg upgrade` is the only install path. It requires an installed binary and a resolvable prefix, resolves the latest release, prints up-to-date and exits 0 when there is nothing newer, prompts `Upgrade wayforge vA.B.C -> vX.Y.Z? [y/N]` unless `--yes`, then downloads, verifies, replaces, and reports `upgraded wayforge to vX.Y.Z`.
   - `wfg upgrade --yes` is retained. `--check` and `--dry-run` are removed: `wfg update` is the check, and this PR does not add a new preview surface. `wfg self-update` is removed entirely; there is no alias because this feature has not shipped.
   - `wfg update` may run from a source checkout (it is read-only and uses `getCurrentVersion()`). `wfg upgrade` refuses from a source checkout and points at `git pull` or the one-shot installer.
   - Exit codes: `wfg update` exits 0 whether or not a newer release exists, and 1 on a release-lookup/parse error. `wfg upgrade` exits 0 for updated, up-to-date, or user-declined, and 1 for dev-checkout, missing prefix, verification failure, or installation failure. No downgrade path is provided.
2. **No automatic network access.** Delete `maybeNotifyUpdate`, `shouldNotifyUpdate`, the pre-parse call, the 24-hour cache, `update-check.json`, `resolveUpdateStateDir`, the cache schema, `WAYFORGE_NO_UPDATE_CHECK`, and the cache-related `WAYFORGE_STATE_DIR` documentation. Every explicit `wfg update`/`wfg upgrade` performs a fresh release lookup; there is no TTL and no silently cached failure. Keep `WAYFORGE_RELEASE_ROOT` as the test/override seam and the existing 5-second lookup / 60-second download timeouts.
3. **Verification before mutation.** Keep SHA-256 verification of the platform binary and share archive, `base/` + `VERSION` validation, staged replacement, and temporary backup/rollback. Move `cleanupStaleBackups(prefix)` from before the downloads to after `verifyExtractedShare()` (and after checksum verification) and before staging/replacement. A failed checksum, missing checksum entry, or invalid archive must leave the binary, `share/wayforge`, stale backups, and stale temp artifacts untouched.
4. **Temporary rollback is not user-facing backup/downgrade support.** Document `*.old-<pid>` backups as a failure-recovery mechanism only. Successful upgrades remove their own backups; stale artifacts older than 7 days are removed only on a verified replacement path. There is no command to restore an old version and no version-downgrade behavior.
5. **Module and test naming.** Rename `cli/src/lib/self-update.ts` to `cli/src/lib/upgrade.ts`, `cli/src/commands/self-update.ts` to `cli/src/commands/upgrade.ts`, and `cli/tests/unit/self-update.test.ts` to `cli/tests/unit/upgrade.test.ts`. Add `cli/src/commands/update.ts`. Keep `cli/src/lib/release.ts` as the release-resolution module and add `checkForUpdate()` there so `update` and `upgrade` share one current/latest comparison. Move the installed-binary/prefix tests out of `release.test.ts` into `upgrade.test.ts` (or a dedicated `install.test.ts`; prefer `upgrade.test.ts` to avoid a new test file).
6. **ADR reconciliation.** Rewrite ADR-0047's title, context, decisions, and consequences around explicit `update`/`upgrade`, no automatic notice/cache/state directory, verification ordering, and the trust-anchor limits. Remove the 24-hour latency budget, cache placement, numeric cache schema, and blocked-command decisions. Keep the same-origin checksum trust-anchor limitation, the replacement strategy, and the platform-derived `win32` exceptions. Update ADR-0031's amendment to remove the `release.ts` state-directory exception and rename the `self-update.ts` exception to `upgrade.ts`.
7. **Existing #237 plan.** Mark `docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md` as `status: superseded` and add a `## Revision (2026-10-23)` section that records the revised commands, the no-automatic-check rule, the verification-ordering fix, the revised acceptance criteria, and a link to this plan. Preserve the historical task/closure notes below that section; do not rewrite history as if the old design had never existed.
8. **Out of scope.** The proposed rename of `wfg install` to `bootstrap` or `onboard` is a separate naming decision and must not be bundled. Managed-project `wfg status`, `wfg update --repo/--all`, pruning, and Git hooks remain #238. No automatic release check, notice, cache, daemon, scheduler, runtime notifier, user-facing backup/restore, or version-downgrade command is added.

## Tasks

### Task 1: Replace the startup notice and `self-update` with explicit `update` and `upgrade`

**Objective:** `wfg update` checks and reports a newer CLI release without installing it; `wfg upgrade` confirms and installs the newer release; `wfg` commands other than these two perform no release-check network access.

**Files:**
- Create: `cli/src/commands/update.ts`
- Rename: `cli/src/commands/self-update.ts` -> `cli/src/commands/upgrade.ts`
- Rename: `cli/src/lib/self-update.ts` -> `cli/src/lib/upgrade.ts`
- Modify: `cli/src/lib/release.ts`
- Modify: `cli/src/index.ts`
- Rename: `cli/tests/unit/self-update.test.ts` -> `cli/tests/unit/upgrade.test.ts`
- Modify: `cli/tests/unit/release.test.ts`

**Step 1: Establish expected behaviour**

- `wfg update` prints (formatting both versions with exactly one leading `v`):
  ```text
  current version: v1.0.2
  latest version: v1.1.0
  update available: run 'wfg upgrade'
  ```
  or `wayforge is up to date` when the installed version is current or newer. It never downloads, extracts, or writes.
- `wfg update` works from a source checkout; it does not call `isInstalledBinary()`.
- `wfg upgrade` refuses from a source checkout with the installer fallback, refuses when no prefix is resolvable, prints `wayforge is up to date (vA.B.C)` when nothing is newer, prompts unless `--yes`, and prints `upgraded wayforge to vX.Y.Z` on success.
- `wfg upgrade` never downgrades when the latest release is older than the installed version.
- Normal commands (`install`, `uninstall`, `interactive`, `--help`, `--version`) do not import or invoke any automatic release check; no state directory, cache, TTY/CI gate, or `WAYFORGE_NO_UPDATE_CHECK` path remains.
- `wfg self-update` is no longer registered.

**Step 2: Add or update validation**

`cli/tests/unit/release.test.ts`:

- Keep `resolveReleaseRoot` default/override tests.
- Keep `resolveLatestReleaseVersion` redirect parsing, `WAYFORGE_RELEASE_ROOT`, non-tag rejection, invalid-SemVer rejection, and non-OK rejection tests.
- Add `checkForUpdate()` tests: newer release (`updateAvailable: true`), equal version (`false`), older latest (`false`, no downgrade), and source-checkout use via `WAYFORGE_VERSION` without an install fixture.
- Delete all state-directory/cache/`shouldNotifyUpdate`/`maybeNotifyUpdate` tests and imports.

`cli/tests/unit/upgrade.test.ts`:

- Rename imports from `selfUpdate` to `upgrade` and update outcome names.
- Keep `parseChecksums`, `sha256File`, `replaceInstall` success/rollback/binary-backup-failure, and `cleanupStaleBackups` tests.
- Move the `isInstalledBinary` and `resolveInstallPrefix` describe blocks here from `release.test.ts`.
- Keep dev-checkout refusal, no-prefix, up-to-date, prompt/decline, checksum-mismatch, missing-checksum-entry, bad-archive, and local-HTTP successful-upgrade tests.
- Delete `--check` and `--dry-run` tests.
- Add an explicit assertion that a successful upgrade removes only its own backups and stale artifacts; the existing stale-cleanup success test can be adapted.

**Step 3: Write minimal implementation**

1. In `cli/src/lib/release.ts`, remove the `fs-extra`, `path`, and `os` imports, the now-unused `isInstalledBinary` import from `install.js`, and all cache/notice code (`UpdateCache`, `CACHE_SCHEMA_VERSION`, `resolveUpdateStateDir`, `cachePath`, `readUpdateCache`, `writeUpdateCache`, `isCacheFresh`, `NotifyOptions`, `UPDATE_CHECK_BLOCKED_COMMANDS`, `shouldNotifyUpdate`, `maybeNotifyUpdate`). Keep `DEFAULT_RELEASE_ROOT`, `resolveReleaseRoot`, `resolveLatestReleaseVersion`, `TAG_RE`, and the 5-second fetch timeout. Add:
   ```ts
   export interface ReleaseCheck {
       current: string
       latest: string
       updateAvailable: boolean
   }

   export async function checkForUpdate(
       options: { releaseRoot?: string; fetchImpl?: typeof fetch } = {},
   ): Promise<ReleaseCheck> {
       const current = getCurrentVersion()
       const latest = await resolveLatestReleaseVersion(options)
       return { current, latest, updateAvailable: isNewer(current, latest) }
   }
   ```
2. Rename `cli/src/lib/self-update.ts` to `cli/src/lib/upgrade.ts`. Rename `SelfUpdate*` types to `Upgrade*`, remove `checkOnly`/`dryRun` from options and `check`/`dry-run` from outcomes, update the prompt to `Upgrade wayforge ...`, and update the `USER_AGENT`/error strings to `upgrade`. After the dev-checkout/no-prefix gates, call `checkForUpdate()` from `release.js` for the current/latest comparison instead of duplicating `getCurrentVersion()` + `isNewer()`; keep `getCurrentVersion()` only for the early failure results. Keep the download, checksum, extraction, staging, `replaceInstall`, rollback, and `cleanupStaleBackups` helpers.
3. Add `cli/src/commands/update.ts` with a thin `updateCommand()` that calls `checkForUpdate()`, prints current/latest and availability, and on error prints `error: update check failed: ...` and exits 1. Print to stdout; no prompt and no writes.
4. Rename `cli/src/commands/self-update.ts` to `cli/src/commands/upgrade.ts`, rename `SelfUpdateCommandOptions` to `UpgradeCommandOptions`, keep only `yes`, change the error prefix to `error: upgrade failed: ...`, and keep the dev-checkout/no-prefix exit-1 behavior and installer fallback.
5. In `cli/src/index.ts`, import `updateCommand` and `upgradeCommand`; remove the `maybeNotifyUpdate`/`shouldNotifyUpdate` imports and the pre-parse call in `main()`. Register:
   ```ts
   program
       .command('update')
       .description('Check for a newer wayforge CLI release without installing it')
       .action(async () => {
           await updateCommand()
       })

   program
       .command('upgrade')
       .description('Download, verify, and install the latest wayforge CLI release')
       .option('--yes', 'Skip the confirmation prompt', false)
       .action(async (options: Record<string, unknown>) => {
           await upgradeCommand({ yes: Boolean(options.yes) })
       })
   ```
   Remove the `self-update` registration. Keep `getCurrentVersion()` for `--version`.
6. Update the test files as described in Step 2. Use a local HTTP server and a temporary prefix for the successful upgrade test; do not write to the real user state directory.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/release.test.ts cli/tests/unit/upgrade.test.ts cli/tests/unit/version.test.ts
cd cli; npx tsc --noEmit
npx tsx cli/src/index.ts update --help
npx tsx cli/src/index.ts upgrade --help
npx tsx cli/src/index.ts --help
```

Expected: tests pass, typecheck is clean, `update` and `upgrade` are listed, `upgrade` shows only `--yes`, `self-update` is absent, and no command prints an automatic notice or blocks on a network check.

**Step 5: Commit**

```sh
git add cli/src/commands/update.ts cli/src/commands/upgrade.ts cli/src/lib/upgrade.ts cli/src/lib/release.ts cli/src/index.ts cli/tests/unit/upgrade.test.ts cli/tests/unit/release.test.ts
git commit -m "refactor(cli): replace self-update with explicit update and upgrade (Issue #237)"
```

### Task 2: Verify before mutating — move stale cleanup after checksum and archive validation

**Objective:** A failed checksum or archive verification leaves the installed binary, `share/wayforge`, and all pre-existing stale backup/temp artifacts exactly as they were.

**Files:**
- Modify: `cli/src/lib/upgrade.ts`
- Modify: `cli/tests/unit/upgrade.test.ts`

**Step 1: Establish expected behaviour**

- The sequence inside `upgrade()` is: download all assets into the OS temp directory, parse and compare both SHA-256 hashes, extract the share, validate `base/` and `VERSION`, then and only then run stale cleanup, stage the verified binary, and replace the install.
- If checksum verification fails, `cleanupStaleBackups()` is never called. Existing `*.old-<pid>` backups, `.wfg-download-<pid>` staging files, and `.wayforge-update-<pid>` directories remain untouched. The binary and share content are unchanged.
- If extraction validation fails after a valid checksum, cleanup is also not called; the temporary extraction directory created by this run is removed in `finally`, and the install remains unchanged.
- On a successful verified upgrade, stale artifacts older than 7 days are removed as before, and the current run's own backups are removed after replacement.

**Step 2: Add or update validation**

In `cli/tests/unit/upgrade.test.ts`, add a regression test:

- Create an install fixture with a current binary (`old-binary`) and share `VERSION` `1.0.0`.
- Seed an old `wfg.exe.old-999` (or `wfg.old-999` on Unix), an old `.wfg-download-999`, and an old `share/wayforge.old-999`, all with mtimes older than 7 days.
- Serve a release whose checksum file deliberately mismatches the share archive (reuse the existing checksum-mismatch server fixture).
- Call `upgrade({ yes: true, prefix, log })` and expect a `/checksum mismatch/` rejection.
- Assert the old binary still reads `old-binary`, `share/wayforge/VERSION` is still `1.0.0`, and all three seeded artifacts still exist.
- Optionally repeat the assertion for a checksum file missing an asset entry, confirming no cleanup occurs on that failure too.
- Keep the existing successful-upgrade test that asserts stale artifacts are removed after a verified replacement.

**Step 3: Write minimal implementation**

- In `cli/src/lib/upgrade.ts`, delete the `cleanupStaleBackups(prefix)` call currently made immediately after confirmation and before `mkdtemp`.
- Call `cleanupStaleBackups(prefix)` after `await sha256File(...)` checks, `extractArchive(...)`, and `verifyExtractedShare(extractDir, latest)` succeed, and immediately before `fs.copySync(downloadedBinaryPath, stagedBinaryPath)` / `replaceInstall(...)`.
- Do not move downloads or extraction back into the install path before verification. Keep the `finally` cleanup of this run's `stagedBinaryPath`, `extractDir`, and `tmpDir`.
- Do not weaken `replaceInstall()` rollback; it remains the recovery mechanism for failures after verification.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/upgrade.test.ts
cd cli; npx tsc --noEmit
```

Expected: the checksum-mismatch regression test proves stale artifacts survive, the successful-upgrade test proves stale artifacts are cleaned only after verification, and rollback tests remain green.

**Step 5: Commit**

```sh
git add cli/src/lib/upgrade.ts cli/tests/unit/upgrade.test.ts
git commit -m "fix(cli): verify release before cleaning stale install artifacts (Issue #237)"
```

### Task 3: Reconcile user docs, ADR-0047, ADR-0031, the #237 plan, and memory

**Objective:** Every active document describes explicit `wfg update`/`wfg upgrade`, no automatic release checks, verification-before-mutation, and temporary rollback only.

**Files:**
- Modify: `README.md`
- Modify: `RELEASE.md`
- Modify: `docs/ai/architecture.md`
- Modify: `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md`
- Modify: `docs/ai/decisions/ADR-0031-cross-platform-parity-conventions.md`
- Modify: `docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md`
- Modify: `docs/ai/logs/2026-10.md`
- Modify: `.github/workflows/release.yml` (comment only)

**Step 1: Establish expected documentation behaviour**

- README has one "Update the CLI" section: `wfg update` checks only; `wfg upgrade` installs after confirmation; `--yes` skips the prompt; commands other than `update`/`upgrade` do not check for releases; verification and rollback are installation-safety measures, not backup/downgrade support; source checkouts use `git pull` or the one-shot installer; exit codes and non-interactive auto-decline behavior are documented. Remove the "Update notices" and "Self-update" sections and the `WAYFORGE_NO_UPDATE_CHECK` / `WAYFORGE_STATE_DIR` guidance.
- RELEASE says `wfg upgrade` verifies the binary and share hashes against `wayforge-checksums.txt` before any filesystem mutation; `wfg update` only reports availability.
- Architecture lists `update` and `upgrade` in the command surface, removes `self-update`, states that commands other than `update`/`upgrade` never check releases, reserves `wfg update` for the CLI release check, and says stale cleanup happens only after verification on the replacement path.
- ADR-0047 is rewritten around explicit commands and no automatic notice/cache. It keeps Decisions 1 (release-root trust anchor and same-origin checksum limitation) and 6 (replacement strategy, rollback, system `tar`) substantively intact; explicitly enumerates the withdrawn decisions (24-hour latency budget, TTY/CI/blocked-command gating, `WAYFORGE_NO_UPDATE_CHECK`, cache placement, `WAYFORGE_STATE_DIR`, numeric `CACHE_SCHEMA_VERSION`); records passive discovery, tracking isolation/orphan-cache acceptance, the `wfg update` name reservation, and the deliberate `--check`/`--dry-run` removal.
- ADR-0031's 2026-10-21 amendment is replaced with a 2026-10-23 amendment: the new `upgrade.ts` platform-derived checks are the only added `win32` exceptions, the existing `tracking.ts` exception remains, and the `release.ts` state-directory exception is removed.
- The existing #237 plan is marked `status: superseded` and gains a `## Revision (2026-10-23)` section listing the revised commands, no-automatic-check rule, verification ordering, revised acceptance criteria, and a link to this plan. Historical task/closure notes remain below it.
- The October log keeps the 2026-10-22 entry as history and adds a 2026-10-23 revision entry explaining that the automatic notice/cache and `self-update` were superseded.

**Step 2: Add or update validation**

- Run a stale-reference sweep over active code and docs:
  ```powershell
  rg -n "maybeNotifyUpdate|shouldNotifyUpdate|WAYFORGE_NO_UPDATE_CHECK|WAYFORGE_STATE_DIR|update-check|self-update" cli/src cli/tests README.md RELEASE.md docs/ai/architecture.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md docs/ai/decisions/ADR-0031-cross-platform-parity-conventions.md docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md
  ```
  Expected: no matches in `cli/src`, `cli/tests`, README, RELEASE, architecture, or ADR-0031; ADR-0047 and the old plan may mention `self-update` only in an explicit "replaced by" revision note.
- Check that every link added to ADR-0047 and the old plan resolves to an existing file.
- Confirm the release-workflow comment no longer says `self-update` looks up checksums.
- Confirm the existing plan's frontmatter is `status: superseded` and the revision section links to this plan.

**Step 3: Write minimal documentation changes**

- README: replace lines 103-121 with a single `### Update the CLI` section using the exact command names and the no-automatic-check statement. Remove all cache/state/opt-out text.
- RELEASE: update the checksum bullet at line 273 from `wfg self-update` to `wfg upgrade`; add one sentence that `wfg update` is report-only.
- Architecture: update the command list at line 28 and the self-update bullet at line 36; remove "notice"/"cache" language.
- ADR-0047: rewrite the title to `# ADR-0047: CLI Release Check and Verified Upgrade`, add `Amended: 2026-10-23` to the status block, keep Decisions 1 and 6 substantively intact, explicitly enumerate the withdrawn decisions from Architect condition 1, and add the explicit-command, no-cache, verification-ordering, and platform-exception decisions. Record passive discovery, tracking isolation/orphan-cache acceptance, the `wfg update` reservation, and the deliberate `--check`/`--dry-run` removal. Update the Related section to this plan and to ADR-0031/0035/0045.
- ADR-0031: replace the 2026-10-21 amendment line with the 2026-10-23 amendment described above.
- Existing #237 plan: change the frontmatter to `status: superseded`, insert the revision section near the top, and leave the historical tasks/closure notes below it. Do not mark the old acceptance criteria as currently true.
- `.github/workflows/release.yml`: change the comment `self-update looks up` to `upgrade looks up`. Do not change artifact names, checksum generation, or upload behavior.
- `docs/ai/logs/2026-10.md`: add the revision entry under 2026-10-23. Do not rewrite the 2026-10-22 entry.

**Step 4: Run validation to verify pass**

```powershell
rg -n "maybeNotifyUpdate|shouldNotifyUpdate|WAYFORGE_NO_UPDATE_CHECK|WAYFORGE_STATE_DIR|update-check|self-update" cli/src cli/tests README.md RELEASE.md docs/ai/architecture.md docs/ai/decisions/ADR-0031-cross-platform-parity-conventions.md
npx tsx cli/src/index.ts --help
npx tsx cli/src/index.ts update --help
npx tsx cli/src/index.ts upgrade --help
```

Expected: the sweep is empty; help lists `update` and `upgrade` and not `self-update`; `upgrade` shows only `--yes`. Then run the full gate:

```powershell
make check
```

Expected: typecheck, Vitest, ESLint, Prettier, and jscpd all pass.

**Step 5: Commit**

```sh
git add README.md RELEASE.md docs/ai/architecture.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md docs/ai/decisions/ADR-0031-cross-platform-parity-conventions.md docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md docs/ai/logs/2026-10.md .github/workflows/release.yml
git commit -m "docs: reconcile update and upgrade direction (Issue #237)"
```

## Validation ownership

| Validation | Owner |
|---|---|
| `checkForUpdate` / release-resolution tests | agent |
| `upgrade` checksum/extraction/replacement/rollback tests | agent |
| Stale-cleanup-after-verification regression test | agent |
| Installed-binary/prefix tests | agent |
| `update --help` / `upgrade --help` / `--help` smoke | agent |
| Stale-reference sweep over active code/docs | agent |
| `make check` | agent |
| Architect review of command surface, cache removal, ADR-0047, and #238 collision | architect |
| Real `wfg upgrade` on Windows (running-exe rename) | human |
| Real `wfg upgrade` on one Linux/macOS host | human |
| Real checksum-mismatch abort leaves the install and stale artifacts untouched | human |
| Ordinary commands make no release-check request with the network unavailable | human |
| First release publishing `wayforge-checksums.txt` | human |
| PR #244 / Issue #237 body reconciliation | human |

## Acceptance criteria

- [x] No `wfg` command other than the explicit `update`/`upgrade` performs a release check or prints an update notice; there is no startup hook, cache, `update-check.json`, `WAYFORGE_NO_UPDATE_CHECK`, or cache-related `WAYFORGE_STATE_DIR`.
- [x] `wfg update` reports current and latest versions and whether a newer release exists, downloads nothing, modifies nothing, and works from a source checkout.
- [x] `wfg upgrade` refuses from a source checkout or missing prefix, prints up-to-date without downgrading, prompts unless `--yes`, verifies SHA-256 checksums before mutating the install, replaces `share/wayforge` and `bin/wfg[.exe]`, rolls back on replacement failure, and reports the new version.
- [x] A missing or mismatched checksum, or an invalid extracted share, aborts with the original binary/share intact and with pre-existing stale backups/temp artifacts untouched.
- [x] Stale cleanup runs only after checksum and archive verification; a successful verified upgrade removes stale artifacts older than 7 days and its own backups.
- [x] `wfg self-update` is gone; no compatibility alias is added.
- [x] `wayforge-checksums.txt` publication is unchanged, and the release workflow comment describes `upgrade` verification.
- [x] README, RELEASE, architecture, ADR-0047, ADR-0031, the existing #237 plan, and the October log reflect the revised direction.
- [x] README documents `wfg update` / `wfg upgrade` exit codes and the non-interactive auto-decline behavior; automation is told to pass `--yes`.
- [x] ADR-0047 preserves Decisions 1 and 6, enumerates the withdrawn decisions, records passive discovery and tracking isolation, reserves `wfg update`, and records the `--check`/`--dry-run` removal.
- [x] Tests cover the update check, upgrade prompt/decline/up-to-date, checksum failures, verification-before-cleanup ordering, successful local-HTTP upgrade, and rollback.
- [x] `make check` is green.
- [x] Architect review is recorded before implementation; `memory_update` is recorded at closure.
- [x] The #238 naming collision is recorded and assigned a follow-up decision.

## Out of scope

- Renaming `wfg install` to `bootstrap` or `onboard`; that requires a separate naming/scope decision.
- Managed-project `wfg status`, `wfg update --repo <path>`, `wfg update --all`, manifest pruning, and Git hooks (#238). Note the command-name collision above.
- Automatic release checks, notices, caches, daemons, OS schedulers, or runtime notifier plugins.
- User-facing backup, restore, or version-downgrade commands. Temporary rollback exists only for failed replacement.
- Installer checksum verification (`install.sh` / `install.ps1`) — unchanged follow-up.
- New release asset names or checksum-file format changes.
- Changing `installed-projects.json`, `.wayforge-managed`, or #229 tracking behavior.

## Dependencies and blockers

- PR #244 branch: `feature/issue-237-cli-release-detection-self-update`.
- The release workflow already publishes checksums; the first release shipping this code must continue to do so. Earlier releases cannot be `wfg upgrade` targets.
- #238 is blocked by #229 and must be re-scoped for the `wfg update` name before implementation. It is not a blocker for this revision if the review's command names are accepted.
- Human validation on Windows and Unix remains required because the running-binary replacement path cannot be fully proven by unit tests.
- The planner must not edit GitHub issues or PRs; the human-owned communication step is listed in Task 3 and the validation table.

## Revision and closure notes

- This plan supersedes the implementation direction in `docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md` for the automatic-notice/cache and `wfg self-update` portions. The old plan is marked `superseded` with a revision section and retains its historical task/closure notes.
- Architect review gate recorded 2026-10-23: **accept with conditions**. The conditions were applied in Tasks 1 and 3.
- Implementation completed and reviewed 2026-10-23. **No commits were made at the user's request**; all changes remain in the worktree for user inspection.
- Validation: `make check` green — 383 passed / 2 skipped, typecheck, ESLint, Prettier, and jscpd 6.31% duplicated lines / 7.64% duplicated tokens (below the 8% threshold). Focused `upgrade` suite 25 passed; help smoke lists `update`/`upgrade` and not `self-update`; the active-doc stale-reference sweep is clean.
- Human validation still outstanding: real `wfg upgrade` on Windows and one Unix-like host, a real checksum-mismatch abort on an installed binary, ordinary commands with no network available, and `wayforge-checksums.txt` on the first release shipping this code.
- #238 follow-up: `wfg update` is reserved for the CLI release check; #238's managed-project refresh must adopt a different verb before implementation.
- PR #244 and Issue #237 descriptions were not edited by the planner; their reconciliation remains human-owned.
- Final git-evidence review 2026-10-23: **accept**. The architect review-only pass found no blocking issues. `ai-memory close-check` reports the monthly log, architecture, and ADRs present; the worktree is dirty by design because no commits were requested. All agent-verifiable acceptance criteria above are checked; the human-owned validations in the table remain outstanding.
- Post-closure 2026-10-26: commit `7fe8404` (refactor(cli): drop unused semver and artifact naming duplication) applied the ponytail cleanup and was pushed to `origin/feature/issue-237-cli-release-detection-self-update`. The "no commits were made" and "worktree dirty by design" notes above describe the pre-commit state only.
