# Installer Trust Model

How the wayforge one-shot installers (`install.sh` / `install.ps1`) and the release channel are verified, what they download and write, and what to do when an EDR flags the installer. The recommended install path is **download to file → verify SHA-256 (and the cosign bundle signature when available) → dry-run → run**. Do not pipe the installer directly into a shell.

## What the installer downloads and writes

On a real install (not `--dry-run` / `-DryRun`), the installer downloads into OS temp files:

- `wayforge-<os>-<arch>[.exe]` — the platform binary (installed as `<prefix>/bin/wfg` / `wfg.exe`)
- `wayforge-share-<version>.tar.gz` / `.zip` — the share archive (extracted to `<prefix>/share/wayforge/base/**` + `VERSION`)
- `wayforge-checksums.txt` — the SHA-256 manifest for the release
- `wayforge-checksums.txt.sigstore.json` — the detached cosign signature bundle (fetched by `install.sh` only when cosign is present)

It writes only inside the dedicated prefix (`~/.wayforge` on Linux/macOS, `%LOCALAPPDATA%\wayforge` on Windows: `bin/`, `share/wayforge/`, optionally `node/`) plus the PATH registration (`~/.bashrc` / `~/.zshrc` marker block, or the Windows User PATH). No administrator privileges are required. `--no-modify-path` / `-NoModifyPath` skips the PATH writes and prints manual instructions instead. A dry run downloads nothing and writes nothing.

## SHA-256 verification

The release publishes `wayforge-checksums.txt` in `sha256sum` format covering every platform binary, both share archives, and both installer scripts. Verify the installer itself before running it.

**Linux / macOS:**

```bash
curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/install.sh
curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt
grep '  install.sh$' wayforge-checksums.txt | sha256sum -c -
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 -OutFile install.ps1
Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt -OutFile wayforge-checksums.txt
$expected = (Select-String -Path wayforge-checksums.txt -Pattern '  install\.ps1$').Line.Split()[0]
if ((Get-FileHash install.ps1 -Algorithm SHA256).Hash -ne $expected.ToUpper()) { throw 'install.ps1 checksum mismatch' }
```

The installers then verify the binary and share archive hashes against the same manifest before any prefix mutation; a mismatch or missing entry aborts with the prefix untouched. Only a confirmed-missing checksum asset (HTTP 404, releases predating it) warns and installs unverified; any other download failure aborts.

## Cosign keyless bundle verification

The checksum manifest is signed with cosign (v3.1.4, keyless: Fulcio certificate + Rekor transparency log) into a detached bundle, `wayforge-checksums.txt.sigstore.json`, uploaded alongside the manifest. The signing identity is pinned to the GitHub Actions workflow that produced the release:

- Identity: `^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$`
- OIDC issuer: `https://token.actions.githubusercontent.com`

Verify the manifest against the bundle:

**Linux / macOS:**

```bash
curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt.sigstore.json
cosign verify-blob wayforge-checksums.txt \
  --bundle wayforge-checksums.txt.sigstore.json \
  --certificate-identity-regexp '^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt.sigstore.json -OutFile wayforge-checksums.txt.sigstore.json
cosign verify-blob wayforge-checksums.txt --bundle wayforge-checksums.txt.sigstore.json `
  --certificate-identity-regexp '^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$' `
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Verification policy:

- `install.sh` performs this verification automatically when cosign is on PATH: a present-but-invalid bundle or a non-404 bundle fetch failure aborts the install with no changes; cosign absent or a confirmed-missing bundle (404) warns and continues with hash-only verification.
- `install.ps1` does not require cosign; run the manual `cosign verify-blob --bundle` command above if you want signature verification on Windows.
- `wfg upgrade` currently verifies hashes only; bundle verification there is a recorded follow-up gap (ADR-0048).

## Authenticode status

The `wfg` binary is **not Authenticode-signed**. Windows reports `Get-AuthenticodeSignature` status `NotSigned`. Authenticode signing remains conditional on adopting SignPath (issue #240); until then, the cosign bundle over the checksum manifest plus SHA-256 verification is the integrity guarantee. Do not treat the binary as signed.

## EDR allow-list guidance

If your EDR blocks the installer or the binary, allow-list narrowly — never the whole shell:

- Allow the installed binary path prefix `<prefix>\bin\wfg.exe` (or `<prefix>/bin/wfg`), not `pwsh.exe` / `powershell.exe` broadly.
- Allow the installer script by its SHA-256 hash from `wayforge-checksums.txt` (the `install.ps1` / `install.sh` entry), not by URL or wildcard.
- Avoid blanket PowerShell allow-listing; the recommended flow already avoids piping remote content into a shell, so a narrow allow-list is sufficient.

## 2026-10-21 AMSI detection context

On 2026-10-21, Microsoft Defender flagged `Trojan:PowerShell/AmsiBypazz.E!MTB` (threat ID 2147948519) on a developer host during a wayforge install. Detection source was AMSI, process `pwsh.exe`; the raw evidence is retained in `docs/ai/plans/2026-10-21-wayforge-install-alarm.raw.log`. The install used the then-recommended `irm ... | iex` cradle, which pipes the downloaded script straight into `Invoke-Expression`, so AMSI scanned the remote script content executing in memory and the detection was attributed to the PowerShell host. Static analysis found no AMSI-bypass constructs in the installer and a Defender scan of the repo script found no threats; the detection is assessed as a false positive triggered by the cradle pattern. The recommended flow — download to file, verify the hash, dry-run, then run the file — avoids piping remote content to `Invoke-Expression` and removes that in-memory scan surface.

## Reporting a false positive

If an EDR still flags the installer or binary:

1. Submit the file to Microsoft for analysis: <https://www.microsoft.com/wdsi/filesubmission> (include the SHA-256 from `wayforge-checksums.txt`).
2. Open a GitHub issue at <https://github.com/Macacoders/wayforge/issues> with the detection name (for example `Trojan:PowerShell/AmsiBypazz.E!MTB`), the file hash, the EDR product/version, and the install command used.

## Transparency

The signed manifest is recorded in the public Rekor transparency log; checksums are not secret. Anyone can independently verify a release's manifest against its bundle with the commands above.
