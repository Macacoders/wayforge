---
status: planned
created: 2026-10-28
task: 0/4
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #240: Installer signing, verified downloads, and EDR hardening

**Goal:** Release artifacts are Authenticode-signed and the checksum manifest is signed, both one-shot installers verify the trust material before mutating the prefix, the documented install path stops recommending `irm ... | iex`, and users/EDR teams get actionable allow-list guidance.

**Architecture:** Signing happens in the existing single Linux self-hosted release job with `osslsigncode` (PE + PowerShell script support, RFC3161 timestamping) so no Windows runner is added. The Windows binaries and `install.ps1` are signed before `wayforge-checksums.txt` is generated, so published hashes describe the signed bytes; the checksum manifest is additionally signed with cosign keyless and the signature assets are published. `install.ps1` verifies the embedded Authenticode signature with the built-in `Get-AuthenticodeSignature` (no new user dependency); `install.sh` keeps SHA-256 verification and verifies the cosign manifest signature only when `cosign` is available. Both installers gain an explicit PATH opt-out. Documentation replaces the download-cradle quickstart with download → verify → `-DryRun` → run and adds a dedicated EDR/allow-list page.

**Tech Stack:** GitHub Actions (`.github/workflows/release.yml`), `osslsigncode`, Authenticode + RFC3161 timestamping, cosign keyless (Sigstore/GitHub OIDC), PowerShell 5.1+, POSIX `sh`, bats, Pester, TypeScript/Markdown docs.

**Scope classification:** `multi-task`

**Task budget rationale:** Four tasks, each an independently reviewable deliverable with a different toolchain or validation loop: (1) release/signing infrastructure, (2) Windows installer + Pester, (3) POSIX installer + bats, (4) user-facing docs/ADRs. This mirrors the accepted split in the #243 plan (separate platform tasks) and keeps the signing-trust decision reviewable before installer behavior changes. Four tasks is below the 6-task confirmation threshold.

## Confirmed planning decisions (recommended defaults; items marked BLOCKING must be confirmed at approval)

1. **Signing tool and runner (BLOCKING).** Use `osslsigncode` on the existing `[self-hosted, linux, x64]` runner to sign both Windows PE binaries and `install.ps1` with a CA-issued code-signing certificate, timestamped via an RFC3161 URL. `osslsigncode` supports `.exe` and `.ps1` signing, so no Windows runner is introduced and ADR-0045's topology stays intact. Alternative (Azure Artifact Signing) requires Windows runners and is rejected unless the certificate source forces it.
2. **Certificate custody and type (BLOCKING).** Preferred: cloud-HSM/PKCS#11 signer referenced by `osslsigncode` (`-pkcs11module`), with no private key in GitHub secrets. Fallback: base64 PFX in `SIGNING_PFX_BASE64` + `SIGNING_PFX_PASSWORD` repository secrets. OV vs EV affects SmartScreen reputation timing but not the code path. This must be decided before Task 1 can be validated end to end.
3. **Checksum manifest signature (BLOCKING).** Use cosign keyless (`cosign sign-blob` with GitHub OIDC) and publish `wayforge-checksums.txt.sig` + `wayforge-checksums.txt.pem`. No long-lived key to manage; identity is pinned to this repository's release workflow. GPG was considered and rejected (key distribution/rotation and gpg availability at install time).
4. **Installer verification policy.** Windows: if `wayforge-checksums.txt` was fetched (post-#243 release), the downloaded binary must have a valid Authenticode signature from a pinned publisher; if the release predates the checksum asset (existing 404 path), warn and continue unverified. POSIX: SHA-256 verification stays mandatory-on-presence; cosign verification of the manifest runs only when `cosign` is on PATH, is fatal when it is present and fails, and warns when skipped. This keeps the existing backward-compatible fallback shape from ADR-0035 Decision 13 (BLOCKING to confirm the POSIX optional-verification asymmetry).
5. **PATH behavior (BLOCKING).** Keep add-by-default for backward compatibility, add `--no-path` / `-NoPath` to skip PATH registration, and always print the exact export/added message. Making no-PATH the default is rejected as a breaking change outside this bug's intent.
6. **Signing cutover.** The first release containing this work is the first signed release; older releases (`1.0.2` and earlier) stay unsigned and are covered by the documented warning path. There is no retroactive signing.
7. **Out of scope.** `wfg upgrade` (`cli/src/lib/upgrade.ts`) keeps its checksum-only verification; TS-side Authenticode verification needs a platform-specific child process or a new dependency and is tracked as a follow-up. Also out of scope: signing `install.sh`/the share archives, nodejs.org download verification, and Microsoft allow-list submission itself (a human action, documented in Task 4).
8. **New ADR.** Record the signing/trust-boundary decision as `ADR-0048` in Task 1; Tasks 2-4 amend ADR-0035, ADR-0047, and architecture accordingly. `architect_review` must run before docs closure because this changes the release trust boundary.

## Repository state check (2026-10-28, before approval)

- `develop` (now at `8589948`) includes the work this plan builds on: #227 `.agents/` migration (`8589948`, PR #253), #243 checksum verification (`de381c1`, PR #256), #248 legacy-installer deletion (`ce40dbf`, PR #254), #237 `update`/`upgrade` (`b24a206`, PR #244), plus #220, #241, #242, #247. Checksum generation and verification are therefore **not re-planned**; Tasks 2/3 add the signature layer on top.
- Open PRs: #258 (#252, gh-issue auth), #255 (#231, workflow proportionality), #246 draft (#229, installer-convergence plan), #203 (#202, `/help`). None touches `install/`, `.github/workflows/release.yml`, `scripts/`, `tests/bash/`, or `tests/powershell/`, so no merge conflict with Tasks 1-3 is expected. Rebase and re-run `git diff origin/develop...HEAD -- install .github/workflows scripts tests/bash tests/powershell` before each task if any of them merges.
- The current checkout is `develop` at `8589948`; the only working-tree change is this plan file (untracked). #227 is already merged, so there is no longer an #227 branch delta to avoid. `git diff --stat 8589948 -- install .github/workflows scripts tests/bash tests/powershell` is empty for the plan's files.
- #229's draft plan covers CLI managed-project convergence and manifest-scoped reinstall, not the one-shot installer or release signing. No scope overlap; coordinate only if it changes `wfg upgrade` signature behavior, which this plan leaves as a follow-up.
- #252 removes `gh-app-auth.ts`; this plan does not depend on it (only the issue workflow does).
- **Net effect:** no task is added or removed. The only substantive adjustment is made explicit: criterion 3's hash half is already delivered by #243, so Tasks 2/3 own signature verification.

## Repository facts the implementer needs

- The current checkout is `develop` at `8589948` (only this plan file is untracked). Create the implementation branch from `develop`.
- `.github/workflows/release.yml` has two jobs, both `runs-on: [self-hosted, linux, x64]` (ADR-0045). `build-binaries` cross-compiles six targets via `bun build --compile` and uploads artifacts (lines 12-70). `release` downloads artifacts, creates the two share archives, generates `wayforge-checksums.txt` with `sha256sum dist/wayforge-* wayforge-share-*.tar.gz wayforge-share-*.zip` (lines 97-105), then `gh release create/upload` including `install/install.sh` and `install/install.ps1` (lines 107-121).
- **Ordering invariant:** any binary signing must happen before checksum generation, otherwise published hashes describe unsigned bytes. `install.ps1` is uploaded directly from the repo, so it must be signed to a temp path and that temp path uploaded instead.
- `install/install.ps1` (PowerShell 5.1 compatible): `Add-UserPathEntry`/`Remove-UserPathEntry` write the User PATH at lines 147-174 and are called at lines 229 and 415; the success message at line 418 already says the entry was added. Checksum parsing/verification is lines 294-325 (normalizes by file name). `Install-Wayforge` is lines 330-427: downloads to temp, fetches checksums with a 404-only warn fallback, verifies, `Ensure-Node`, then creates dirs, moves the binary (line 401), extracts the share, and adds PATH (line 415). There is a `try/finally` for temp cleanup.
- `install/install.sh` (POSIX `sh`): PATH marker helpers are lines 146-178 (`append_path_block`), used at lines 548-549; `run_install` is lines 437-550 and already prints the export line at 545-546. Checksum helpers are lines 216-302; real-install ordering downloads to `mktemp`, verifies (lines 492-515), then `ensure_node`, moves the binary (line 523), extracts, and appends PID PATH blocks. Usage text is lines 46-57; unknown flags currently fall through to the usage error path, so a new `--no-path` case must be added to the parse loop.
- Both installers already support `--dry-run` / `-DryRun` (PS line 37; sh lines 54, 86) and print the planned actions. README does not advertise the installer dry-run.
- Current trust posture: ADR-0035 Decision 13 records SHA-256 verification before mutation with a 404 warn fallback; ADR-0047 Decision 1 explicitly says asset signing/checksum pinning is out of scope and the same-origin channel is the trust anchor. Both need amendment.
- Release assets today: six binaries, two share archives, `wayforge-checksums.txt`, `install.sh`, `install.ps1` (RELEASE.md 276-285). Runner prerequisites are listed in ADR-0045 Decision 5 and RELEASE.md line 276; neither mentions a signing tool.
- Tests: `tests/bash/install_sh.bats` (stubbed `curl`/`sha256sum`, `--url-base` fixtures) and `tests/powershell/install.Tests.ps1` (stubbed `Invoke-WebRequest` in a child `pwsh`, User PATH save/restore). `make check` does not run bats/Pester (ADR-0034); use `make check-bats` / `make check-pester`, recording skips when the toolchain is absent.
- Docs to touch: `README.md` lines 9-27 (quickstart + checksum paragraph), `RELEASE.md` lines 118-170 and 276-285, `docs/ai/architecture.md` lines 30-36, ADR-0035, ADR-0047, `docs/ai/logs/2026-10.md`, `CHANGELOG.md` under `[Unreleased]`. There is no security/EDR document yet; create `docs/security/installer-trust.md`.
- Log file from the incident: `docs/ai/plans/2026-10-21-wayforge-install-alarm.raw.log` is gitignored (`*.log`) but embedded in issue #240. Do not add secrets or token contents to docs.

## Tasks

### Task 1: Sign release artifacts and the checksum manifest in the release workflow

**Objective:** Every release signs both Windows binaries and `install.ps1` with Authenticode before checksums are generated, publishes a cosign signature for `wayforge-checksums.txt`, and fails rather than silently shipping unsigned Windows artifacts once signing is configured.

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `RELEASE.md` (runner prerequisites, signing secrets, asset list)
- Modify: `docs/ai/decisions/ADR-0045-self-hosted-release-runner-cross-compilation.md` (runner prerequisite: `osslsigncode`)
- Create: `docs/ai/decisions/ADR-0048-release-artifact-signing.md`
- Validate: `.github/workflows/release.yml`, `RELEASE.md`

**Step 1: Establish expected behaviour**

- Signing inputs are repository secrets/config: either `SIGNING_PFX_BASE64` + `SIGNING_PFX_PASSWORD` or the PKCS#11 module/token variables. The workflow must not echo them.
- In `build-binaries`, after `bun build`, sign the two Windows targets only (`matrix.os == 'win32'`) with:
  `osslsigncode sign -h sha256 -in <asset> -out <asset>.signed -pkcs12 <pfx> -pass <pass> -ts <rfc3161-url>` (or `-pkcs11module`/`-key`/`-cert` for HSM), then replace the artifact with the signed file.
- Verify each signed Windows binary with `osslsigncode verify -in <asset>` (or `-CAfile` + checksum checks) inside the job; fail the build on verification failure.
- In `release`, copy `install/install.ps1` to a temp path, sign it with the same certificate, verify it, and upload the signed copy under the asset name `install.ps1` (the repo file stays unsigned in git). Sign/verify before `Generate checksums` only if `install.ps1` is added to the manifest; otherwise sign it before `gh release upload`.
- `Generate checksums` runs after binary signing. Add `install.ps1` to `wayforge-checksums.txt` only if Task 2 requires installer-hash verification (recommended: yes, so the script hash is auditable); if added, keep the bare asset name format used by both parsers.
- After checksum generation, run `cosign sign-blob --yes --output-signature wayforge-checksums.txt.sig --output-certificate wayforge-checksums.txt.pem wayforge-checksums.txt` and upload `.sig` + `.pem` with the release. Add `id-token: write` permission to the job.
- Missing signing configuration is a hard failure for `main` releases: print an actionable error naming the missing secret. A test-only escape hatch is not added to the release workflow.

**Step 2: Add or update validation**

- Add a workflow self-check step that fails if a Windows artifact is unsigned or `wayforge-checksums.txt.sig` is absent before upload.
- Agent validation: `actionlint` (or `npx yaml-lint`) on the workflow if available; a `git diff` review confirming sign steps precede checksum generation and that the `gh release upload` list includes the signature assets and the signed installer path.
- Human validation: configure the certificate/secret on the self-hosted runner, run a release to a throwaway tag, download the assets, and confirm `osslsigncode verify`, `Get-AuthenticodeSignature` on Windows, and `cosign verify-blob` with the pinned identity all succeed.

**Step 3: Write minimal implementation**

Change `.github/workflows/release.yml` only: add a reusable signing step, wire it into the Windows matrix entries, sign `install.ps1` to a temp file in the release job, add cosign install + sign-blob after checksum generation, add `.sig`/`.pem`/signed installer to the upload list, and add `id-token: write`. Update `RELEASE.md` prerequisites and assets, and add ADR-0048 recording the tool, certificate custody, identity pinning, ordering invariant, and rotation procedure. Amend ADR-0045 Decision 5 with `osslsigncode` (and its version).

**Step 4: Run test to verify pass**

Run:
- `actionlint .github/workflows/release.yml` (agent, if installed; otherwise record the skip)
- `git diff --check` (agent)
- Human: `gh workflow run release.yml` on a throwaway main-compatible tag (or a manual release) and verify signed assets as in Step 2.

Expected: workflow parses, sign steps precede checksum generation, and a real release publishes enough assets for Task 2/3 to verify. No unsigned Windows asset is uploaded.

**Step 5: Commit**

`git add .github/workflows/release.yml RELEASE.md docs/ai/decisions/ADR-0045-self-hosted-release-runner-cross-compilation.md docs/ai/decisions/ADR-0048-release-artifact-signing.md`
`git commit -m "feat(release): sign Windows binaries and checksum manifest (Issue #240)"`

### Task 2: Verify Authenticode in `install.ps1` and make PATH explicit

**Objective:** `install.ps1` refuses a binary whose Authenticode signature is missing or untrusted on releases that publish checksums, keeps the legacy unsigned fallback for pre-checksum releases, and gains a `-NoPath` opt-out that never writes the User PATH.

**Files:**
- Modify: `install/install.ps1`
- Modify: `tests/powershell/install.Tests.ps1`
- Validate: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

- Add `[switch]$NoPath` to the param block (near `$DryRun`/`$SkipNodeCheck`) and document it in the comment-based help.
- Signature contract: after downloading the binary to `$tmpBinary` and before `Move-Item`, call `Assert-Signature`. If checksums were skipped (`$skipChecksums` true, pre-#243 release), print `warning: release <version> predates signature verification; skipping Authenticode check` and continue. Otherwise require `(Get-AuthenticodeSignature $tmpBinary)` with `Status -eq 'Valid'`, a non-empty `SignerCertificate`, and `SignerCertificate.Thumbprint` in a pinned constant array. Missing/invalid signature → `Write-Error` with the asset name and abort before any prefix mutation.
- `-NoPath` behavior: skip `Add-UserPathEntry $binDir` and the Node PATH entry, print `PATH not modified; add manually: $env:Path = "$binDir;$env:Path"`, and keep uninstall able to remove an entry that was added by an earlier install.
- Dry-run prints `would verify Authenticode signature: <asset>` and, when `-NoPath`, `would not modify User PATH`.
- PS 5.1 compatibility: no ternary/`??`; use `Get-AuthenticodeSignature` (available in 5.1).
- Test seam: add `-SkipSignatureCheck` (documented as unsafe, tests only) so fixture installs can run without a CA-signed binary; do not accept it via environment variables.

**Step 2: Add or update validation**

Extend `tests/powershell/install.Tests.ps1`:
1. structural assertions: script contains `Get-AuthenticodeSignature`, the pinned thumbprint constant, `-NoPath`, and `-SkipSignatureCheck`;
2. a fixture install with a checksum file present but an unsigned binary → non-zero exit, `signature`/`Authenticode` message, prefix untouched;
3. a fixture install with `-SkipSignatureCheck` → exit 0 (covers the rest of the flow);
4. `-NoPath` → exit 0, success output says PATH not modified, and the captured User PATH is unchanged;
5. existing checksum cases stay green (the signature check must not run when `$skipChecksums` is true).
Save/restore the User PATH in every case (existing harness does this; keep it).

**Step 3: Write minimal implementation**

Add the param/help entries, `Assert-Signature`, the pinned thumbprint constant (placeholder until the certificate is issued, with a `TODO(#240)` only if approval keeps the cert pending), the call in `Install-Wayforge`, and the `$NoPath` guards around `Add-UserPathEntry` calls (binary and Node) plus their dry-run lines.

**Step 4: Run test to verify pass**

Run (agent, if `pwsh` + Pester are installed):
`pwsh -NoProfile -Command "Invoke-Pester -Path ./tests/powershell/install.Tests.ps1 -PassThru | Select-Object FailedCount"`
Expected: `FailedCount = 0`. Fallback if Pester is unavailable: `pwsh -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw install/install.ps1))"` and record the skip.
Human: install a signed release into a Windows test prefix, confirm `Get-AuthenticodeSignature` is valid, then repeat with a tampered binary and confirm the abort leaves the prefix untouched.

**Step 5: Commit**

`git add install/install.ps1 tests/powershell/install.Tests.ps1`
`git commit -m "feat(install): verify Authenticode and add -NoPath (Issue #240)"`

### Task 3: Verify the signed manifest in `install.sh` and make PATH explicit

**Objective:** `install.sh` verifies the cosign signature of `wayforge-checksums.txt` when cosign is available (failing closed on a present-but-invalid signature), gains `--no-path`, and keeps its existing SHA-256 and 404 fallback behavior.

**Files:**
- Modify: `install/install.sh`
- Modify: `tests/bash/install_sh.bats`
- Validate: `tests/bash/install_sh.bats`

**Step 1: Establish expected behaviour**

- Add `--no-path` to the usage text and the argument parse loop; set `NO_PATH=1`. When set, skip `append_path_block` for `.bashrc`/`.zshrc`, still print the export line, and print `PATH not modified (--no-path); add manually: export PATH="..."`.
- Checksum flow stays: fetch manifest; 404 → warn and continue; other failure → abort. After a successful manifest fetch, attempt signature verification:
  - `cosign` absent → `warning: cosign not found; skipping wayforge-checksums.txt signature verification` and continue with SHA-256 verification.
  - `cosign` present → download `<url>.sig` and `<url>.pem`; a 404 on either → warn `signature assets unavailable for <tag>; skipping signature verification` (transitional release) and continue; any other fetch failure → abort. Run
    `cosign verify-blob --certificate <pem> --signature <sig> --certificate-identity-regexp '^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$' --certificate-oidc-issuer https://token.actions.githubusercontent.com <manifest>`;
    failure → abort with no prefix mutation.
- Dry-run prints `[dry-run] signature URL`, `would verify manifest signature (cosign)`, and the `--no-path` plan.
- Cleanup trap removes the new temp signature/cert files.

**Step 2: Add or update validation**

Extend `tests/bash/install_sh.bats`:
1. matching checksums + stub cosign that exits 0 → install succeeds and prints the verification line;
2. stub cosign that exits 1 → exit 1, stderr mentions signature, prefix untouched;
3. no cosign on PATH → exit 0 with the skip warning, checksum verification still runs;
4. signature assets 404 with a valid manifest → exit 0 with the skip warning (transitional);
5. `--no-path` → exit 0, no `# >>> wayforge >>>` block appended to the fixture `.bashrc`/`.zshrc`, export line still printed;
6. structural assertions that the script references `verify-blob`, the identity regexp, and `--no-path`;
7. existing checksum cases (match, mismatch, missing asset, missing entry) stay green.

**Step 3: Write minimal implementation**

Add `NO_PATH`, `TMP_SIG`, `TMP_CERT`, `verify_manifest_signature`, the parse-loop case, the fetch/verify block after the checksum download, the cleanup entries, the `--no-path` guards in `run_install`, and the dry-run lines. Keep POSIX `sh` (no arrays, no `local` outside functions).

**Step 4: Run test to verify pass**

Run (agent, if `bats` is installed):
`make check-bats`
Expected: every `install_sh.bats` case passes and `bashrc_snippet.bats` stays green. Fallback: `bash -n install/install.sh` plus a manual `--dry-run` and record the skip.
Human: real Linux/macOS install with cosign installed (valid signature) and with a tampered `.sig` (abort), plus one install on a host without cosign (warning path).

**Step 5: Commit**

`git add install/install.sh tests/bash/install_sh.bats`
`git commit -m "feat(install): verify signed manifest and add --no-path (Issue #240)"`

### Task 4: Replace the download-cradle quickstart, add EDR guidance, and reconcile docs/ADRs

**Objective:** The documented install path downloads to a file, verifies it, previews with `-DryRun`, and then runs it; an EDR/security page gives hashes, signature identity, and allow-list guidance; ADRs and the architecture record the new trust posture.

**Files:**
- Modify: `README.md` (lines 9-27)
- Modify: `RELEASE.md` (install commands ~118-170, asset contract ~276-285)
- Create: `docs/security/installer-trust.md`
- Modify: `docs/ai/architecture.md` (lines 30-36)
- Modify: `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md` (Decision 14: signing/verification/PATH)
- Modify: `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md` (Decision 1 + Consequences: signing status changed)
- Modify: `docs/ai/logs/2026-10.md` (closure entry; `memory_update` gate)
- Modify: `CHANGELOG.md` (`[Unreleased]` Added/Changed)
- Validate: `README.md`, `RELEASE.md`, `docs/security/installer-trust.md`

**Step 1: Establish expected behaviour**

- README quickstart becomes, Linux/macOS:
  `curl -fsSL -o install.sh <url>` → optional `cosign verify-blob ...` → `sh install.sh --dry-run` → `sh install.sh`.
  Windows:
  `Invoke-WebRequest -Uri <url> -OutFile install.ps1` → `Get-AuthenticodeSignature .\install.ps1` (Valid) → `.\install.ps1 -DryRun` → `.\install.ps1`.
  The `curl | sh` and `irm | iex` one-liners are removed from the recommended path (a short "why" note may mention them as the previous pattern the AMSI false positive targeted).
- Document `--no-path` / `-NoPath` and that default behavior still registers PATH.
- `docs/security/installer-trust.md` covers: what the installer downloads and writes; SHA-256 manifest + cosign verification; Authenticode publisher and thumbprint (placeholder marked for the real certificate); why per-release hashes change and why signer-based allow-listing is more durable; EDR allow-list guidance (publisher certificate, not just hash); the 2026-10-21 detection context (`Trojan:PowerShell/AmsiBypazz.E!MTB`, AMSI, `irm | iex` cradle) and why the new flow avoids it; how to report a false positive to Microsoft; how to obtain and independently verify a release's hashes. No secrets or token values.
- ADR-0035 gets Decision 14 (signing, verified installers, PATH opt-out, fallback) and an `Amended: 2026-10-28` line. ADR-0047 Decision 1 is amended: signing is now in scope for release assets, while the same-origin limitation remains for cosign identity (a repo-write attacker can alter the workflow). ADR-0048 owns the detailed signing decision.
- architecture.md installer/release bullet mentions Authenticode + cosign verification and `--no-path`.

**Step 2: Add or update validation**

- Agent greps: README/RELEASE no longer contain `irm ... | iex` or `curl ... | sh` as the primary command; they contain `-DryRun`/`--dry-run` and the download-to-file forms; `docs/security/installer-trust.md` exists and contains the detection name, `wayforge-checksums.txt`, `cosign`, `Authenticode`, and the allow-list section.
- Agent: `make check` (vitest, typecheck, lint, format, duplication) green.
- Human: read the EDR page for accuracy against the issued certificate and the actual release assets; confirm the README commands work verbatim on Windows and macOS.

**Step 3: Write minimal implementation**

Rewrite the README step 1 block and the RELEASE install section; add the security page; update the ADRs/architecture/log/CHANGELOG. Keep the docs concise and link to `docs/security/installer-trust.md` from README rather than duplicating the whole page.

**Step 4: Run test to verify pass**

Run: `make check`
Expected: all TypeScript/lint/format/duplication checks pass. Then run the documentation greps above and confirm every acceptance criterion in the mapping table has an owning task/validation.

**Step 5: Commit**

`git add README.md RELEASE.md docs/security/installer-trust.md docs/ai/architecture.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md docs/ai/logs/2026-10.md CHANGELOG.md`
`git commit -m "docs: document signed installers and EDR guidance (Issue #240)"`

## Acceptance criteria mapping (issue #240)

| Criterion | Owning task | Validation |
|---|---|---|
| Sign `wfg.exe` with Authenticode | 1 | workflow sign+verify step; human: `Get-AuthenticodeSignature` on a real release |
| Publish checksums + signature (cosign/GPG) each release | 1 | workflow publishes `.sig`/`.pem`; `cosign verify-blob` human/agent run |
| Verify hash/signature in `install.ps1` and `install.sh` before moving the binary | 2, 3 | Pester signature cases; bats cosign cases; SHA-256 cases already exist |
| Replace `irm ... | iex` guidance with download + verify + `-DryRun` | 4 | README/RELEASE grep + human run-through |
| PATH change opt-in or explicitly printed | 2, 3 | `-NoPath`/`--no-path` tests; existing success output retained |
| EDR documentation with hashes and allow-list | 4 | `docs/security/installer-trust.md` review |

## Validation ownership

| Validation | Owner |
|---|---|
| `actionlint`/YAML lint, `git diff --check` | agent |
| `bash -n install/install.sh`, `make check-bats` | agent |
| `Invoke-Pester` scoped to `install.Tests.ps1` | agent |
| `make check` (vitest, typecheck, lint, format, duplication) | agent |
| Documentation greps and link check | agent |
| Code-signing certificate procurement, secret/HSM setup, cert rotation runbook | human |
| Real release run producing signed assets | human |
| Windows install on a Defender/EDR-managed corporate host (including the original false-positive scenario) | human |
| macOS/Linux install with and without cosign | human |
| Microsoft false-positive report / allow-list confirmation | human |
| Verify signer identity and SmartScreen reputation after a signed release | human |

## Blocking decisions and required gates

1. **Branch base (resolved).** The current checkout is `develop` at `8589948` (only this plan file is untracked). Create `feature/issue-240-installer-signing-edr` from `develop`; #227 is already merged.
2. **Certificate source and custody (blocking, Task 1).** See the [Signing options](#appendix-signing-options-2026-10-28) appendix. In short: SignPath Foundation is the only genuinely free public-trust Authenticode route, but it requires every job in the signing chain to run on GitHub-hosted runners (the current workflow is self-hosted per ADR-0045) and publishes under the foundation's name. Certum Open Source (~€25-85/year) keeps the current runner via PKCS#11/SimplySign and publishes under an individual name. Azure Artifact Signing ($9.99/month) requires a Windows runner. Self-signed is free but not publicly trusted. The workflow shape depends on this choice.
3. **Pinned publisher identity (blocking, Task 2).** The installer must pin something. Recommended: SHA-1 thumbprint array of the leaf certificate(s) plus a documented rotation procedure; subject-only pinning is weaker. The real thumbprint is unavailable until the certificate is issued, so Task 2 either waits for it or lands with a clearly marked placeholder and a follow-up commit.
4. **Signature policy at install time (blocking).** Confirm the mixed policy in Decision 4: Windows fails closed once checksums exist, warning only for pre-checksum releases; POSIX cosign verification is skipped with a warning when cosign is absent. A stricter always-require-cosign policy would break installs for users without cosign.
5. **Checksum manifest signature tool (blocking, Task 1).** cosign keyless is recommended; GPG requires key distribution and is not present on Windows by default.
6. **PATH default (blocking, Tasks 2/3).** Confirm add-by-default + `--no-path`/`-NoPath`. Making the default non-mutating is a separate breaking change.
7. **Release cutover and secret availability (blocking for validation).** Task 1's code can land without the cert, but no maintainer release should ship unsigned Windows artifacts after the cutover. Decide whether the workflow hard-fails when the secret is absent (recommended) or warns until the certificate is provisioned.
8. **Gates.** `architect_review: true` — release trust boundary, installer contract, and a new ADR; run before Task 4 closure. `memory_update: true` — ADRs, architecture, log, and CHANGELOG. Also obtain user confirmation before implementation because the plan has 4 tasks and one unresolved purchasing decision.
9. **Follow-up (non-blocking).** `wfg upgrade` signature verification is out of scope; file a follow-up issue if the same trust guarantee is required on the upgrade path.

## Open questions for the approver

- Which signing option is chosen (see appendix), and who owns the application/purchase and identity verification?
- Is a cosign keyless signature acceptable, or is a GPG/minisign signature required by a downstream policy?
- Should the first signed release hard-fail when signing secrets are missing, or warn until the operational runbook is ready?

## Appendix: Signing options (2026-10-28)

Facts verified against vendor documentation and the repository state: public MIT repository (`Macacoders/wayforge`), current release jobs on `[self-hosted, linux, x64]` (ADR-0045), release artifacts are Bun cross-compiled PE files plus `install.ps1`.

### What "GitHub-hosted" means

"GitHub-hosted" is a CI runner type, not a signing service, certificate, or alternative signer. It is only a prerequisite for SignPath Foundation's free OSS certificate.

| | Current | GitHub-hosted |
|---|---|---|
| Where it runs | `runs-on: [self-hosted, linux, x64]` — a persistent machine the project controls | `runs-on: ubuntu-latest` — an ephemeral VM created and destroyed per job |
| Who maintains it | The project | GitHub |
| Cost | Machine and maintenance | Free for public repositories (this repository is public) |
| SignPath Foundation eligible | No | Yes |

The current workflow sets `runs-on: [self-hosted, linux, x64]` in both `build-binaries` and `release`. Moving to GitHub-hosted means changing those to `runs-on: ubuntu-latest`; the signing service is still SignPath Foundation. The change is required because SignPath's GitHub connector verifies that:

- the build was performed by a GitHub workflow, not by an entity holding an API token;
- the artifact was stored as a GitHub Actions workflow artifact before signing;
- **all jobs in the chain leading to the signing request ran on GitHub-hosted agents** for OSS projects.

A self-hosted job in that chain is therefore a hard technical blocker for the free Foundation certificate. The hosted runner is also not a substitute for a publisher signature: **GitHub does not issue Authenticode certificates**. GitHub artifact attestations/Sigstore are a separate, free provenance mechanism and do not replace Authenticode.

The flow would become:

```text
GitHub-hosted ubuntu-latest
  1. bun build --compile (six targets)
  2. actions/upload-artifact (unsigned)
  3. signpath/github-action-submit-signing-request
       -> SignPath signs in its HSM
  4. download the signed artifact
  5. generate wayforge-checksums.txt
  6. gh release upload
```

Signing happens inside SignPath, not on the runner. The runner only uploads the unsigned artifact and downloads the signed one.

Implications:

- **Cost:** EUR 0 for this public repository, because standard GitHub-hosted runners are free for public repos. A private repository would consume included minutes.
- **Publisher:** Windows still shows `SignPath Foundation`, not `Macacoders`; changing the runner does not change the publisher.
- **ADR-0045:** the self-hosted-runner decision must be amended because this changes the release trust boundary/topology.
- **Acceptance risk:** SignPath can reject the application on reputation grounds (the repository is young and has few stars); the hosted-runner change does not guarantee approval.

### Options

| Option | Cost | Publisher seen by Windows | Requirements | Current-runner fit | Main trade-off |
|---|---|---|---|---|---|
| **SignPath Foundation** | EUR 0 | `SignPath Foundation` (OV-level) | OSS (MIT qualifies), maintained/released project, code-signing policy page, per-release manual approval, MFA, **all signing-chain jobs on GitHub-hosted runners** | No: requires moving the release workflow to GitHub-hosted runners | Only genuinely free public-trust option; publisher is the foundation, application can be rejected on reputation grounds |
| **Certum Open Source** | ~EUR 25-85/year | `Open Source Developer <name>` | Identity verification; smart card + reader or SimplySign cloud HSM | Yes via PKCS#11/SimplySign + `osslsigncode` | Cheapest real CA certificate; publisher is an individual, annual reissue (max ~460 days) |
| **Azure Artifact Signing** | USD 9.99/month Basic (5,000 signatures) | Your validated identity/org | Azure subscription, identity validation, **Windows runner** | No: adds a Windows runner or job | Cheap and managed, but not free and changes the runner topology; individual enrollment is geographically limited |
| **Commercial OV/IV (SSL.com, etc.)** | ~USD 129-349/year | Individual or organization | Identity/organization validation; eSigner/PKCS#11 or token | Yes with cloud signing/PKCS#11 | Full control and publisher name, highest cost |
| **Self-signed internal certificate** | EUR 0 | Unknown publisher publicly; trusted only where the root is deployed | Distribute the trust anchor via GPO/Intune/EDR | Yes | Free and usable for an internal corporate fleet; no public trust, no SmartScreen/Defender benefit for external users |
| **cosign / GPG / minisign** | EUR 0 | n/a (not Authenticode) | None for publishing; verifier tooling | Yes | Supply-chain integrity only; Windows/Defender do not treat it as a publisher signature |

### Notes

- **SignPath Foundation** signs PE files and PowerShell scripts (`.ps1`), so it covers both `wfg.exe` and `install.ps1`. It requires a "Code signing policy" section on the project homepage, MFA, defined author/reviewer/approver roles, and a manual approval per release. Because the repository is public, standard GitHub-hosted runner minutes are free, so moving the release chain is cost-neutral but requires an ADR-0045 amendment.
- **Certum** is not free (older references to a free Certum OSS certificate are outdated). It preserves the current runner and is the lowest-friction paid option if the publisher being an individual is acceptable.
- **Azure Artifact Signing** is the cheapest managed option but is not free, needs a Windows runner, and its organization path generally expects an established legal entity; the individual path is limited by country.
- **Self-signed** is the only free option that keeps the current topology and can satisfy an internal EDR allow-list by certificate thumbprint, but it does not help external users and does not remove the "Unknown publisher" prompt outside the managed fleet.
- Signing is not a complete fix for the original AMSI detection: the trigger was the `irm | iex` download-cradle pattern. The download-to-file + `-DryRun` guidance and the PATH opt-out remain necessary regardless of the signing option.

### Recommendation

1. **If zero cost and accepting the runner move:** SignPath Foundation (GitHub-hosted `ubuntu-latest`, free for this public repo, publisher `SignPath Foundation`). Apply early because approval can take time and may be rejected.
2. **If keeping the self-hosted runner and paying the minimum:** Certum Open Source (~EUR 25-85/year, individual publisher).
3. **If only the internal corporate fleet matters:** self-signed certificate plus trust-anchor deployment through Intune/GPO/EDR (EUR 0, no public trust).
4. **Azure Artifact Signing** only if Azure is already available and a Windows runner is acceptable (~USD 120/year).
5. **Fallback:** apply to SignPath Foundation and use Certum if the application is rejected; the workflow changes for SignPath (hosted runner) are independent of the certificate vendor.
