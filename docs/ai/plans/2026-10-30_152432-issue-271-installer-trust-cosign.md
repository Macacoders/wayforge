---
status: in-progress
created: 2026-10-30
task: 2/5
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #271: Harden install path and add cosign keyless checksum verification

**Goal:** The release publishes a cosign-keyless-signed checksum manifest bundle (`.sigstore.json`) that covers every asset plus both installer scripts, `install.sh` verifies that bundle when cosign is available, both installers stop recommending the `irm | iex` / `curl | sh` cradle and gain a `--no-modify-path` / `-NoModifyPath` opt-out, the signed-install trust model and AMSI context are documented, and a self-hosted release rehearsal is handed to @PabloBen with exact commands and configuration.

**Architecture:** The release job adds GitHub OIDC (`id-token: write`), installs cosign v3.1.4, signs `wayforge-checksums.txt` with `cosign sign-blob --bundle wayforge-checksums.txt.sigstore.json` after the manifest is final, and uploads the single bundle. `install.sh` verifies the bundle **before** it verifies asset hashes: cosign present + valid bundle proceeds, cosign present + invalid bundle or non-404 fetch failure aborts before any prefix mutation, and cosign absent or bundle confirmed 404 warns and continues. `install.ps1` keeps mandatory-on-presence hash verification and documents manual `cosign verify-blob --bundle` instead of invoking cosign. Both installers gain a PATH opt-out that suppresses persistent PATH writes/removals. The final task is a human-owned release rehearsal on the existing self-hosted runner.

**Tech Stack:** GitHub Actions OIDC, `sigstore/cosign-installer@v4.1.0` with `cosign-release: 'v3.1.4'`, `cosign sign-blob --bundle` / `verify-blob --bundle`, POSIX `sh` (`install/install.sh`), PowerShell 5.1 (`install/install.ps1`), bats, Pester, Vitest.

**Scope classification:** `multi-task`

**Plan rationale:** Five independently reviewable slices: (1) release-pipeline signing and manifest contents, (2) `install.sh` bundle verification plus bats, (3) `--no-modify-path` / `-NoModifyPath` across both installers plus bats/Pester, (4) docs/ADR/memory reconciliation, and (5) the human-owned self-hosted release rehearsal explicitly requested for @PabloBen. The first four are code/docs deliverables with distinct validation loops (workflow static test/actionlint, bats, bats+Pester, `make check` + grep); the fifth is a post-merge validation task with a PR checklist. Five tasks is above the 3-task preference but below the 6-task confirmation threshold; the rationale is the four distinct implementation surfaces plus the explicitly requested release rehearsal.

## Confirmed planning decisions

1. **Cosign v3.1.4 + `.sigstore.json` bundle (industry standard).** Sigstore recommends bundles, cosign v3 defaults to them, and `--output-signature` / `--output-certificate` are deprecated and removed from the v3.1.4 `sign-blob` flag set. The release publishes one `wayforge-checksums.txt.sigstore.json`; the installer verifies it with `cosign verify-blob --bundle`. This supersedes the issue's original `.sig` / `.pem` contract; update the issue acceptance criteria before implementation.
2. **Signature policy matches the checksum policy.** With cosign present: valid bundle → continue; invalid bundle → abort; bundle 404 → warn and continue (transitional release); any other bundle fetch failure (403/5xx/timeout/TLS) → abort. With cosign absent: warn and continue. Checksum verification stays mandatory-on-presence as delivered by #243.
3. **Signature covers only the manifest.** Verify `wayforge-checksums.txt.sigstore.json` first, then use the manifest to verify each downloaded asset's SHA-256. Do not include the bundle inside the manifest (circular).
4. **`--no-modify-path` / `-NoModifyPath` suppresses persistent PATH mutation in both directions.** This matches the common installer convention (`rustup`, `deno`, and the `*_NO_MODIFY_PATH` env vars used by `uv` / `cargo-dist`) and supersedes the issue's shorter `--no-path` / `-NoPath`. Install: no `~/.bashrc` / `~/.zshrc` marker block and no User PATH `Add-UserPathEntry`; still print the manual export line. Uninstall: no marker/PATH removal. Dry-run prints the opt-out instead of the would-mutate lines. It does not change where files are installed.
5. **`install.ps1` does not execute cosign.** It keeps hash verification and documents manual `cosign verify-blob --bundle` for users who have it. No new PowerShell dependency.
6. **No Authenticode enforcement in this task.** `docs/security/installer-trust.md` records the unsigned-until-SignPath status and EDR allow-list guidance. SignPath integration stays in #240.
7. **Create ADR-0048 plus surgical amendments.** The Task 1 architect gate required a dedicated ADR-0048 for the keyless signing trust anchor, with `**Amended**: 2026-10-30` entries on ADR-0035, ADR-0047, and ADR-0045 preserving `Status: Accepted`. ADR-0048 and the amendments must land in the same PR merge as the Task 1 code; supersede a whole ADR only if a decision is replaced rather than extended.
8. **`wfg upgrade` is unchanged.** It keeps hash-only verification in this task (the issue scopes cosign verification to `install.sh`); record that gap explicitly in ADR-0047 and the log rather than silently implying `wfg upgrade` verifies signatures.
9. **Historical references stay historical.** `CHANGELOG.md` and `docs/ai/logs/**` may keep old `irm | iex` / `curl | sh` text as history; only live recommended-path docs (README, RELEASE, architecture, ADR-0035 Decision 1) are rewritten.
10. **Issue #271 acceptance criteria must be updated before implementation.** Replace `.sig` / `.pem` with `.sigstore.json` and `--no-path` / `-NoPath` with `--no-modify-path` / `-NoModifyPath`; this requires explicit authorization to edit the GitHub issue (for example via `/issue edit`).

## Repository facts the implementer needs

- `.github/workflows/release.yml`: top-level `permissions` are `contents: write` / `actions: write` (lines 7-9); `release` job runs on `[self-hosted, linux, x64]` (lines 72-74); checksums are generated at lines 103-105 with `sha256sum dist/wayforge-* wayforge-share-*.tar.gz wayforge-share-*.zip > wayforge-checksums.txt`; the release is created and assets uploaded at lines 107-121, including `wayforge-checksums.txt install/install.sh install/install.ps1`.
- `install/install.sh`: option parsing at lines 64-112; cleanup trap / temp vars at lines 26-42; `fetch_checksums` status triage at lines 215-261 (`curl -w '%{http_code}'` without `-f`; wget server-response parsing); hash helpers at lines 263-303; `run_install` ordering at lines 437-550 (download → checksum fetch/verify → `ensure_node` → mkdir/move/extract); PATH block append at lines 537-549; `run_uninstall` PATH removal at lines 555-588. The file is standalone POSIX `sh` (no arrays; `local` only inside functions).
- `install/install.ps1`: `param()` block at lines 32-40; PATH helpers at lines 143-174; `Install-Wayforge` at lines 330-427 (checksum fetch/verify at 365-394, `Ensure-Node` at 396, prefix mutation at 398-418); `Uninstall-Wayforge` at lines 432-474. PowerShell 5.1-compatible: no ternary/`??`.
- `README.md` lines 13-27 currently recommend `curl ... | sh` and `irm ... | iex`; `RELEASE.md` lines 119-129 does the same, and lines 276-285 list release assets/checksums; `docs/ai/architecture.md` line 10 says users install via `curl | sh` / `irm | iex`, line 30 is the installer bullet, line 35 is the release-workflow bullet.
- `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md` Decision 1 contains the cradle commands, Decision 8 mentions `irm | iex` execution-policy friction, Decision 13 is the #243 checksum contract. `ADR-0047-cli-release-detection-and-self-update.md` Decision 1 says "Asset signing or checksum pinning is deliberately out of scope". `ADR-0045-self-hosted-release-runner-cross-compilation.md` records the release-job trust boundary and runner prerequisites.
- `tests/bash/install_sh.bats` is network-free: `setup()` creates a stub `curl`/`uname`/`tr`; `install_env()` swaps in a fixture-aware `curl` and a deterministic `sha256sum`; `run_full_install()` runs a real install with stderr captured to `$TEST_TMPDIR/stderr.log`. `tests/powershell/install.Tests.ps1` shells out to `pwsh -NoProfile -Command` and stubs `Invoke-WebRequest`; full-install cases capture and restore the **User** PATH because `Add-UserPathEntry` writes the registry.
- `make check` does **not** run bats or Pester (ADR-0034). `make check-bats` / `make check-pester` skip when the toolchain is absent; record skips rather than claiming green.
- `docs/security/` does not exist yet.
- The current branch is `develop` and the working tree is clean. Create `feature/issue-271-installer-trust-cosign` from `develop` before Task 1.
- `wayforge-checksums.txt` currently gives binaries a `dist/` prefix; both installers match by bare basename, so installer entries can be bare without breaking parsing.
- Cosign v3.1.4 is current (2026-10-20). `cosign sign-blob` requires `--bundle`; the detached `--output-signature` / `--output-certificate` flags are not available in v3. `cosign verify-blob` accepts `--bundle`, `--certificate-identity-regexp`, and `--certificate-oidc-issuer`.

## Tasks

### Task 1: Release pipeline publishes a signed checksum manifest bundle

**Objective:** The release job signs the final `wayforge-checksums.txt` with cosign v3 keyless into `wayforge-checksums.txt.sigstore.json`, publishes that bundle, and includes `install.sh` / `install.ps1` in the manifest using bare asset names.

**Files:**
- Modify: `.github/workflows/release.yml`
- Create: `tests/typescript/release/release-workflow.test.ts`
- Validate: `tests/typescript/release/release-workflow.test.ts`

**Step 1: Establish expected behaviour**

Write down the release contract before editing:

- The `release` job carries `permissions: contents: write`, `actions: read`, and `id-token: write` so `cosign sign-blob` can obtain a GitHub OIDC token. The `build-binaries` job keeps the top-level permissions.
- `wayforge-checksums.txt` contains every `dist/wayforge-*` binary, both share archives, and bare `install.sh` / `install.ps1` entries. Generate it with:
  ```sh
  {
    sha256sum dist/wayforge-* wayforge-share-*.tar.gz wayforge-share-*.zip
    (cd install && sha256sum install.sh install.ps1)
  } > wayforge-checksums.txt
  ```
- Install cosign with `sigstore/cosign-installer@v4.1.0` and `cosign-release: 'v3.1.4'`.
- After checksums are final and before `Create Release`, run:
  ```sh
  cosign sign-blob --yes \
    --bundle wayforge-checksums.txt.sigstore.json \
    wayforge-checksums.txt
  ```
- Upload `wayforge-checksums.txt.sigstore.json` alongside the existing assets. Do **not** add the bundle to the manifest and do **not** publish `.sig` / `.pem`.
- Ordering invariant: build → (future Authenticode signing) → generate `wayforge-checksums.txt` → `cosign sign-blob --bundle` → publish release assets.

**Step 2: Add or update validation**

Create `tests/typescript/release/release-workflow.test.ts` (Vitest) that reads `.github/workflows/release.yml` with `fs.readFileSync` and asserts:

1. the `release` job block contains `id-token: write`;
2. the checksum step contains `wayforge-checksums.txt`, `install.sh`, and `install.ps1`;
3. the workflow contains `cosign sign-blob`, `--bundle wayforge-checksums.txt.sigstore.json`, and `cosign-release: 'v3.1.4'`;
4. the upload step contains `wayforge-checksums.txt.sigstore.json`;
5. the signing step appears after the `Generate checksums` step and before `Create Release` (compare `indexOf` positions);
6. neither `--output-signature` nor `--output-certificate` appears in `release.yml`;
7. `wayforge-checksums.txt.sigstore.json` is not listed inside the `Generate checksums` block (guard the circularity invariant).

This is a static contract test; it does not execute the workflow. Keep it small and string-based.

**Step 3: Write minimal implementation**

- Add the job-level `permissions` block to `release` (lines 72-75) as described in Step 1.
- Change the `Generate checksums` step to the brace group shown above.
- Add `- name: Install cosign` / `uses: sigstore/cosign-installer@v4.1.0` with `with: cosign-release: 'v3.1.4'` immediately after `Generate checksums`.
- Add `- name: Sign checksum manifest (keyless)` with the `cosign sign-blob --bundle` command shown above.
- Extend the `gh release upload` asset list with `wayforge-checksums.txt.sigstore.json`.
- Leave `Create Release`'s existing-release skip behavior, artifact globs, changelog extraction, and `GH_TOKEN` unchanged.

**Step 4: Run test to verify pass**

Run (owner: agent):
```bash
npx vitest run tests/typescript/release/release-workflow.test.ts
```
Expected: all assertions pass.

Also run (owner: agent if `actionlint` is installed, otherwise human/record a skip):
```bash
npx --yes actionlint .github/workflows/release.yml
```
Expected: no new findings beyond the 4 pre-existing `SC2086:info` findings recorded in `docs/ai/logs/2026-10.md`. If `actionlint` is unavailable, record the skip.

**Step 5: Commit**

```bash
git add .github/workflows/release.yml tests/typescript/release/release-workflow.test.ts
git commit -m "feat(release): publish cosign-signed checksum bundle (Issue #271)"
```

### Task 2: `install.sh` verifies the checksum manifest bundle

**Objective:** `install.sh` verifies the cosign `.sigstore.json` bundle on `wayforge-checksums.txt` before verifying asset hashes, aborts on an invalid bundle or non-404 bundle fetch failure when cosign is present, and warns-and-continues when cosign is absent or the bundle is confirmed 404.

**Files:**
- Modify: `install/install.sh` (constants, temp vars, `fetch_asset` reuse, bundle verification, `run_install` ordering and dry-run output)
- Modify: `tests/bash/install_sh.bats` (cosign stubs and cases)
- Validate: `tests/bash/install_sh.bats`

**Step 1: Establish expected behaviour**

- Add pinned constants:
  ```sh
  COSIGN_IDENTITY_REGEXP='^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$'
  COSIGN_OIDC_ISSUER='https://token.actions.githubusercontent.com'
  ```
  These are the identity pins from the issue. If the release trigger changes from `push: main`, update the pin in the same commit as the trigger.
- Add `TMP_CHECKSUM_BUNDLE=""` beside the existing temp vars and clean it in `cleanup()`.
- Refactor `fetch_checksums` into a reusable `fetch_asset <url> <dest>` that returns `0` (200), `1` (404), or `2` (every other failure) and sets a single `FETCH_HTTP_STATUS`. Keep the existing curl/wget triage exactly; `run_install` uses the same helper for the checksum file and the `.sigstore.json` bundle. This is reuse-first and avoids a second copy of the status parsing.
- After the checksum fetch succeeds (`rc 0`) and before `verify_asset`:
  1. If `command -v cosign` is absent → `warning: cosign not found; skipping checksum signature verification` to stderr and continue.
  2. Fetch `${checksum_url}.sigstore.json` with `fetch_asset`.
     - `0` → run:
       ```sh
       cosign verify-blob \
         --bundle "$TMP_CHECKSUM_BUNDLE" \
         --certificate-identity-regexp "$COSIGN_IDENTITY_REGEXP" \
         --certificate-oidc-issuer "$COSIGN_OIDC_ISSUER" \
         "$TMP_CHECKSUMS"
       ```
       A non-zero cosign exit prints `error: cosign signature verification failed for wayforge-checksums.txt; aborting without changes` and exits 1.
     - `1` (404) → `warning: cosign signature bundle is unavailable for ${TAG}; skipping signature verification` and continue.
     - `2` (403/5xx/timeout/TLS) → print `error: failed to download cosign signature bundle for ${TAG} (HTTP <status>); aborting without changes` (omit the status for transport failures) and exit 1.
  3. Only then verify the binary and share archive hashes with the existing `verify_asset`.
- Real-install order: resolve tag → download binary/share/checksums → fetch bundle/verify signature (when cosign present) → verify asset hashes → `ensure_node` → prefix mutations. Dry-run prints the bundle URL and a `[dry-run] would verify checksum signature with cosign` line when cosign is present, or a note that cosign is absent.
- If the checksum file itself takes the 404 fallback, skip signature verification entirely (there is no manifest to verify).

**Step 2: Add or update validation**

In `tests/bash/install_sh.bats`:

- Extend the fixture-aware `curl` stub to serve `${url}.sigstore.json` from `$TEST_FIXTURES`, honoring `FAKE_BUNDLE_STATUS` (default `200`) and `FAKE_BUNDLE_TIMEOUT`.
- Add a `cosign` stub in `$STUB_DIR` that exits `${FAKE_COSIGN_EXIT:-0}` and records its arguments to `$TEST_TMPDIR/cosign-args.log`. `install_env()` should create the stub only when the test wants cosign present; otherwise leave it out so `command -v cosign` fails.
- Add cases:
  1. cosign present + valid bundle + matching hashes → exit 0, `verified wayforge-checksums.txt signature`, prefix installed;
  2. cosign present + `FAKE_COSIGN_EXIT=1` → exit 1, stderr `cosign signature verification failed`, neither `$TEST_PREFIX/bin` nor `$TEST_PREFIX/share` exists;
  3. cosign present + bundle 404 → exit 0, warning text present, install completes;
  4. cosign present + `FAKE_BUNDLE_STATUS=500` → exit 1, `failed to download cosign signature bundle`, prefix untouched;
  5. cosign absent → exit 0, `cosign not found; skipping checksum signature verification` warning, install completes;
  6. dry-run with cosign present prints the `.sigstore.json` URL and the would-verify line;
  7. structural assertion that `install.sh` contains `cosign verify-blob`, `--bundle`, and both pinned identity constants.
- Keep the existing 18 cases green; the `fetch_asset` refactor must not change the checksum failure messages.

**Step 3: Write minimal implementation**

Implement Step 1. Suggested shape:

```sh
verify_checksum_signature() {
  [ -n "$TMP_CHECKSUMS" ] || return 0
  if ! command -v cosign >/dev/null 2>&1; then
    echo "warning: cosign not found; skipping checksum signature verification" >&2
    return 0
  fi
  # fetch .sigstore.json with fetch_asset; 404 -> warn/return 0; 2 -> error/return 1
  # cosign verify-blob --bundle ... || { error; return 1; }
  echo "verified wayforge-checksums.txt signature"
}
```

Call it after the checksum `case` block and before the `verify_asset` calls. Keep temp cleanup in the existing `cleanup()` trap; do not remove temp files manually on the verification-success path (the trap owns them).

**Step 4: Run test to verify pass**

Run (owner: agent if `bats` is installed):
```bash
make check-bats
```
Expected: every `tests/bash/install_sh.bats` case passes (existing plus new) and `tests/bash/bashrc_snippet.bats` stays green. If `bats` is unavailable, record the skip and run:
```bash
bash -n install/install.sh
```
Expected: no syntax errors.

**Step 5: Commit**

```bash
git add install/install.sh tests/bash/install_sh.bats
git commit -m "feat(install): verify cosign-signed checksum bundle in install.sh (Issue #271)"
```

### Task 3: `--no-modify-path` / `-NoModifyPath` for both installers

**Objective:** Both installers accept a PATH opt-out that suppresses persistent PATH writes on install and PATH removals on uninstall, with dry-run output and bats/Pester coverage.

**Files:**
- Modify: `install/install.sh` (`NO_MODIFY_PATH`, option parsing/usage, `run_install`, `run_uninstall`)
- Modify: `install/install.ps1` (`-NoModifyPath`, `Install-Wayforge`, `Uninstall-Wayforge`)
- Modify: `tests/bash/install_sh.bats`
- Modify: `tests/powershell/install.Tests.ps1`
- Validate: `tests/bash/install_sh.bats`, `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

- `install.sh`: add `NO_MODIFY_PATH=0`, `--no-modify-path` to the usage block and option parser. When `NO_MODIFY_PATH=1`:
  - install: skip `append_path_block` for `~/.bashrc` / `~/.zshrc` and skip the `remove_path_block` calls that currently run when Node was provisioned; still print `wayforge ${TAG#v} installed to ${binary_path}` and the manual `export PATH="..."` line;
  - uninstall: skip `remove_path_block` for both shell profiles;
  - dry-run: replace the `would append` / `would remove wayforge PATH block` lines with `[dry-run] would skip PATH modification (--no-modify-path)`.
- `install.ps1`: add `[switch]$NoModifyPath` to `param()` and the comment-based help. When set:
  - install: skip `Add-UserPathEntry $binDir` (and the Node `Add-UserPathEntry` inside `Install-LocalNode` if Node provisioning runs); still print the installed path and a manual PATH note;
  - uninstall: skip `Remove-UserPathEntry $binDir` / `Remove-UserPathEntry $nodeDir`;
  - dry-run: print `[dry-run] would skip User PATH update (-NoModifyPath)` instead of `would add to User PATH` / `would remove from User PATH`.
- `--no-modify-path` does not change the prefix, files, checksum verification, signature verification, or Node provisioning location.
- The issue's original `--no-path` / `-NoPath` names are superseded; do not add aliases unless the maintainer asks for them.

**Step 2: Add or update validation**

In `tests/bash/install_sh.bats`:
- Add `install.sh --dry-run --no-modify-path` case: output contains `would skip PATH modification (--no-modify-path)`, does not contain `would append wayforge PATH block`, and does not contain `would remove wayforge PATH block`.
- Add a full install with `--no-modify-path` and `--skip-node-check`: exit 0, `$TEST_PREFIX/bin/wfg` exists, and `$TEST_HOME/.bashrc` / `$TEST_HOME/.zshrc` do not exist (or are unchanged if pre-created). The fixture-aware `curl`/`sha256sum` setup is already in place.
- Add an uninstall dry-run with `--no-modify-path`: output contains the skip line and does not contain `would remove wayforge PATH block`.

In `tests/powershell/install.Tests.ps1`:
- Add a dry-run case asserting `[dry-run] would skip User PATH update (-NoModifyPath)` and the absence of `would add to User PATH`.
- Add a full-install case with `-NoModifyPath` and `-SkipNodeCheck`, capturing `[Environment]::GetEnvironmentVariable('Path', 'User')` before and after and asserting it is unchanged; restore it in `finally` as the existing checksum tests do.
- Add an uninstall dry-run case asserting the skip line and the absence of `would remove from User PATH`.

**Step 3: Write minimal implementation**

Implement Step 1 with the smallest diff:

- POSIX: parse `--no-modify-path`; guard the two `append_path_block` calls and the two `remove_path_block` calls in `run_install` / `run_uninstall` with `if [ "$NO_MODIFY_PATH" -eq 0 ]; then ... fi`; add the dry-run line in both branches.
- PowerShell: add `[switch]$NoModifyPath`; guard `Add-UserPathEntry` / `Remove-UserPathEntry` calls with `if (-not $NoModifyPath) { ... }`; add the dry-run line in both branches. In `Install-LocalNode`, pass the opt-out through (e.g. guard its `Add-UserPathEntry $nodeDir` with `-not $NoModifyPath`); keep the in-process `$env:Path` update so the rest of the install still works.
- Keep the manual export/PATH message so `--no-modify-path` users know what to do.

**Step 4: Run test to verify pass**

Run (owner: agent if the toolchains are installed):
```bash
make check-bats
make check-pester
```
Expected: bats green; Pester green for `install.Tests.ps1` with the known environment-gated `bootstrap.Tests.ps1` failures recorded in `docs/ai/logs/2026-10.md` (or a skip if `pwsh`/Pester is absent). Also run the PowerShell parse check:
```powershell
pwsh -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw install/install.ps1))"
```
Expected: no parse error.

**Step 5: Commit**

```bash
git add install/install.sh install/install.ps1 tests/bash/install_sh.bats tests/powershell/install.Tests.ps1
git commit -m "feat(install): add --no-modify-path / -NoModifyPath opt-out (Issue #271)"
```

### Task 4: Document the signed-install trust model, harden the recommended path, add ADR-0048, and amend the ADRs

**Objective:** README/RELEASE no longer recommend `irm | iex` / `curl | sh`; `docs/security/installer-trust.md` documents hashes, cosign bundle verification, EDR allow-listing, Authenticode status, and the 2026-10-21 AMSI context; ADR-0048 records the keyless signing trust anchor and ADR-0035/0045/0047 receive `**Amended**` entries.

**Files:**
- Create: `docs/security/installer-trust.md`
- Create: `docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md` (trust anchor: workflow identity, Fulcio/Rekor, `.sigstore.json` policy)
- Modify: `README.md` (install section, lines 9-27)
- Modify: `RELEASE.md` (consuming-repo install block lines 117-129; release asset/checksum contract lines 276-285)
- Modify: `docs/ai/architecture.md` (line 10 runtime boundary, line 30 installer bullet, line 35 release-workflow bullet)
- Modify: `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md` (amendment header, Decisions 1, 8, 13; new Decisions 14-15)
- Modify: `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md` (Decision 1, Consequences, cross-reference ADR-0048)
- Modify: `docs/ai/decisions/ADR-0045-self-hosted-release-runner-cross-compilation.md` (Consequences: `id-token: write` / OIDC-minting implication, Sigstore egress, cosign prerequisite, `actions: read` narrowing, cross-reference ADR-0048)
- Modify: `CHANGELOG.md` (`[Unreleased]` Added/Changed)
- Modify: `docs/ai/logs/2026-10.md` (2026-10-30 closure entry; `memory_update` gate)

**Step 1: Establish expected behaviour**

The live docs must match the code exactly:

- Recommended install is download-to-file → verify hash (and bundle signature if cosign is available) → `-DryRun` / `--dry-run` → run. `irm ... | iex` and `curl ... | sh` are no longer presented as the recommended path.
- `wayforge-checksums.txt` covers every binary, both share archives, `install.sh`, and `install.ps1`; `wayforge-checksums.txt.sigstore.json` is a detached bundle and is not inside the manifest.
- `install.sh` verifies the bundle when cosign is present (fail-closed on invalid/non-404 fetch failure; warn-and-continue on absent/404). `install.ps1` does not require cosign and documents manual `cosign verify-blob --bundle`.
- Authenticode is **not** currently applied; signing is conditional on SignPath (#240). Do not claim the binary is signed.
- The 2026-10-21 detection (`Trojan:PowerShell/AmsiBypazz.E!MTB`, AMSI, `pwsh.exe`) and the `irm | iex` cradle are recorded as context; the new flow avoids piping a remote script to `Invoke-Expression`.
- The PATH opt-out is documented as `--no-modify-path` / `-NoModifyPath`.
- ADR-0048 records the signed-manifest trust anchor exactly as implemented: the GitHub Actions workflow identity `release.yml@refs/heads/main` via cosign keyless (Fulcio + Rekor), materialized as `wayforge-checksums.txt.sigstore.json`; the verification policy matrix (present + valid → proceed; present + invalid or non-404 fetch failure → abort; absent/404 → warn); identity/issuer pins must change in the same commit as any trigger change; `wfg upgrade` remains hash-only until a follow-up.
- ADR-0045 records that `id-token: write` lets code in the persistent runner mint the `release.yml@refs/heads/main` OIDC identity; this is acceptable only under Decision 3's `push: main`-only trigger. Record the Sigstore/Fulcio/Rekor/TUF/OIDC egress dependency, the pinned cosign prerequisite, and the `actions: read` least-privilege narrowing.
- ADR-0047 records that the one-shot installer now verifies the bundle while `wfg upgrade` remains hash-only (explicit gap), and cross-references ADR-0048.

**Step 2: Add or update validation**

Documentation checks (owner: agent):
- `Select-String -Path README.md,RELEASE.md -Pattern 'irm .*\\| *iex|curl .*\\| *sh'` returns no live recommended-path commands (historical code fences in other docs/logs are allowed).
- `docs/security/installer-trust.md` contains sections for downloads/writes, SHA-256, cosign bundle verification, Authenticode status, EDR allow-list guidance, the 2026-10-21 AMSI context, and false-positive reporting.
- `docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md` exists and covers the workflow-identity trust anchor, keyless Fulcio/Rekor flow, `.sigstore.json` bundle, verification policy matrix, identity/issuer pins, and `wfg upgrade` hash-only scope.
- ADR-0035 has a `**Amended**: 2026-10-30` line and Decisions 14-15; ADR-0047 Decision 1 no longer says signing is out of scope and cross-references ADR-0048; ADR-0045 Consequences mention `id-token: write`, the OIDC-minting implication, Sigstore network access, cosign, and `actions: read`.
- `docs/ai/architecture.md` line 10 no longer says `curl | sh` / `irm | iex`.
- `make check` is green.
- The acceptance-criteria traceability table below has no unowned row.

**Step 3: Write minimal implementation**

- **README.md**: replace the two install code fences with download + hash verification + dry-run + run, plus a one-line link to `docs/security/installer-trust.md` for cosign verification. Example POSIX block:
  ```bash
  curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/install.sh
  curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt
  grep '  install.sh$' wayforge-checksums.txt | sha256sum -c -
  sh install.sh --dry-run
  sh install.sh
  ```
  Windows block:
  ```powershell
  Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 -OutFile install.ps1
  Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt -OutFile wayforge-checksums.txt
  $expected = (Select-String -Path wayforge-checksums.txt -Pattern '  install\.ps1$').Line.Split()[0]
  if ((Get-FileHash install.ps1 -Algorithm SHA256).Hash -ne $expected.ToUpper()) { throw 'install.ps1 checksum mismatch' }
  pwsh -File install.ps1 -DryRun
  pwsh -File install.ps1
  ```
  Keep the existing checksum paragraph and add a sentence that the manifest is cosign-signed into a `.sigstore.json` bundle and `install.sh` verifies it when cosign is present.
- **RELEASE.md**: mirror the README install blocks; add `wayforge-checksums.txt.sigstore.json` to the release asset list; extend the checksum bullet to say the manifest includes the installers and is signed with cosign keyless; record the pinned identity and issuer; update the local-validation note to mention cosign fixture tests.
- **docs/security/installer-trust.md**: create the sections in Step 2. Include the exact verification commands for POSIX and Windows, the identity pin, the Authenticode-unsigned status, EDR allow-list guidance (allow the prefix `bin/wfg[.exe]` and the installer script hash, not the whole shell), the AMSI detection context, and a false-positive reporting path (Microsoft Defender submission plus a GitHub issue with the detection name/hash). Use `cosign verify-blob --bundle wayforge-checksums.txt.sigstore.json ...` everywhere.
- **ADR-0035**: add `**Amended**: 2026-10-30 — signed checksum bundle and `--no-modify-path` (Decisions 14-15; see ADR-0048).`; rewrite Decision 1's commands to the download/verify/dry-run/run flow; update Decision 8 to say the recommended flow avoids the cradle; amend Decision 13's contract with bundle verification; add Decision 14 (cosign keyless `.sigstore.json` bundle, pinned identity, `install.sh` policy, `install.ps1` manual verification, cross-reference ADR-0048) and Decision 15 (`--no-modify-path` / `-NoModifyPath` semantics). Keep the nodejs.org accepted-risk sentence.
- **ADR-0048**: create `docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md` with the trust-anchor decision, the GitHub Actions identity pin (`release.yml@refs/heads/main`), the keyless Fulcio/Rekor flow, the `.sigstore.json` bundle over `wayforge-checksums.txt`, the verification policy matrix, the identity/issuer pin maintenance rule, and the explicit `wfg upgrade` hash-only scope.
- **ADR-0047**: amend Decision 1 to say the checksum manifest is now signed with cosign keyless into a bundle, the one-shot installer verifies it when cosign is present, and `wfg upgrade` remains hash-only in this task (follow-up), cross-referencing ADR-0048. Update Consequences accordingly; keep the same-origin trust discussion and the fail-open/fail-closed split.
- **ADR-0045**: add a consequence that the `release` job now needs `id-token: write` and outbound access to Sigstore/Fulcio/Rekor/TUF/OIDC, installs a pinned cosign, and narrows inherited `actions: write` to `actions: read`. Record explicitly that `id-token: write` lets code in the persistent runner mint the `release.yml@refs/heads/main` OIDC identity, acceptable only while Decision 3's `push: main`-only trigger holds. Note that self-hosted-runner compatibility of `cosign-installer` must be verified in the Task 5 release rehearsal (fallback: direct pinned binary download).
- **CHANGELOG.md**: add `### Added` (cosign-signed `.sigstore.json` checksum bundle; installers included in checksums; `--no-modify-path` / `-NoModifyPath`) and `### Changed` (recommended install path no longer uses `irm | iex` / `curl | sh`; `install.sh` verifies the bundle when cosign is present) under `[Unreleased]`.
- **docs/ai/logs/2026-10.md**: add a 2026-10-30 entry with tasks, validation results, architect/memory gates, and the human validations still outstanding (Task 5 release rehearsal, real macOS/Linux/Windows installs, cosign present/absent, EDR check).

**Step 4: Run test to verify pass**

Run (owner: agent):
```bash
make check
```
Expected: Vitest, `tsc --noEmit`, ESLint, Prettier, and jscpd (<8%) all green. Then run the grep checks from Step 2 and confirm every acceptance criterion below has an owning validation.

**Step 5: Commit**

```bash
git add README.md RELEASE.md CHANGELOG.md docs/security/installer-trust.md docs/ai/architecture.md docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md docs/ai/decisions/ADR-0045-self-hosted-release-runner-cross-compilation.md docs/ai/logs/2026-10.md
git commit -m "docs: record signed installer trust model and hardened install path (Issue #271)"
```

### Task 5: Self-hosted release rehearsal (@PabloBen, human-owned)

**Objective:** Prove on the existing self-hosted runner that the release workflow can install cosign v3.1.4, sign `wayforge-checksums.txt` into `wayforge-checksums.txt.sigstore.json`, publish it, and that `install.sh` / manual verification accept the published bundle; record the result in the PR and the monthly log.

**Owner:** human — **@PabloBen**. The agent must not run this task.

**Files:**
- Modify: `docs/ai/logs/2026-10.md` (record the rehearsal result)
- External: PR description checklist (tag `@PabloBen`)

**Step 1: Confirm prerequisites and configuration**

Before triggering the release, confirm on the self-hosted runner:

- Runner labels: `[self-hosted, linux, x64]`.
- Required tools: `git`, `curl`, `unzip`, `tar`, `ca-certificates`, `coreutils` (`sha256sum`), `python3`, `gawk`, `gh`.
- Network egress to:
  - `https://token.actions.githubusercontent.com` (GitHub OIDC),
  - `https://fulcio.sigstore.dev` (certificate authority),
  - `https://rekor.sigstore.dev` (transparency log),
  - `https://tuf-repo-cdn.sigstore.dev` (trust root),
  - `https://oauth2.sigstore.dev` (Fulcio OIDC),
  - `https://github.com` / `https://objects.githubusercontent.com` (cosign binary download and release assets).
- Workflow permissions on the `release` job: `contents: write`, `actions: read`, `id-token: write`.
- `sigstore/cosign-installer@v4.1.0` with `cosign-release: 'v3.1.4'` is present in the workflow.

**Step 2: Pre-release dry checks**

Run locally or in a workflow `workflow_dispatch` rehearsal if available:

```bash
cosign version
# expect v3.1.4
gh workflow view Release --repo Macacoders/wayforge
# confirm the workflow uses the self-hosted runner and the cosign steps
```

If `cosign-installer` cannot run on the self-hosted runner (the action documents GitHub-hosted runners and says self-hosted "may not work"), use this fallback in the workflow instead of the action:

```bash
COSIGN_VERSION=v3.1.4
curl -fsSLO "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64"
curl -fsSLO "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign_checksums.txt"
grep '  cosign-linux-amd64$' cosign_checksums.txt | sha256sum -c -
install -m 0755 cosign-linux-amd64 "$HOME/.local/bin/cosign"
cosign version
```

Record which path was used (action or fallback) in the PR.

**Step 3: Trigger the release and inspect assets**

After merging the release commit to `main` (the workflow triggers on `push: main`):

```bash
gh run list --workflow Release --limit 1
gh run watch <run-id>
gh release view "v$(cat VERSION)" --repo Macacoders/wayforge --json assets \
  --jq '.assets[].name'
```

Expected assets include `wayforge-checksums.txt` and `wayforge-checksums.txt.sigstore.json`, plus the binaries, share archives, `install.sh`, and `install.ps1`. The signing step must appear after `Generate checksums` and before `Create Release` in the run log.

If the release already exists but the bundle asset is missing, treat it as a partial release: `skip-if-exists` does not heal it. Record the gap and open a follow-up for a re-upload/reheal path; do not silently accept a hash-only release.

**Step 4: Verify the published release**

Download the manifest and bundle:

```bash
VER="v$(cat VERSION)"
mkdir -p /tmp/wf-verify
gh release download "$VER" --repo Macacoders/wayforge \
  --pattern 'wayforge-checksums.txt*' --dir /tmp/wf-verify
cd /tmp/wf-verify
```

Verify the bundle with the pinned identity:

```bash
cosign verify-blob wayforge-checksums.txt \
  --bundle wayforge-checksums.txt.sigstore.json \
  --certificate-identity-regexp '^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Expected: exit 0 and a verified signature/certificate/transparency-log result.

Verify the installer entries and hashes:

```bash
grep -E '  (install\.sh|install\.ps1)$' wayforge-checksums.txt
grep -E '  (install\.sh|install\.ps1)$' wayforge-checksums.txt | sha256sum -c -
```

Download and test `install.sh` with cosign present:

```bash
gh release download "$VER" --repo Macacoders/wayforge \
  --pattern 'install.sh' --pattern 'wayforge-checksums.txt*' --dir /tmp/wf-install
cd /tmp/wf-install
sh install.sh --version "${VER#v}" --dry-run
sh install.sh --version "${VER#v}" --no-modify-path
# expect the signature to verify and no PATH mutation
```

Test with cosign absent (simulate a host without cosign):

```bash
PATH="/usr/bin:/bin" sh install.sh --version "${VER#v}" --dry-run
# expect: warning: cosign not found; skipping checksum signature verification
```

Test tamper detection:

```bash
cp wayforge-checksums.txt wayforge-checksums.txt.bak
printf '\n' >> wayforge-checksums.txt
cosign verify-blob wayforge-checksums.txt \
  --bundle wayforge-checksums.txt.sigstore.json \
  --certificate-identity-regexp '^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
# expect non-zero
mv wayforge-checksums.txt.bak wayforge-checksums.txt
```

Test the transitional 404 path against a release that predates the bundle (if one exists), or against a local `--url-base` fixture that returns 404 for the bundle:

```bash
sh install.sh --version <pre-bundle-version> --url-base <fixture-or-release> --dry-run
# expect: warning: cosign signature bundle is unavailable ...; skipping signature verification
```

Windows checks:

```powershell
Invoke-WebRequest -Uri "https://github.com/Macacoders/wayforge/releases/download/$VER/wayforge-checksums.txt" -OutFile wayforge-checksums.txt
Invoke-WebRequest -Uri "https://github.com/Macacoders/wayforge/releases/download/$VER/wayforge-checksums.txt.sigstore.json" -OutFile wayforge-checksums.txt.sigstore.json
cosign verify-blob wayforge-checksums.txt --bundle wayforge-checksums.txt.sigstore.json `
  --certificate-identity-regexp '^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$' `
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
pwsh -File install.ps1 -Version $VER -DryRun
pwsh -File install.ps1 -Version $VER -NoModifyPath
# assert the User PATH is unchanged
```

**Step 5: Record results and add the PR checklist**

Add to the PR description a checklist explicitly addressed to `@PabloBen`:

```md
## Release verification (self-hosted) — @PabloBen

- [ ] `cosign-installer@v4.1.0` installs cosign v3.1.4 on the self-hosted runner (or the pinned direct-download fallback is used)
- [ ] `cosign sign-blob --bundle wayforge-checksums.txt.sigstore.json` succeeds
- [ ] `wayforge-checksums.txt.sigstore.json` is uploaded to the release
- [ ] The bundle asset is present on the existing release (no partial `skip-if-exists` release)
- [ ] `cosign verify-blob --bundle` passes with the pinned identity
- [ ] `install.sh` verifies the bundle when cosign is present and warns when absent
- [ ] Tampered manifest fails verification and aborts before prefix mutation
- [ ] Transitional 404 bundle path warns and continues
- [ ] Windows `install.ps1` hash verification and manual `cosign verify-blob --bundle` work
- [ ] `--no-modify-path` / `-NoModifyPath` leaves the shell profile / User PATH unchanged
```

Record the run id, release tag, cosign version, action-vs-fallback choice, command outputs, and any failures in `docs/ai/logs/2026-10.md`. If any check fails, do not close #271; open a follow-up issue with the exact failing command and logs. If the bundle is missing from an existing release, open a follow-up for a re-upload/reheal path in addition to the failing check.

## Acceptance criteria mapping

| Criterion | Owning task | Validation |
|---|---|---|
| README and RELEASE no longer present `irm ... | iex` or `curl ... | sh` as the recommended install path | 4 | agent grep (Step 2) |
| Both installers support `-NoModifyPath` / `--no-modify-path`; tests cover it | 3 | bats + Pester no-modify-path cases |
| `install.sh` verifies the cosign bundle when cosign is present, fails closed on invalid, warns when absent/404 | 2 | bats cosign cases; structural assertion |
| Release publishes `wayforge-checksums.txt.sigstore.json`; `cosign verify-blob --bundle` succeeds with the pinned identity | 1, 4, 5 | workflow static test; Task 5 release rehearsal (human) |
| `wayforge-checksums.txt` includes the installer scripts and all release assets | 1, 5 | workflow static test; Task 5 asset inspection (human) |
| No Authenticode enforcement is added | 1, 4 | diff review; docs state unsigned-until-SignPath |
| `docs/security/installer-trust.md` exists and covers hashes, cosign bundle, EDR allow-list, detection context | 4 | agent section grep |
| ADR-0048 records the keyless signing trust anchor; ADR-0035/0045/0047 are amended and cross-reference it | 4 | agent ADR grep; ADR-0048 and amendments merge in the same PR as Task 1 |
| `make check`, `make check-bats`, and `make check-pester` (or recorded skips) pass | 1-4 | agent runs; skips recorded |
| Self-hosted release rehearsal is documented for @PabloBen with commands and configuration | 5 | PR checklist; monthly log entry |

## Validation ownership

| Validation | Owner |
|---|---|
| `npx vitest run tests/typescript/release/release-workflow.test.ts` | agent |
| `make check-bats` (checksum + cosign bundle + no-modify-path cases) | agent (skip recorded if `bats` absent) |
| `make check-pester` scoped to `install.Tests.ps1` (no-modify-path cases) | agent (skip recorded if `pwsh`/Pester absent) |
| `bash -n install/install.sh` and the PowerShell parse check | agent |
| `make check` (Vitest, typecheck, ESLint, Prettier, jscpd) | agent |
| ADR-0048 content plus ADR-0035/0045/0047 amendment and cross-reference grep | agent |
| `actionlint .github/workflows/release.yml` | agent if installed, otherwise human/record skip |
| Self-hosted release rehearsal: `id-token: write`, `cosign-installer` or fallback, `cosign sign-blob --bundle`, `.sigstore.json` upload | human — @PabloBen |
| Real `cosign verify-blob --bundle` against the published release with the pinned identity | human — @PabloBen |
| Real Linux/macOS install with cosign present (valid + tampered bundle) and absent | human — @PabloBen |
| Real Windows install and manual hash/cosign verification | human — @PabloBen |
| EDR/AMSI check of the new download-to-file flow (no `irm | iex`) | human — @PabloBen |

## Blocking decisions and required gates

1. **Issue #271 criteria update (required before implementation).** The issue currently requires `.sig` / `.pem` and `--no-path` / `-NoPath`. The approved direction is cosign v3 + `wayforge-checksums.txt.sigstore.json` and `--no-modify-path` / `-NoModifyPath`. Update the issue acceptance criteria (requires `/issue edit` authorization) so the issue, plan, tests, and docs describe the same contract.
2. **Self-hosted `cosign-installer` (resolved: keep self-hosted, verify in Task 5).** The action may not work on self-hosted runners. Task 5 includes the exact fallback: direct download of `cosign-linux-amd64` v3.1.4, SHA-256 verification, and `cosign version`. The signing command does not change.
3. **ADR strategy (resolved by the Task 1 architect review: ADR-0048 + amendments).** Create `docs/ai/decisions/ADR-0048-cosign-keyless-checksum-bundle.md` for the keyless signing trust anchor and add `**Amended**: 2026-10-30` entries to ADR-0035, ADR-0045, and ADR-0047, each cross-referencing ADR-0048. Do not mark any whole ADR `Superseded`; that convention is reserved for whole-ADR replacement (for example ADR-0004 → ADR-0038, ADR-0006 → ADR-0039, ADR-0035 four-tier → ADR-0036). ADR-0048 and the amendments must land in the same PR merge as the Task 1 code; the workflow signs on push to `main`, so docs must not trail the code across that merge.
4. **Signature fetch policy (resolved).** Non-404 bundle fetch failures with cosign present abort; 404 and cosign-absent warn and continue.
5. **`--no-modify-path` naming (resolved).** Use `--no-modify-path` / `-NoModifyPath`; do not add `--no-path` / `-NoPath` aliases unless the maintainer asks.
6. **Gates.** `architect_review: true` — completed for Task 1: **approve with conditions** (ADR-0048 required; ADR-0045/0047 conditions above; ADR-0048 and amendments must land in the same PR merge). Task 4 must satisfy those conditions before merge. `memory_update: true` — Task 4 closes the monthly log, architecture, CHANGELOG, and ADR record.
7. **Release prerequisite (blocking for end-to-end validation, owned by Task 5).** A release produced by the new workflow is required to exercise real cosign signing/verification and the `.sigstore.json` upload. @PabloBen runs the rehearsal and records the result.
8. **No Authenticode enforcement.** Authenticode remains conditional on SignPath (#240); this task must not add enforcement or claim the binary is signed.
