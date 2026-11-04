---
status: completed
created: 2026-11-03
task: 4/4
required_gates:
  architect_review: true
  memory_update: true
---

# PR #272 review remediation: signed-era install verification and Windows cosign checks

**Goal:** Close review items 1 and 2 of PR #272 by making the quick-start verify the manifest bundle before trusting it, making both installers fail closed for releases at or after the first signed release (with an explicit `--allow-unsigned` / `-AllowUnsigned` opt-in), verifying the cosign bundle on Windows, and reconciling the docs and ADRs with the new contract.

**Architecture:** A hardcoded `COSIGN_REQUIRED_FROM` cutoff (`1.1.0`) classifies each target release as signed-era or legacy. Signed-era releases require cosign plus a valid `.sigstore.json` bundle before any asset hash is checked; a missing cosign, missing bundle, or missing manifest aborts unless the operator opts out. Legacy releases keep the current hash-only fallback. `install.ps1` gains the same matrix by shelling out to `cosign verify-blob` (no new managed dependency). README/RELEASE move `cosign verify-blob` ahead of the installer hash check and execution, and ADR-0048/ADR-0035 record the contract change.

**Tech Stack:** POSIX `sh` (`install/install.sh`), PowerShell 5.1 (`install/install.ps1`), cosign v3.1.4 bundles, bats, Pester, Markdown docs/ADRs.

**Scope classification:** `multi-task` (4 tasks; two independent installer surfaces plus docs and ADR/release-note reconciliation)

**Task budget rationale:** Four independently reviewable slices are required: (1) POSIX policy and its bats suite, (2) Windows policy and its Pester suite, (3) user-facing bootstrap/policy docs, and (4) durable decision records plus release notes. Tasks 1 and 2 cannot be combined without mixing two runtimes and two test harnesses; task 4 must land in the same merge as tasks 1-3 because ADR-0035/ADR-0048 currently document the old warn-and-continue contract.

## Starting state (important)

The working tree is **dirty** with a partial implementation from the previous session:

- `install/install.sh` (unstaged): `ALLOW_UNSIGNED`, `COSIGN_REQUIRED_FROM`, `version_ge()`, `signed_era()`, fail-closed branches, `--allow-unsigned`, dry-run messaging.
- `install/install.ps1` (unstaged): `-AllowUnsigned`, `$CosignRequiredFrom`, `Test-VersionAtLeast`, `Test-ChecksumSignature`, fail-closed branches, dry-run messaging.
- `README.md` (unstaged): quick-start rewritten to verify the bundle before the installer hash.

Assumption: implementers continue from this worktree (recommended) rather than resetting it; Task 1 and Task 2 start by reviewing/validating it. If the worktree is reset, re-apply the described changes as part of the same steps.

**Already landed in `cb6870b` (do not redo):** workflow SHA-pinning/least-privilege/draft-first publishing; exact `--certificate-identity` in `install.sh`; Node `SHASUMS256.txt` verification; archive path-traversal rejection; `wfg upgrade` hash-only warning; `docs/ai/logs/2026-11.md`. The only outstanding inconsistency from that commit is ADR-0035 Decision 11, which still calls the Node.js checksum check out of scope (fixed in Task 4).

## Confirmed planning decisions

1. **Cutoff is a hardcoded version, not a 404 heuristic.** `install.sh` and `install.ps1` compare the target tag against `COSIGN_REQUIRED_FROM` (internal default `1.1.0`, confirmed by the maintainer). Releases at or above it are signed-era. A test-only override (`WAYFORGE_COSIGN_REQUIRED_FROM`) keeps the 9.9.9 fixtures usable and lets tests exercise the legacy branch. **The version is an internal cutoff only:** the release version is declared when the branch merges to `main`, so user-facing docs, CHANGELOG, and ADRs must not announce `1.1.0` or publish release notes for it.
2. **Signed-era policy is fail-closed.** Missing cosign, confirmed-missing bundle (HTTP 404), or confirmed-missing manifest abort before any prefix mutation. `--allow-unsigned` / `-AllowUnsigned` (or `WAYFORGE_ALLOW_UNSIGNED=1`) is the only bypass.
3. **`--allow-unsigned` never bypasses a bad signature.** It only covers absent verification material (cosign not installed, bundle/manifest 404). A present-but-invalid bundle or a non-404 bundle fetch failure always aborts, even with the opt-in.
4. **Legacy releases keep the old fallback.** Below the cutoff, cosign absent or bundle 404 warns and continues hash-only, matching Issue #271's historical acceptance criteria.
5. **Windows verifies automatically.** `install.ps1` downloads the bundle and runs `cosign verify-blob` when cosign is present; the manual command remains documented for users without cosign, but Windows is no longer "manual only".
6. **Bootstrap trusts the bundle before the manifest.** README/RELEASE run `cosign verify-blob` on `wayforge-checksums.txt` **before** the installer hash check and before executing the installer. This makes cosign a documented prerequisite for signed-era installs.
7. **ADRs are amended, not superseded.** ADR-0048 gets an updated matrix and a new cutoff/opt-in decision; ADR-0035 Decisions 11, 13, and 14 are amended with `**Amended**: 2026-11-03`, preserving `Status: Accepted`.
8. **Issue #271 acceptance criteria are updated** from "warn and continue" to the cutoff contract; maintainer authorization was granted on 2026-11-03.

## Repository facts the implementer needs

- `install/install.sh`: `ALLOW_UNSIGNED` (line 18), `COSIGN_REQUIRED_FROM` (line 50), `--allow-unsigned` parsing (lines 122-125) and usage (lines 77-79), `version_ge()` (lines 315-327), `signed_era()` (lines 331-333), `verify_checksum_signature()` (lines 366-410), manifest-404 branch (lines 658-668), dry-run cosign messaging (lines 616-625).
- `install/install.ps1`: `[switch]$AllowUnsigned` (line 49), env opt-in (lines 55-57), `$CosignRequiredFrom` (line 67), `Test-VersionAtLeast` (lines 393-408), `Test-ChecksumSignature` (lines 410-452), `$signedEra` (line 477), manifest-404 branch (lines 528-537), verification call (line 543).
- `tests/bash/install_sh.bats`: helpers `install_env` (line 45), `run_full_install` (line 135), `stub_cosign` (line 178); cosign tests at lines 337-398; traversal test at lines 425-436. Every `run_full_install` call without `stub_cosign` now hits signed-era enforcement because the fixture version is 9.9.9.
- `tests/powershell/install.Tests.ps1`: `Invoke-WebRequest` stub (lines 17-35), `$script:installChild` (lines 38-48), checksum tests (lines 265-305), PATH test (line 356). The stub has no bundle handling and no `cosign` stub; `installChild` uses `-Version 9.9.9`, so all non-dry-run tests will fail closed once Task 2 lands.
- `README.md` lines 9-48: current quick-start (already partly rewritten in the worktree); line 50 still carries the SignPath "Authenticode-signed" section merged from develop, which PR #283 removes.
- `RELEASE.md` lines 119-139 (install commands) and lines 291-295 (checksums/verification policy) still describe hash-only bootstrap, the regexp pin, and warn-and-continue.
- `docs/security/installer-trust.md` lines 45-79 (verification policy) and lines 81-91 ("What signing proves" / non-goals) still say warn-and-continue and "Windows manual only".
- `docs/ai/architecture.md` lines 10, 30, and 35 describe hash-only bootstrap, warn-and-continue, and Windows manual verification.
- `docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md` Decision 3 matrix (lines 18-28) and Decision 4/5 (lines 30-32); no `**Amended**` header yet.
- `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md` Decision 11 (line 60) says nodejs.org checksum verification is out of scope; Decision 13 (line 62) documents the 404 fail-open fallback; Decision 14 (line 64) still says regexp pin, warn-and-continue, and `install.ps1` manual-only.
- `CHANGELOG.md` `[Unreleased]` lines 14-32: the `install.sh` entry still says warn-and-continue and needs the new contract.
- `docs/ai/logs/2026-11.md` exists (created in `cb6870b`); the 2026-11-03 entry needs the policy change appended.

## Resolved decisions (2026-11-03)

1. **Worktree disposition:** continue from the uncommitted partial implementation. Tasks 1 and 2 start by reviewing and validating it.
2. **Cutoff version:** `1.1.0` is confirmed as the internal cutoff. The release version is declared only when the branch merges to `main`; do not add release-version text to user docs, CHANGELOG, or ADRs in this plan.
3. **Breaking UX accepted:** signed-era installs abort when cosign is absent; `--allow-unsigned` is the documented escape hatch.
4. **Issue #271 authorization granted:** the acceptance criteria may be edited to the cutoff contract.
5. **`--allow-unsigned` scope confirmed:** it never bypasses an invalid signature; it only covers missing cosign, bundle 404, or manifest 404.

## Open-PR coordination

- **#283 (Issue #240, SignPath denial):** removes `.signpath/artifact-configuration.xml` and `CODE_SIGNING_POLICY.md`, rewrites the README signing claim, adds `docs/security/windows-code-signing.md`, and edits `README.md`, `RELEASE.md`, `CHANGELOG.md`, and `docs/ai/logs/2026-11.md`. It does **not** implement cosign verification on Windows, so it does not satisfy review item 2. Merge order matters: if #283 lands first, rebase and keep the "Windows artifacts remain unsigned" posture while adding the cosign requirement. If #272 lands first, #283 must preserve the new bundle-verification text.
- **#274 (Issue #239, update notifier):** adds `docs/ai/decisions/ADR-0048-runtime-update-notifier.md`, colliding with our `ADR-0048-cosign-keyless-checksum-bundle.md`. Ours was created 2026-10-30; the notifier ADR is newer, so it should renumber (e.g., 0049) when it rebases. Also edits `docs/ai/logs/2026-11.md`.
- **#280 (OpenCode V2 foundation)** and **#274** both add `docs/ai/logs/2026-11.md`; **#276** edits `README.md` step 3. Resolve the monthly log append-only (keep every PR's dated entry) and expect README conflicts against this plan's quick-start rewrite.

## Tasks

### Task 1: Enforce signed-era verification in `install.sh` and update bats

**Objective:** Make the POSIX installer fail closed for signed-era releases with an explicit opt-out, and align the bats suite with the new contract.

**Files:**
- Modify: `install/install.sh` (review and finish the uncommitted implementation)
- Modify: `tests/bash/install_sh.bats`
- Validate: `tests/bash/install_sh.bats`

**Step 1: Establish expected behaviour**

Signed-era (`TAG >= COSIGN_REQUIRED_FROM`): cosign absent, bundle 404, or manifest 404 aborts before any prefix mutation unless `--allow-unsigned`; invalid bundle or non-404 bundle fetch always aborts. Legacy (`TAG < COSIGN_REQUIRED_FROM`): cosign absent or bundle 404 warns and continues. `--allow-unsigned` is accepted and documented in `usage()`.

**Step 2: Add or update validation**

Update every `run_full_install` call that intentionally exercises hash-only behaviour to pass `--allow-unsigned` (for example the matching-checksum, mismatch, pre-existing-install, manifest-404, timeout, missing-entry, `--no-modify-path`, and traversal tests). Then add these cases:
- signed-era (default cutoff) + `FAKE_BUNDLE_STATUS=404` + cosign stub → status 1, stderr contains `refusing an unsigned install`, no `bin/`.
- signed-era + cosign absent → status 1, stderr contains `cosign is required to verify`.
- signed-era + `--allow-unsigned` + cosign absent → status 0 with `cosign not found; skipping`.
- legacy (`WAYFORGE_COSIGN_REQUIRED_FROM=99.0.0`) + `FAKE_BUNDLE_STATUS=404` → status 0 with the existing warning.
- signed-era + `FAKE_CHECKSUM_STATUS=404` → status 1, stderr contains `refusing an unverified install`.
Keep the existing valid-bundle, invalid-signature, and non-404 tests, adding a signed-era assertion to each.

**Step 3: Write minimal implementation**

Verify the uncommitted `version_ge`/`signed_era` helpers, the `verify_checksum_signature` matrix, the manifest-404 branch, and the dry-run messaging. Fix only gaps found while running the tests; do not change the already-committed Node/traversal/identity work.

**Step 4: Run test to verify pass**

Run: `bats tests/bash/install_sh.bats` and `sh -n install/install.sh`
Expected: all bats tests pass (new count ≥ 31) and `sh -n` is clean.

**Step 5: Commit**

`git add install/install.sh tests/bash/install_sh.bats`
`git commit -m "feat(install): fail closed for signed-era releases (Issue #271)"`

### Task 2: Verify the cosign bundle in `install.ps1` and update Pester

**Objective:** Give Windows the same signed-era matrix through `cosign verify-blob`, with `-AllowUnsigned` as the explicit opt-out, and cover it with Pester.

**Files:**
- Modify: `install/install.ps1` (review and finish the uncommitted implementation)
- Modify: `tests/powershell/install.Tests.ps1`
- Validate: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

Same matrix as Task 1. When cosign is absent, signed-era aborts unless `-AllowUnsigned`; when cosign is present, the bundle is downloaded to a temp file, `cosign verify-blob --bundle ... --certificate-identity ... --certificate-oidc-issuer ...` runs, and a non-zero `$LASTEXITCODE` aborts. A bundle 404 is treated as missing material (abort in signed era, warn in legacy); a non-404 failure always aborts. The dry run reports the cosign requirement.

**Step 2: Add or update validation**

Extend the `Invoke-WebRequest` stub with `wayforge-checksums.txt.sigstore.json` handling and a `FAKE_BUNDLE_STATUS` env (404/500/timeout). Add a `cosign` function stub in the child script that records args and sets `$global:LASTEXITCODE = $env:FAKE_COSIGN_EXIT`. Update existing non-dry-run tests (`installChild` at lines 265, 274, 282, 290, 297, 305, 356) to pass `-AllowUnsigned` or provide a cosign stub. Add cases: valid bundle installs; invalid signature aborts; signed-era missing cosign aborts; `-AllowUnsigned` continues; legacy cutoff warns; bundle 404 signed-era aborts.

**Step 3: Write minimal implementation**

Verify the uncommitted `Test-VersionAtLeast`, `Test-ChecksumSignature`, `$signedEra`, manifest-404 branch, and dry-run messaging. Keep PowerShell 5.1 compatibility (no ternary/`??`) and clean up the temp bundle in `finally`.

**Step 4: Run test to verify pass**

Run: `pwsh -NoProfile -Command "Invoke-Pester -Path 'tests/powershell/install.Tests.ps1' -Output Normal"` and the PowerShell parser check.
Expected: all Pester tests pass (new count ≥ 30) and zero parse errors.

**Step 5: Commit**

`git add install/install.ps1 tests/powershell/install.Tests.ps1`
`git commit -m "feat(install): verify cosign bundle on Windows (Issue #271)"`

### Task 3: Put bundle verification ahead of trust in the docs

**Objective:** Document the fail-closed contract and make the quick-start verify the manifest bundle before trusting the manifest or running the installer.

**Files:**
- Modify: `README.md` (lines 9-48, quick-start)
- Modify: `RELEASE.md` (lines 119-139 install commands; lines 291-295 checksum policy)
- Modify: `docs/security/installer-trust.md` (lines 45-91)
- Modify: `docs/ai/architecture.md` (lines 10, 30, 35)
- Validate: grep checks for stale `warn-and-continue` / `manual only` / `certificate-identity-regexp` language

**Step 1: Establish expected behaviour**

The documented flow is: download `install.sh`/`install.ps1`, `wayforge-checksums.txt`, and the bundle → `cosign verify-blob` → check the installer hash → `--dry-run` → run. Signed-era installs require cosign v3+ or the documented opt-out. Windows verifies the bundle automatically when cosign is present.

**Step 2: Add or update validation**

Add grep assertions to the task's validation command set:
- `rg -n "warn and continue|warn-and-continue" README.md RELEASE.md docs/security/installer-trust.md docs/ai/architecture.md` returns only intentional legacy-release sentences.
- `rg -n "certificate-identity-regexp" README.md RELEASE.md docs/security/installer-trust.md docs/ai/architecture.md` returns nothing.
- `rg -n "install.ps1.*manual|manual .*install.ps1" README.md RELEASE.md docs/security/installer-trust.md docs/ai/architecture.md` returns nothing.
- `rg -n "1\.1\.0" README.md RELEASE.md docs/security/installer-trust.md docs/ai/architecture.md` returns nothing (the release version is not declared in this branch).

**Step 3: Write minimal implementation**

Rewrite the three quick-start blocks in README and RELEASE to match the worktree README, including the exact identity and issuer, but describe the requirement as "releases published with a signed manifest" instead of naming a version (the worktree README currently says `1.1.0+`; remove that). Update the installer-trust verification policy and non-goals: signed-era mandatory, cutoff behavior without announcing the version, `--allow-unsigned` semantics, Windows automatic verification, Node `SHASUMS256.txt`, and the bootstrap residual risk (the installer itself is hash-checked; bundle-first verification is the high-assurance path). Update `docs/ai/architecture.md` lines 10, 30, and 35 to the same contract.

**Step 4: Run test to verify pass**

Run: the three `rg` checks above plus `make check`.
Expected: no stale policy language, `make check` green.

**Step 5: Commit**

`git add README.md RELEASE.md docs/security/installer-trust.md docs/ai/architecture.md`
`git commit -m "docs(install): document signed-era bundle verification (Issue #271)"`

### Task 4: Amend the ADRs, release notes, and track the issue/PR coordination

**Objective:** Record the contract change durably and reconcile the release notes and memory log, including the outstanding ADR-0035 inconsistencies from `cb6870b`.

**Files:**
- Modify: `docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md`
- Modify: `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md`
- Modify: `CHANGELOG.md` (`[Unreleased]` lines 14-32)
- Modify: `docs/ai/logs/2026-11.md`
- Track (external): Issue #271 acceptance criteria

**Step 1: Establish expected behaviour**

ADR-0048's matrix reflects signed-era fail-closed and the cutoff/opt-in; ADR-0035 Decisions 11, 13, and 14 stop claiming node checksums are out of scope, the 404 fallback is unconditional, the identity is a regexp, or Windows is manual-only. The changelog states the breaking install requirement. The log records the review remediation and validation evidence.

**Step 2: Add or update validation**

Grep checks: ADR-0048 contains `COSIGN_REQUIRED_FROM`/cutoff language and no `warn and continue` row for signed-era; ADR-0035 contains `**Amended**: 2026-11-03` and no `regexp` in Decision 14; `rg -n "warn-and-continue|does not require cosign" CHANGELOG.md docs/ai/decisions` returns only historical/legacy statements.

**Step 3: Write minimal implementation**

- ADR-0048: rewrite Decision 3's matrix; add Decision 6 for the cutoff, `--allow-unsigned`, and Windows automatic verification; add a `**Amended**: 2026-11-03` header line; update Consequences (cosign becomes a prerequisite for signed-era installs).
- ADR-0035: add `**Amended**: 2026-11-03`; amend Decision 11 (node checksum now verified), Decision 13 (manifest 404 fails closed inside the signed era), and Decision 14 (exact identity, fail-closed matrix, Windows verification).
- CHANGELOG: replace the warn-and-continue sentence with the signed-era requirement and the opt-out. Describe the behavior change without naming or announcing the release version (the version is declared on merge to `main`).
- `docs/ai/logs/2026-11.md`: append the policy change, files touched, and validation evidence.
- Issue #271: update the acceptance criteria for `install.sh` and `install.ps1` to the cutoff contract (authorization granted 2026-11-03). Keep the issue text free of release-version announcements.

**Step 4: Run test to verify pass**

Run: the grep checks above, `npx vitest run`, `npm run typecheck`, `bats tests/bash/install_sh.bats`, Pester, and `make check`.
Expected: all green; ADR/doc greps show the new contract.

**Step 5: Commit**

`git add docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md CHANGELOG.md docs/ai/logs/2026-11.md`
`git commit -m "docs(adr): record signed-era installer verification (Issue #271)"`

## Validation ownership

| Validation | Owner | Command / procedure |
|---|---|---|
| bats installer suite | agent | `bats tests/bash/install_sh.bats` |
| Pester installer suite | agent | `pwsh -NoProfile -Command "Invoke-Pester -Path 'tests/powershell/install.Tests.ps1' -Output Normal"` |
| Shell/PowerShell syntax | agent | `sh -n install/install.sh`; PowerShell parser |
| TypeScript suite + checks | agent | `npx vitest run`; `npm run typecheck`; `make check` |
| Doc/ADR grep assertions | agent | the `rg` checks in Tasks 3 and 4 |
| Real cosign install on Linux/macOS/Windows (cosign present and absent, tampered bundle, `--allow-unsigned`) | human | follow `docs/security/installer-trust.md` on each platform |
| Self-hosted release rehearsal with the new draft-first publish and bundle verification | human | extend PR #272's Task 5 rehearsal commands |
| Issue #271 acceptance-criteria edit | agent (authorized 2026-11-03) | update the issue body ACs to the cutoff contract; no release-version announcement |

## Required gates

- `architect_review: true` — the verification contract and ADR-0048/ADR-0035 decisions change; the trust boundary moves from "warn and continue" to fail-closed for signed-era releases.
- `memory_update: true` — `docs/ai/logs/2026-11.md`, ADRs, architecture, and changelog must be updated in the same merge.
- Human release rehearsal remains the final gate and is not an agent validation.
