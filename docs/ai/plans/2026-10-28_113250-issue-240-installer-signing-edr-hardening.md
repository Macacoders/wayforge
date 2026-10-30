---
status: planned
created: 2026-10-28
task: 0/4
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #240: Authenticode signing via SignPath Foundation

**Goal:** Windows release artifacts (`wayforge-win32-x64.exe`, `wayforge-win32-arm64.exe`, and `install.ps1`) are Authenticode-signed through SignPath Foundation, the release workflow publishes signed bytes, and `install.ps1` verifies the pinned publisher before mutating the prefix.

**Architecture:** SignPath Foundation signs in its HSM. The release workflow builds on GitHub-hosted runners (prerequisite #270), uploads a ZIP containing the two Windows PE files and `install.ps1`, submits it to SignPath, downloads the signed ZIP, and only then generates checksums. `install.ps1` verifies the embedded Authenticode signature with `Get-AuthenticodeSignature`. The hardened bootstrap, `-DryRun`, `-NoPath`, and cosign keyless signing/verification are owned by #271.

**Tech Stack:** GitHub Actions, SignPath Foundation/SignPath.io GitHub action, Authenticode, Bun Windows metadata flags, PowerShell 5.1+, Pester, Markdown/ADRs.

**Scope classification:** `multi-task`

**Task budget rationale:** Four sequential deliverables with different validation loops: (1) external SignPath onboarding and policy, (2) release workflow signing, (3) Windows installer verification, (4) docs/ADRs/cutover. Tasks 2-4 are gated on approval and on #270. Splitting keeps the external approval decision reviewable before code changes.

## Scope split (2026-10-30)

- **#270** owns moving the release workflow to GitHub-hosted runners. Required for SignPath OSS eligibility; not re-planned here.
- **#271** owns install-path hardening (`irm | iex` removal, file download, `-DryRun`, `-NoPath`) and cosign keyless signing/verification of `wayforge-checksums.txt`. Not re-planned here.
- **#243** already delivered SHA-256 verification. Not re-planned here.
- **#240 (this plan)** owns only Authenticode via SignPath: application, signing job, `install.ps1` verification, signing docs/ADRs/cutover.
- If SignPath is rejected, this plan remains blocked; there is no free public-trust Authenticode fallback currently available. Do not substitute self-signed for public releases.

## Decision

**Chosen:** SignPath Foundation, free for OSS. Certificate issued to SignPath Foundation (OV), HSM-held key, manual approval per release, publisher shown by Windows as `SignPath Foundation`.

**Rejected:**

- Certum, Azure Artifact Signing, commercial OV/EV: paid (user decision).
- Microsoft Store MSIX: different distribution model.
- Self-signed: no public trust; internal fleet only.
- OSSign: free but applications suspended.

**No PFX and no `osslsigncode` in this plan.** SignPath signs server-side; there is no private key in GitHub secrets. The earlier self-hosted `osslsigncode` design is superseded.

## Repository state (2026-10-30)

- Current branch: `feature/issue-240-installer-signing-edr`.
- #270 tracks the GitHub-hosted runner migration and is a prerequisite for Task 2.
- #271 tracks install hardening and cosign; it is parallel work and owns the base `docs/security/installer-trust.md`.
- #243 checksum verification is already merged in `develop`.
- This plan supersedes the previous four-task scope that mixed signing, installer hardening, cosign, and docs.

## Prerequisites

1. #270 complete: both release jobs on `ubuntu-latest`; SignPath requires all jobs in the chain on GitHub-hosted.
2. SignPath Foundation approval, SignPath project, signing policy, and artifact configuration.
3. #271 merged or coordinated: it creates `docs/security/installer-trust.md`, includes installer scripts in checksums, and signs the manifest with cosign. This plan extends that page with Authenticode and does not duplicate the base content.
4. Repository secret `SIGNPATH_API_TOKEN`; never echo it.
5. A human owner for the SignPath application, approval, and first signed release.

## Out of scope

- GitHub-hosted migration (#270).
- Install hardening, `-NoPath`, download-to-file, and cosign manifest signing/verification (#271).
- SHA-256 verification (#243, already delivered).
- Paid signing options and Microsoft Store distribution.
- macOS signing/notarization.
- `wfg upgrade` signature verification; keep checksum-only until a separate follow-up.
- Signing share archives or `install.sh`.

## Tasks

### Task 1: Apply to SignPath Foundation and define the signing contract

**Objective:** The project is accepted into SignPath Foundation and the code signing policy, roles, artifact configuration, and publisher identity are defined.

**Files:**
- Create: `CODE_SIGNING_POLICY.md`
- Create: `.signpath/artifact-configuration.xml`
- Modify: `README.md` (link to the policy)
- Validate: `CODE_SIGNING_POLICY.md`, `.signpath/artifact-configuration.xml`

**Step 1: Establish expected behaviour**

- The policy page contains the required notice: "Free code signing provided by SignPath.io, certificate by SignPath Foundation".
- It names Author/Reviewer/Approver roles and members; a single maintainer may hold all roles, but it must be documented.
- It includes a privacy statement: wayforge does not send telemetry; SignPath processes only release artifacts and repository metadata.
- The artifact configuration signs the two Windows PE files and `install.ps1` inside one ZIP.
- Publisher identity is SignPath Foundation; PE metadata product name is `wayforge` and product version matches `VERSION`.

**Step 2: Add or update validation**

- Human: submit the application with repository URL, download page (GitHub Releases/README), description, and policy link; record the application URL/date and outcome.
- Agent: grep the policy for the required phrase, roles, and privacy statement; validate the XML with `xmllint` if available (record a skip otherwise).

**Step 3: Write minimal implementation**

- Add `CODE_SIGNING_POLICY.md` with notice, scope, roles, release controls, verification, and privacy.
- Link it from README and release notes.
- Add `.signpath/artifact-configuration.xml`:
  - `<zip-file>` containing `<pe-file path="wayforge-win32-x64.exe">`, `<pe-file path="wayforge-win32-arm64.exe">`, and `<powershell-file path="install.ps1">`, each with `<authenticode-sign/>`.
  - Metadata restrictions for product name `wayforge` and the release version.
- Keep the SignPath-hosted copy identical to the repo copy.

**Step 4: Run test to verify pass**

- Agent: `grep` checks; `xmllint --noout .signpath/artifact-configuration.xml` if installed.
- Human: SignPath approval received; record the approval date and signing policy slug.

**Step 5: Commit**

`git add CODE_SIGNING_POLICY.md .signpath/artifact-configuration.xml README.md`
`git commit -m "docs(signing): add SignPath Foundation policy and artifact config (Issue #240)"`

### Task 2: Sign Windows binaries and `install.ps1` in the release workflow

**Objective:** Every release after cutover publishes Authenticode-signed `wayforge-win32-x64.exe`, `wayforge-win32-arm64.exe`, and `install.ps1`, with checksums generated from the signed bytes.

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `RELEASE.md` (signing prerequisites and assets)
- Validate: `.github/workflows/release.yml`

**Step 1: Establish expected behaviour**

- #270 is complete; both jobs run on `ubuntu-latest`.
- Build adds Bun Windows metadata:
  `--windows-title=wayforge`, `--windows-publisher=Macacoders`, `--windows-version=<VERSION>.0`, `--windows-description=...`, `--windows-copyright=...`.
- A `sign-windows` job downloads the two win32 artifacts and `install/install.ps1`, creates a ZIP, uploads it with `actions/upload-artifact`, submits `signpath/github-action-submit-signing-request`, waits for approval/completion, downloads the signed ZIP, and replaces the unsigned files.
- Checksums are generated after signing and include the signed PE files and signed `install.ps1`.
- The release uploads the signed `install.ps1`, not the repo file.
- No cosign step here; #271 owns it. Keep the ordering point where #271 can sign the final manifest.
- Missing `SIGNPATH_API_TOKEN` or a failed signature is a hard failure.
- Manual approval is documented; the action timeout is raised or the request is split so approval does not hit the 600s default.

**Step 2: Add or update validation**

- Agent: `actionlint .github/workflows/release.yml` (or record skip); `git diff --check`; grep that the signing step precedes checksum generation and that the upload list contains the signed installer.
- Human: run a throwaway release; verify `Get-AuthenticodeSignature` on both `.exe` files and `install.ps1` on Windows; confirm `osslsigncode verify` on Linux; confirm checksums match the signed bytes.

**Step 3: Write minimal implementation**

- Add the `sign-windows` job after `build-binaries`, before `release`.
- Add artifact configuration/signing policy slugs and `SIGNPATH_API_TOKEN`.
- Add metadata flags to the Bun build.
- Replace artifact outputs with signed files.
- Update release upload paths.
- Update `RELEASE.md` prerequisites and assets.

**Step 4: Run test to verify pass**

- Run: `actionlint .github/workflows/release.yml`, `git diff --check`.
- Expected: workflow parses; signing precedes checksums; release assets include signed files.
- Human: throwaway release verification as above.

**Step 5: Commit**

`git add .github/workflows/release.yml RELEASE.md`
`git commit -m "feat(release): sign Windows artifacts with SignPath (Issue #240)"`

### Task 3: Verify Authenticode in `install.ps1` for signed releases

**Objective:** `install.ps1` refuses a Windows binary whose Authenticode signature is missing or untrusted, without breaking releases that predate the signing cutover.

**Files:**
- Modify: `install/install.ps1`
- Modify: `tests/powershell/install.Tests.ps1`
- Validate: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

- Add `Assert-Signature`; require `(Get-AuthenticodeSignature $tmpBinary)` with `Status -eq 'Valid'`, a non-empty `SignerCertificate`, and a pinned publisher identity.
- Pin the SignPath Foundation subject plus a thumbprint array; document rotation. Because the certificate is shared, project identity also relies on the release workflow and checksum manifest.
- **Cutover gate:** do not merge this task before Task 2 has produced at least one signed release. After cutover every new release is signed, so the check can fail closed. Do not add a permanent "unsigned release" marker; an unsigned hotfix would be an explicit exception.
- PS 5.1 compatibility: no ternary/`??`.
- Dry-run prints `would verify Authenticode signature: <asset>`.
- Add `-SkipSignatureCheck` (documented as unsafe, tests only) for fixture installs; do not accept it via environment variables.
- `-NoPath` and the cosign manifest check are owned by #271; do not duplicate them.

**Step 2: Add or update validation**

- Pester: structural assertions (`Get-AuthenticodeSignature`, pinned subject/thumbprints, `-SkipSignatureCheck`); unsigned fixture with checksums → non-zero exit and prefix untouched; `-SkipSignatureCheck` fixture → exit 0; signed fixture → exit 0; existing checksum cases stay green.
- Save/restore User PATH in every case.

**Step 3: Write minimal implementation**

- Add `Assert-Signature`, pinned identity constants, the call before `Move-Item`, the dry-run line, and the test seam.
- Keep checksum verification before mutation.

**Step 4: Run test to verify pass**

- Run: `pwsh -NoProfile -Command "Invoke-Pester -Path ./tests/powershell/install.Tests.ps1 -PassThru | Select-Object FailedCount"` (or record a skip if Pester is absent).
- Human: signed-release install succeeds; tampered binary aborts with the prefix untouched.

**Step 5: Commit**

`git add install/install.ps1 tests/powershell/install.Tests.ps1`
`git commit -m "feat(install): verify Authenticode on signed releases (Issue #240)"`

### Task 4: Document the signing trust boundary, ADRs, and first signed release

**Objective:** ADRs, architecture, security docs, release notes, and the first signed release record the SignPath trust boundary, publisher identity, rotation, and SmartScreen expectations.

**Files:**
- Create: `docs/ai/decisions/ADR-0048-release-artifact-signing.md`
- Modify: `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md`
- Modify: `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md`
- Modify: `docs/ai/architecture.md`
- Modify: `docs/security/installer-trust.md` (extend #271; do not duplicate)
- Modify: `README.md`, `RELEASE.md`
- Modify: `docs/ai/logs/2026-10.md`, `CHANGELOG.md`
- Validate: documentation greps

**Step 1: Establish expected behaviour**

- ADR-0048 records: SignPath Foundation, OV publisher, HSM custody, no PFX, GitHub-hosted requirement (#270), ordering (sign before checksums), manual approval, pinning/rotation, and same-origin limitations.
- ADR-0035 is amended with the Authenticode verification policy and cutover.
- ADR-0047 is amended: signing is now in scope for release assets; the same-origin limitation remains.
- `docs/security/installer-trust.md` adds the Authenticode publisher, verification commands, SmartScreen reputation, rotation, and EDR allow-list by signer. It links to #271's cosign/hash content.
- README/RELEASE show `Get-AuthenticodeSignature` verification for `install.ps1` and `wfg.exe`, plus a link to the code signing policy.
- CHANGELOG and the log record the first signed release.

**Step 2: Add or update validation**

- Agent greps: ADR-0048 exists; README/RELEASE contain `Get-AuthenticodeSignature`; docs contain `SignPath Foundation`, `Authenticode`, `rotation`, and `SmartScreen`; no `irm ... | iex` reintroduced.
- Agent: `make check`.
- Human: read docs against the real certificate; confirm publisher name/thumbprint; run the first signed release and verify SmartScreen behavior.

**Step 3: Write minimal implementation**

- Add/amend the ADRs, architecture, security docs, README/RELEASE, log, and CHANGELOG.

**Step 4: Run test to verify pass**

- Run: `make check`; documentation greps.
- Expected: green; all signing-specific acceptance criteria mapped.

**Step 5: Commit**

`git add CODE_SIGNING_POLICY.md docs/ai/decisions/ADR-0048-release-artifact-signing.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md docs/ai/architecture.md docs/security/installer-trust.md README.md RELEASE.md docs/ai/logs/2026-10.md CHANGELOG.md`
`git commit -m "docs: record SignPath Authenticode trust boundary (Issue #240)"`

## Acceptance criteria mapping (remaining #240)

| Criterion | Owning task | Validation |
|---|---|---|
| Sign `wfg.exe` with Authenticode | 2 | workflow signing + human `Get-AuthenticodeSignature` |
| Publish Authenticode-signed Windows assets and installer | 2 | release assets; checksums over signed bytes |
| Verify Authenticode in `install.ps1` before moving the binary | 3 | Pester signed/unsigned cases |
| Document publisher, rotation, SmartScreen, EDR allow-list | 4 | documentation review |
| Publish checksums + cosign signature | #271 | not this plan |
| Replace `irm | iex` and add `-DryRun`/`-NoPath` | #271 | not this plan |
| Verify SHA-256 | #243 | already delivered |

## Validation ownership

| Validation | Owner |
|---|---|
| Policy/XML greps, actionlint, Pester, `make check` | agent |
| SignPath application/approval, project/artifact config, API token | human |
| First signed release, Windows signature/SmartScreen checks | human |
| Certificate rotation runbook | human |
| Documentation accuracy against the real certificate | human |

## Blocking decisions and gates

1. **SignPath approval (blocking, external).** If rejected, #240 is blocked; there is no free public-trust fallback. Do not substitute self-signed for public releases.
2. **Publisher identity pinning (blocking, Task 3).** Pin the SignPath Foundation subject plus a thumbprint array; document rotation. The certificate is shared, so project identity relies on the release workflow and checksum manifest.
3. **Cutover gate (blocking, Task 3).** Do not merge Authenticode enforcement before the first signed release.
4. **Manual approval (blocking, Task 2).** SignPath requires per-release approval; confirm the release process and action timeout.
5. **Gates.** `architect_review: true` for the release trust boundary and new ADR. `memory_update: true` for ADRs, architecture, log, and CHANGELOG.
6. **Dependencies.** #270 must be complete before Task 2. #271 must be merged or coordinated before Task 4 docs and before Task 2 final checksum ordering.

## Open questions

- Will SignPath Foundation approve this project? If not, do we close #240 as blocked or keep it open for reapplication?
- Who owns the SignPath application/approval and the first signed release?
- Do we accept SignPath Foundation as the public publisher name?
- What is the first signed version/tag, and when do we cut over?
- Do we keep #240 open after the first signed release for SmartScreen/allow-list follow-up?
