---
status: completed
created: 2026-10-27
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #243: Verify `wayforge-checksums.txt` in the one-shot installers

**Goal:** Both one-shot installers verify the downloaded platform binary and share archive against the release's `wayforge-checksums.txt` before creating, replacing, or extracting anything under the install prefix, and older releases without the checksum asset still install with a documented warning.

**Architecture:** Add a small, self-contained verification block to each installer (they are distributed as single files, so no shared library and no new dependencies). Fetch the three assets into OS temp files, compute SHA-256 with the platform's existing tool, compare against the checksum file parsed by bare asset name, and only then run `ensure_node` and the existing prefix mutation. Missing checksum asset = warn and continue; present file with a missing entry or a mismatched digest = abort with a clear message and a clean temp dir. Tests exercise the real installer end to end against stubbed HTTP fixtures (stub `curl` for bats, stubbed `Invoke-WebRequest` for Pester).

**Tech Stack:** POSIX `sh` (`install/install.sh`), PowerShell 5.1 (`install/install.ps1`), bats (`tests/bash/install_sh.bats`), Pester (`tests/powershell/install.Tests.ps1`), `sha256sum` / `shasum -a 256` / `Get-FileHash -Algorithm SHA256`.

**Scope classification:** `multi-task`

**Plan rationale:** Three independently reviewable slices: the POSIX installer + bats, the Windows installer + Pester, and the cross-cutting docs/ADR reconciliation. Each platform has its own language, test harness, and failure modes; combining them would produce an unreviewable diff and couple two unrelated validation loops. Three tasks is within the 3-task budget and needs no further rationale.

## Confirmed planning decisions

1. **Missing checksum asset → soft fallback (warning, continue).** This is required by the acceptance criteria ("Releases without `wayforge-checksums.txt` do not hard-fail") and is the backward-compatible choice the issue prefers. No new flag, no env var (YAGNI). The warning goes to stderr (`install.sh`) / `Write-Warning` (`install.ps1`) and names the skipped asset.
2. **Checksum file present but entry missing, or digest mismatch → hard failure.** A present file that does not describe our asset is the mislabeled-asset / mixed-up-file case the issue calls out; continuing would defeat the feature. This mirrors `wfg upgrade` (`cli/src/lib/upgrade.ts` aborts on either).
3. **Verify before any install mutation, including Node provisioning.** Real-install ordering becomes: resolve tag → download binary, share, and checksums to temp → verify → `ensure_node` → create dirs → move/extract. Dry-run keeps printing both the Node plan and the release plan without downloading.
4. **Hashing tools:** `sha256sum` when on PATH, else `shasum -a 256` (macOS). If neither exists and a checksum file is present, abort with an actionable message. PowerShell uses `Get-FileHash -Algorithm SHA256` (available in 5.1).
5. **Parse by bare asset name.** `.github/workflows/release.yml:105` produces `sha256sum dist/wayforge-* wayforge-share-*`, so binary entries carry a `dist/` prefix while share entries are bare. Normalize with basename, mirroring `parseChecksums` in `cli/src/lib/upgrade.ts:66`.
6. **No new ADR.** Amend ADR-0035 (release-asset posture) and ADR-0047 (trust anchor / consequences), as the issue directs.
7. **Out of scope (unchanged):** nodejs.org download verification (ADR-0035 Decision 11), signing/key pinning, `wfg upgrade` behavior, checksum generation, and making share extraction atomic (a bad *verified* archive can still leave a partial share; not part of this issue).

## Repository facts the implementer needs

- `install/install.sh` is a single POSIX `sh` file (no `local` support outside functions, no arrays). Cleanup is the `cleanup()` trap at lines 34-40; temp vars `TMP_BINARY` / `TMP_SHARE` / `TMP_PATH_BLOCK` / `TMP_NODE`. Today `TMP_BINARY` is `${binary_path}.tmp.$$` (inside the prefix) and `chmod`/`mv` happen right after download (lines 392-396); share is downloaded to `mktemp`, then `rm -rf "$share_dir"` + extract (lines 398-405). `ensure_node` runs at line 345, before any download.
- `install/install.ps1` is PowerShell 5.1-compatible; `Install-Wayforge` (lines 275-334) calls `Ensure-Node` (line 281) before downloads, downloads the binary to `${binaryPath}.tmp` and moves it (lines 311-313), and downloads the share zip to `$env:TEMP` then `Expand-Archive`s after deleting `$shareDir` (lines 315-323). There is no `try/finally` around the install path.
- Release assets are `wayforge-<os>-<arch>[.exe]`, `wayforge-share-<version>.tar.gz|.zip`, `wayforge-checksums.txt`, plus `install.sh` / `install.ps1` (`.github/workflows/release.yml:97-119`). Checksum file format is `sha256sum`: `<64 hex>  <path>`.
- Existing tests are network-free and dry-run-only: bats restricts `PATH` to a stub dir and stubs `uname`/`tr`; Pester shells out to `pwsh -NoProfile -Command` with stubbed `Invoke-WebRequest`. New full-install tests need stubs for the HTTP layer and a valid share fixture; Pester tests must save/restore the **User** PATH because `Add-UserPathEntry` writes the registry.
- `make check` (the default gate) does **not** run bats or Pester (ADR-0034). The issue's acceptance requires explicit `make check-bats` and `make check-pester`; `qa/check-bats` skips when `bats` is absent, and `tests/powershell/bootstrap.Tests.ps1` has 3 known environment-gated failures (see `docs/ai/logs/2026-10.md:57`), so validate `install.Tests.ps1` scoped.
- Current checkout is `feature/issue-227-agents-artifact-dir` (clean). Implementation must branch from `develop`; do not build #243 on top of the #227 branch.

## Tasks

### Task 1: POSIX installer checksum verification + bats coverage

**Objective:** `install/install.sh` verifies the binary and share archive against `wayforge-checksums.txt` before touching the prefix, with a warning-only fallback for older releases, and bats proves match, mismatch, missing-asset, and missing-entry behavior.

**Files:**
- Modify: `install/install.sh` (cleanup vars, download/verify helpers, `run_install` ordering and dry-run output)
- Modify: `tests/bash/install_sh.bats` (new full-install helpers and cases)
- Validate: `tests/bash/install_sh.bats`

**Step 1: Establish expected behaviour**

Write down the contract before editing:
- `checksum_url="${base_url}/wayforge-checksums.txt"`.
- Download binary, share, and checksums into OS temp files (`mktemp`) owned by the existing cleanup trap; add `TMP_CHECKSUMS` and remove the prefix-local `${binary_path}.tmp.$$` scheme.
- If the checksum download fails (older release → 404; `curl -f`/`wget -q` already fail silently), print `warning: wayforge-checksums.txt is unavailable for ${TAG}; skipping checksum verification` to stderr and continue.
- If the file exists, verify both assets by basename; a missing entry prints `error: checksum file has no entry for <asset>; aborting without changes`; a mismatch prints `error: checksum mismatch for <asset>: expected <hex>, got <hex>`; both exit 1 before `ensure_node`, `mkdir`, `chmod`, `mv`, or `tar`.
- Real-install order: resolve tag → download all three → verify → `ensure_node` → install mutations. Dry-run prints the checksum URL and a "would verify" line in the release plan.

**Step 2: Add or update validation**

In `tests/bash/install_sh.bats`, add helpers:
- `install_env()` sets `TEST_FIXTURES`, writes a dummy binary (`printf 'binary'`) and a real share fixture (`mkdir -p $TEST_FIXTURES/share/base && printf '1.0.0' > .../share/VERSION && tar -czf $TEST_FIXTURES/share.tar.gz -C $TEST_FIXTURES/share base VERSION`).
- A stub `curl` that parses `-o <dest>` and the final URL, copies the matching fixture, exits 22 for `*wayforge-checksums.txt` when `FAKE_MISSING_CHECKSUMS=1`, and exits 22 for unknown URLs. It must never hit the network.
- A stub `sha256sum` that prints `${FAKE_DIGEST}  $1` (deterministic, no real hashing dependency). Put it in `STUB_DIR`, ahead of the real PATH.
- `run_full_install()` using `run env PATH="$STUB_DIR:/usr/bin:/bin" HOME=... FAKE_DIGEST=... /bin/sh install/install.sh --version 9.9.9 --url-base https://fixture.invalid --skip-node-check --prefix "$TEST_PREFIX"`.

Cases (each computes its own `wayforge-checksums.txt` fixture):
1. matching digests for both assets → exit 0, `verified` message, `$TEST_PREFIX/bin/wfg` and `$TEST_PREFIX/share/wayforge/base` exist;
2. binary digest mismatch → exit 1, stderr has `checksum mismatch`, and neither `$TEST_PREFIX/bin` nor `$TEST_PREFIX/share` exists;
3. pre-existing install + mismatch → exit 1 and the pre-existing `bin/wfg` bytes are unchanged;
4. `FAKE_MISSING_CHECKSUMS=1` → exit 0, stderr warning, install still completes;
5. checksum file present without the binary entry → exit 1, stderr `no entry for wayforge-linux-x64`;
6. dry-run output contains the checksum URL and a `[dry-run] would verify` line;
7. structural assertion that the script contains both `sha256sum` and `shasum -a 256` (covers tool fallback, which cannot be simulated without removing the real binary from PATH).

**Step 3: Write minimal implementation**

- Add `TMP_CHECKSUMS=""` beside the other temp vars and clean it in `cleanup()`.
- Add `sha256_file()`:
  ```sh
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else echo "error: cannot verify checksums: sha256sum or shasum is required" >&2; return 1; fi
  ```
- Add `checksum_for()` using awk on `$TMP_CHECKSUMS`:
  `awk -v name="$1" '{ f=$2; sub(/^\*/, "", f); sub(/^.*\//, "", f); if (f == name) { print tolower($1); exit } }'`.
- Add `verify_asset <file> <asset-name>` that aborts on empty entry or digest mismatch.
- In `run_install`: compute `checksum_url`; download all three with `download`; wrap the checksum download in `if ! download ...; then TMP_CHECKSUMS=""; warning; fi`; call `verify_asset` for `$BINARY_NAME` and `$share_name`; then move `ensure_node` after verification for the real path (keep the dry-run Node plan). Add the dry-run lines. Keep paths, messages, and exit codes exactly as in Step 1.

**Step 4: Run test to verify pass**

Run (owner: agent, if `bats` is installed):
`make check-bats`
Expected: every `tests/bash/install_sh.bats` case passes and `tests/bash/bashrc_snippet.bats` stays green (9/9-ish). If `bats` is unavailable the runner prints a skip — record that and fall back to `bash -n install/install.sh` plus a manual `--dry-run`.

**Step 5: Commit**

`git add install/install.sh tests/bash/install_sh.bats`
`git commit -m "feat(install): verify release checksums in install.sh (Issue #243)"`

### Task 2: Windows installer checksum verification + Pester coverage

**Objective:** `install/install.ps1` verifies the binary and share zip against `wayforge-checksums.txt` before creating or replacing anything in the prefix, cleans temp files on every path, and Pester proves match, mismatch, missing-asset, and missing-entry behavior.

**Files:**
- Modify: `install/install.ps1` (`Install-Wayforge` ordering, helpers, temp cleanup)
- Modify: `tests/powershell/install.Tests.ps1` (new full-install describe block)
- Validate: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

- `$checksumUrl = "${baseUrl}/wayforge-checksums.txt"`; download binary, share, and checksums to unique `$env:TEMP` paths; ensure removal in a `try/finally` (including on verification failure).
- Missing checksum asset (404/any `Invoke-WebRequest` failure for that URL) → `Write-Warning "wayforge-checksums.txt is unavailable for ${resolvedVersion}; skipping checksum verification"` and continue.
- Present file: parse lines with `^([0-9a-fA-F]{64})\s+\*?(.+)$`, key by `[System.IO.Path]::GetFileName($matches[2].Trim())`, and compare against `(Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLowerInvariant()`. Missing entry or mismatch → `Write-Error` and abort before `New-Item`, `Move-Item`, `Expand-Archive`, or `Add-UserPathEntry`.
- Real-install order: resolve version → download all three → verify → `Ensure-Node` → create dirs → move/extract. Dry-run prints the checksum URL and a "would verify" line.
- PS 5.1 compatibility: no ternary/`??`, use `[Environment]::GetEnvironmentVariable("Path", "User")` as today.

**Step 2: Add or update validation**

Add a `Describe 'Checksum verification (full install)'` block. Each case runs the installer in a child `pwsh -NoProfile -Command`, with:
- a stub `Invoke-WebRequest` that supports the `-OutFile` form, copies fixture files (`$env:FIXTURE_DIR`) based on the URI leaf, and throws for `wayforge-checksums.txt` when `$env:FAKE_MISSING_CHECKSUMS -eq '1'`;
- a fixture binary (`Set-Content 'binary'`) and a real share zip built with `Compress-Archive` from a directory containing `base/` + `VERSION` (or `python3 -m zipfile` if Compress-Archive is unavailable);
- a checksum file generated with real `Get-FileHash` in the test;
- User PATH captured before and restored in `finally` (`[Environment]::SetEnvironmentVariable("Path", $original, "User")`) because a successful install calls `Add-UserPathEntry`.

Cases:
1. matching digests → exit 0, `$prefix/bin/wfg.exe` and `$prefix/share/wayforge/base` exist;
2. binary digest mismatch → non-zero exit, message contains `checksum mismatch`, and `$prefix/bin/wfg.exe` does not exist;
3. missing checksum asset → exit 0, warning text present, install completes;
4. checksum file without the binary entry → non-zero exit, message contains `no entry for wayforge-win32-x64.exe`;
5. structural assertions: script uses `Get-FileHash` with `-Algorithm SHA256` and references `wayforge-checksums.txt`.

**Step 3: Write minimal implementation**

- Add `Get-ExpectedChecksum` (parse file → hashtable keyed by leaf name) and `Assert-Checksum` (missing entry / mismatch → `Write-Error -ErrorAction Stop`).
- In `Install-Wayforge`: compute `$checksumUrl`; download binary/share/checksums to `$env:TEMP` with `[System.Guid]::NewGuid()` names; wrap downloads/verification/move/extract in `try/finally` removing this run's temp files; on checksum download failure set a skip flag and `Write-Warning`; verify both assets; then `Ensure-Node`; then the existing `New-Item`/`Move-Item`/`Expand-Archive` sequence. Add the dry-run lines.

**Step 4: Run test to verify pass**

Run (owner: agent, if `pwsh` + Pester are installed):
`pwsh -NoProfile -Command "Invoke-Pester -Path ./tests/powershell/install.Tests.ps1 -PassThru | Select-Object FailedCount"`
Expected: `FailedCount` is 0. Then run `make check-pester` for the full suite and expect only the 3 known environment-gated `bootstrap.Tests.ps1` failures (`docs/ai/logs/2026-10.md:57`); any `install.Tests.ps1` failure blocks. If pwsh/Pester are unavailable the runner prints a skip — record that and use `pwsh -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw install/install.ps1))"` as a parse check.

**Step 5: Commit**

`git add install/install.ps1 tests/powershell/install.Tests.ps1`
`git commit -m "feat(install): verify release checksums in install.ps1 (Issue #243)"`

### Task 3: Reconcile docs, ADR-0035/0047, and close the issue contract

**Objective:** The installer checksum contract, the missing-asset fallback, and the hashing-tool matrix are documented where users and maintainers look, and the ADR record no longer claims checksum verification is absent.

**Files:**
- Modify: `README.md` (step 1 install section, around lines 11-31)
- Modify: `RELEASE.md` (checksum bullet ~line 283; local-validation note ~line 285)
- Modify: `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md` (amendment header + Decision 13; adjust Decision 11's "existing release-asset download posture" wording)
- Modify: `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md` (consequences: installers now verify too; older releases fall back)
- Modify: `docs/ai/architecture.md` (installer/release bullet, lines 35-36)
- Modify: `docs/ai/logs/2026-10.md` (closure entry; `memory_update` gate)

**Step 1: Establish expected behaviour**

The documented contract must match the code exactly: both installers verify the platform binary and share archive; verification happens before prefix mutation; a missing checksum asset warns and installs (older releases); a present file with a missing entry or mismatch aborts; POSIX uses `sha256sum` then `shasum -a 256`; Windows uses `Get-FileHash`; nodejs.org downloads remain unverified (accepted risk, ADR-0035 Decision 11).

**Step 2: Add or update validation**

Documentation checks (owner: agent):
- `Select-String -Path README.md,RELEASE.md,docs/ai/architecture.md -Pattern 'checksum'` shows the installer behavior, not just `wfg upgrade`.
- ADR-0035 has an `**Amended**: 2026-10-27` line and a numbered decision describing the verification/fallback policy; Decision 11 no longer implies release assets are unverified.
- `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md` no longer lists installer verification as an open follow-up.
- Acceptance-criteria traceability table (added below) has no unowned row.

**Step 3: Write minimal implementation**

- README: one short paragraph after the install commands: the installer downloads and verifies both assets against `wayforge-checksums.txt` before installing; older releases without that asset install with a warning.
- RELEASE: extend the checksum bullet with installer verification and the backward-compatible fallback; update the "source changes ... validated locally via `bash -n` and smoke tests against `--url-base` fixtures" note to mention checksum fixtures.
- ADR-0035: add `**Amended**: 2026-10-27 — release-asset checksum verification added (Decision 13).` and Decision 13 (scope = binary + share archive for release assets; verify-before-mutate; fallback; tools; same-origin trust per ADR-0047; nodejs.org still out of scope). Adjust Decision 11's "consistent with the existing release-asset download posture" sentence to point at Decision 13.
- ADR-0047: in Consequences/Follow-ups, record that the installers now perform the same verification and that pre-checksum releases take the warning path.
- architecture.md: extend the release bullet to say the installers verify both hashes before installing.
- Log: add a `2026-10.md` entry at close with tasks, validation results, and any remaining human validation (same style as the existing entries).

**Step 4: Run test to verify pass**

Run: `make check`
Expected: vitest, `tsc --noEmit`, ESLint, Prettier, and jscpd (<8%) all green. Then re-run the checksum grep above and confirm every acceptance criterion in the table below has an owning validation.

**Step 5: Commit**

`git add README.md RELEASE.md docs/ai/architecture.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md docs/ai/logs/2026-10.md`
`git commit -m "docs: record installer checksum verification (Issue #243)"`

## Acceptance criteria mapping

| Criterion | Owning task | Validation |
|---|---|---|
| Both installers verify both assets | 1, 2 | bats match case; Pester match case |
| Mismatch aborts before install, no partial prefix changes | 1, 2 | bats mismatch + pre-existing-install cases; Pester mismatch case |
| `install.sh` works on macOS without `sha256sum` | 1 | structural bats assertion (agent) + real macOS install (human) |
| Releases without the asset do not hard-fail; fallback documented | 1, 2, 3 | bats/Pester missing-asset cases; README + RELEASE + ADR-0035 |
| Bats and Pester coverage for match, mismatch, missing asset; `make check-bats` / `make check-pester` green | 1, 2 | agent runs, with skip recorded if the toolchain is absent |
| README install notes and RELEASE asset contract updated | 3 | agent grep + `make check` |

## Validation ownership

| Validation | Owner |
|---|---|
| `bash -n install/install.sh`, `make check-bats` | agent |
| `make check-pester` scoped to `install.Tests.ps1` | agent |
| `make check` (vitest, typecheck, lint, format, duplication) | agent |
| Real `curl ... | sh` on macOS (no `sha256sum`) against a checksum-publishing release | human |
| Real `irm | iex` on Windows against a checksum-publishing release | human |
| Real fallback install from a release that predates `wayforge-checksums.txt` | human |

## Blocking decisions and required gates

1. **Branch base (blocking).** The worktree is on `feature/issue-227-agents-artifact-dir` (clean). Create `feature/issue-243-installer-checksum-verification` from `develop` before Task 1; do not implement on the #227 branch or mix the two diffs.
2. **Missing-checksum policy (confirm at approval).** The plan adopts warn-and-continue (Decision 1) with no opt-in strict flag. If strict-by-default or an opt-in flag is preferred, Task 1/2 change and README/RELEASE wording changes; everything else stands.
3. **Release prerequisite (non-blocking for code, blocking for end-to-end validation).** A published release with `wayforge-checksums.txt` is required to exercise the happy path for real, and a pre-checksum release (for example the current `1.0.2` generation) is required to exercise the fallback. Test fixtures cover the logic meanwhile.
4. **macOS host (blocking for one acceptance item).** No macOS host is available in this environment; the `shasum -a 256` path is covered structurally by bats and must be human-validated on real macOS.
5. **Toolchain availability.** `make check-bats` skips without `bats`; Pester skips without `pwsh`. Record skips rather than claiming green, and do not add either to `make check` (ADR-0034).
6. **Gates.** `architect_review: true` — the change reverses part of ADR-0035's accepted-risk posture and touches the install trust boundary; run it after Task 1 (or after Task 2) and before docs closure, amending ADR-0035/0047 if it objects. `memory_update: true` — Task 3 closes the monthly log, architecture, and ADR record.
