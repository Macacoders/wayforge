# ADR-0048: Cosign Keyless Signing of the Release Checksum Manifest

Date: 2026-10-30
Status: Accepted
**Amended**: 2026-11-03 — signed-era fail-closed verification with a version cutoff and explicit opt-out; Windows verifies automatically (Decision 6).

## Context

Issue #271 hardened the installer trust model after the 2026-10-21 AMSI detection incident. ADR-0047's original Decision 1 declared asset signing out of scope: `wayforge-checksums.txt` was fetched from the same origin as the assets it describes, defending against transit corruption but not against a compromised release channel. The one-shot installers (ADR-0035 Decision 13) verify SHA-256 hashes before any prefix mutation, but the manifest itself was unsigned, so a channel attacker could rewrite assets and manifest together.

Cosign v3 (pinned at v3.1.4) supports the Sigstore bundle format: signing produces a single `.sigstore.json` file containing the certificate, signature, and Rekor transparency-log entry. The legacy detached `.sig` / `.pem` artifact pair is a cosign v2 pattern whose flags were removed in v3; it is not used here.

## Decision

1. **Trust anchor.** The release trust anchor is the GitHub Actions workflow identity `release.yml@refs/heads/main` — the OIDC identity minted by the `release` job of `.github/workflows/release.yml` when it runs on `refs/heads/main` — via cosign keyless signing (Fulcio issues the short-lived certificate; Rekor records the transparency-log entry).

2. **Materialization.** The `release` job signs `wayforge-checksums.txt` with `cosign sign-blob --yes --bundle wayforge-checksums.txt.sigstore.json wayforge-checksums.txt` and uploads the bundle as a release asset. The bundle is detached: it is a separate asset, not an entry inside the manifest. The manifest covers every platform binary, both share archives, and both installer scripts.

3. **Verification policy matrix.** (Amended 2026-11-03: the matrix is now split by release era — see Decision 6 for the cutoff and opt-out.)

   Releases are classified by comparing the target tag against the installer's internal cutoff constant (`COSIGN_REQUIRED_FROM` / `$CosignRequiredFrom`; Decision 6). Releases at or above the cutoff are **signed-era**; earlier releases are **legacy**.

   | State | Signed-era policy | Legacy policy |
   |---|---|---|
   | Bundle present and `cosign verify-blob --bundle` valid with the pinned identity/issuer | Proceed | Proceed |
   | Bundle present but verification fails | Abort with no changes | Abort with no changes |
   | Bundle fetch fails (non-404: 403, 5xx, timeout, TLS) | Abort with no changes | Abort with no changes |
   | Bundle confirmed missing (HTTP 404) | Abort unless `--allow-unsigned` / `-AllowUnsigned` | Warn and continue (hash-only) |
   | Checksum manifest confirmed missing (HTTP 404) | Abort unless `--allow-unsigned` / `-AllowUnsigned` | Warn and continue (hash-only) |
   | cosign not installed | Abort unless `--allow-unsigned` / `-AllowUnsigned` | Warn and continue (hash-only) |

   `--allow-unsigned` never bypasses a bad signature or a non-404 fetch failure; it only covers absent verification material (cosign not installed, bundle 404, manifest 404). Both `install.sh` and `install.ps1` implement this matrix automatically when cosign is on PATH; Windows is not manual-only. `wfg upgrade` remains hash-only in this task; adding bundle verification there is an explicit follow-up gap.

4. **Identity/issuer pin maintenance.** The pinned identity is exact, not a regexp: `https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main`, with issuer `https://token.actions.githubusercontent.com`. An exact match keeps dots in `github.com` and `.github` from acting as wildcards. The pin must change in the same commit as any change to the workflow trigger or path. A pin that lags the trigger breaks verification for every release signed after the change.

5. **Verification command.** `cosign verify-blob wayforge-checksums.txt --bundle wayforge-checksums.txt.sigstore.json --certificate-identity 'https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main' --certificate-oidc-issuer https://token.actions.githubusercontent.com` (see `docs/security/installer-trust.md` for the exact POSIX and Windows commands).

6. **Signed-era cutoff and opt-out** (2026-11-03): both installers carry an internal cutoff constant (`COSIGN_REQUIRED_FROM` in `install.sh`, `$CosignRequiredFrom` in `install.ps1`) and classify the target release by comparing the tag against it. Releases at or above the cutoff are signed-era and fail closed: cosign plus a valid bundle is mandatory, and a missing cosign, a confirmed-missing bundle (HTTP 404), or a confirmed-missing checksum manifest (HTTP 404) aborts before any prefix mutation unless the operator passes `--allow-unsigned` / `-AllowUnsigned` (or sets `WAYFORGE_ALLOW_UNSIGNED=1`). Releases below the cutoff keep the legacy warn-and-continue hash-only fallback. `--allow-unsigned` never bypasses an invalid signature or a non-404 failure; it only covers absent verification material. `install.ps1` downloads the bundle and runs `cosign verify-blob` when cosign is present, so Windows verification is automatic, not manual-only; the manual command remains documented for users without cosign. The cutoff value is an internal constant; the release version that first carries a signed manifest is declared at merge time, not in this record.

## Consequences

- A Sigstore outage (Fulcio/Rekor/TUF unreachable) blocks releases: signing is fail-closed, so a release cannot ship an unsigned manifest silently.
- The `release` job needs `id-token: write`, which lets code executing in the persistent self-hosted runner mint the `release.yml@refs/heads/main` OIDC identity. This is acceptable only while ADR-0045 Decision 3's `push: main`-only trigger holds; relaxing the trigger requires re-reviewing that boundary.
- The signed manifest is recorded in the public Rekor transparency log; checksums are not secret.
- Both installers self-verify the bundle automatically when cosign is on PATH (POSIX and Windows), closing the "manifest unsigned" gap in the one-shot path. Cosign becomes a prerequisite for signed-era installs: without it, the install aborts unless `--allow-unsigned` is passed.
- Legacy-tag downgrade residual risk: the cutoff is a version comparison, not a proof that a given release was signed. A release published with a tag below the cutoff and no bundle takes the legacy hash-only path even if it was intended to be signed-era.
- Self-hosted-runner compatibility of `sigstore/cosign-installer@v4.1.0` must be verified in the Task 5 release rehearsal; the fallback is a direct pinned `cosign-linux-amd64` v3.1.4 download with SHA-256 verification.
- `wfg upgrade` remains hash-only until a follow-up; the upgrade path's trust anchor is unchanged (ADR-0047 Decision 1's same-origin discussion still applies to it).

## Alternatives considered

- **Cosign v2 detached `.sig` / `.pem` artifacts** — Rejected: legacy format; cosign v3 removed the flags that produced it, and the bundle format carries the certificate and transparency entry in one file.
- **Amendments only, no new ADR** — Rejected by the Task 1 architect review: the trust anchor itself changes (same-origin file → workflow identity), which is a new decision record, not an amendment.
- **Superseding ADR-0047** — Rejected: only its Decision 1 scope sentence changes; the update/upgrade design, verification-before-mutation, and replacement strategy are untouched. ADR-0047 is amended instead.

## Related

- ADR-0035 (One-Shot CLI Installer) — Decision 13 amended; Decisions 14-15 added: bundle verification and `--no-modify-path`.
- ADR-0045 (Self-Hosted Release Runner) — `id-token: write` / OIDC-minting consequence and Sigstore egress.
- ADR-0047 (CLI Release Check and Verified Upgrade) — Decision 1 amended: signing no longer out of scope; `wfg upgrade` hash-only gap.
- Plan: `docs/ai/plans/2026-10-30_152432-issue-271-installer-trust-cosign.md`
