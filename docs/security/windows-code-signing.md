# Windows code signing

## Status

Windows release artifacts (`wayforge-win32-x64.exe`, `wayforge-win32-arm64.exe`, and `install.ps1`) are currently **unsigned**. They carry no Authenticode signature.

SignPath Foundation denied the project's application for free OSS code signing on 2026-11-03 because the project did not yet show sufficient public visibility/reputation. The application was submitted on 2026-11-02. As a result, the SignPath application artifacts (`CODE_SIGNING_POLICY.md`, `.signpath/artifact-configuration.xml`) were removed and the signing plan was superseded.

## Alternatives evaluated

No free public-trust Authenticode option is viable for the current direct-download distribution (`install.ps1` + `wayforge-win32-*.exe` from GitHub Releases).

| Option | Cost | Verdict |
|---|---|---|
| Microsoft Store MSIX | Free | Free public trust, but Store-only: it requires MSIX packaging and Store certification and is not a drop-in for `install.ps1`/`wfg.exe`. Evaluated and rejected; it will not be used. |
| OSSign / Necessary Code Signing | Free | Require an established user base or public track record; not viable for this project yet. |
| Self-signed certificate | Free | Not public trust; unacceptable for public releases. |
| Certum Open Source | Paid | Exists but not adopted. |
| Azure Artifact Signing | Paid | Exists but not adopted. |

This is not a claim that no free option exists in absolute terms. Microsoft Store MSIX is free but was rejected because it changes the distribution channel and is not a drop-in for the current installer; none of the free options is viable for the current direct-download model.

## Verification

Integrity is currently verified with `wayforge-checksums.txt` (SHA-256), which covers every platform binary and both share archives. The one-shot installers and `wfg upgrade` verify the relevant hashes before changing anything; a mismatch aborts with no changes.

Because the binaries are unsigned, Windows SmartScreen may show an unknown-publisher warning on first run. Only run assets downloaded from the [official GitHub release](https://github.com/Macacoders/wayforge/releases) and verify the SHA-256 checksum against `wayforge-checksums.txt`.

## Revisit trigger

Revisit signing when the project's public visibility improves enough for a renewed SignPath Foundation application, or when a funded (paid) provider is approved.
