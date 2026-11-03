# Installer Trust Model

How the wayforge one-shot installers (`install.sh` / `install.ps1`) and the release channel are verified, what they download and write, and what to do when an EDR flags the installer. The recommended install path is **download to file → verify the manifest signature (mandatory for releases published with a signed manifest) before trusting the manifest → verify SHA-256 → run**. Do not pipe the installer directly into a shell.

## What the installer downloads and writes

On a real install (not `--dry-run` / `-DryRun`), the installer downloads into OS temp files:

- `wayforge-<os>-<arch>[.exe]` — the platform binary (installed as `<prefix>/bin/wfg` / `wfg.exe`)
- `wayforge-share-<version>.tar.gz` / `.zip` — the share archive (extracted to `<prefix>/share/wayforge/base/**` + `VERSION`)
- `wayforge-checksums.txt` — the SHA-256 manifest for the release
- `wayforge-checksums.txt.sigstore.json` — the detached cosign signature bundle (fetched by the installers only when cosign is present)

It writes only inside the dedicated prefix (`~/.wayforge` on Linux/macOS, `%LOCALAPPDATA%\wayforge` on Windows: `bin/`, `share/wayforge/`, optionally `node/`) plus the PATH registration (`~/.bashrc` / `~/.zshrc` marker block, or the Windows User PATH). No administrator privileges are required. `--no-modify-path` / `-NoModifyPath` skips the PATH writes and prints manual instructions instead. A dry run downloads nothing and writes nothing.

## SHA-256 verification

The release publishes `wayforge-checksums.txt` in `sha256sum` format covering every platform binary, both share archives, and both installer scripts. Verify the installer itself before running it.

**Linux:**

```bash
B=https://github.com/Macacoders/wayforge/releases/latest/download; curl -fsSL -O "$B/install.sh" -O "$B/wayforge-checksums.txt"
grep '  install.sh$' wayforge-checksums.txt | sha256sum -c -
```

**macOS:**

```bash
B=https://github.com/Macacoders/wayforge/releases/latest/download; curl -fsSL -O "$B/install.sh" -O "$B/wayforge-checksums.txt"
grep '  install.sh$' wayforge-checksums.txt | shasum -a 256 -c -
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 -OutFile install.ps1 -UseBasicParsing
Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt -OutFile wayforge-checksums.txt -UseBasicParsing
$expected = (Select-String -Path wayforge-checksums.txt -Pattern '  install\.ps1$').Line.Split()[0]
if ((Get-FileHash install.ps1 -Algorithm SHA256).Hash -ne $expected.ToUpper()) { throw 'install.ps1 checksum mismatch' }
```

The installers then verify the binary and share archive hashes against the same manifest before any prefix mutation; a mismatch or missing entry aborts with the prefix untouched. Only a confirmed-missing checksum asset (HTTP 404, releases predating it) warns and installs unverified; any other download failure aborts.

## Cosign keyless bundle verification

The checksum manifest is signed with cosign (v3.1.4, keyless: Fulcio certificate + Rekor transparency log) into a detached bundle, `wayforge-checksums.txt.sigstore.json`, uploaded alongside the manifest. The signing identity is pinned to the GitHub Actions workflow that produced the release:

- Identity (exact): `https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main`
- OIDC issuer: `https://token.actions.githubusercontent.com`

Cosign v3 or newer is required for `--bundle`, and verification needs network access to Rekor and the Sigstore TUF root (Fulcio is only involved at signing time).

Verify the manifest against the bundle:

**Linux / macOS:**

```bash
curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt.sigstore.json
cosign verify-blob wayforge-checksums.txt \
  --bundle wayforge-checksums.txt.sigstore.json \
  --certificate-identity 'https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt.sigstore.json -OutFile wayforge-checksums.txt.sigstore.json
cosign verify-blob wayforge-checksums.txt --bundle wayforge-checksums.txt.sigstore.json `
  --certificate-identity 'https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main' `
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Verification policy:

- Releases published with a signed manifest are verified fail-closed: cosign plus a valid bundle is mandatory. When cosign is absent, the bundle is confirmed missing (404), or the manifest itself is confirmed missing (404), the install aborts unless `--allow-unsigned` / `-AllowUnsigned` is passed. An invalid signature or any other bundle download or verification failure always aborts — `--allow-unsigned` never bypasses a bad signature; it only covers absent verification material.
- Legacy releases that predate the signed manifest keep the warn-and-continue behavior: a confirmed-missing checksum asset (HTTP 404) warns and installs unverified.
- Both `install.sh` and `install.ps1` perform this verification automatically when cosign is on PATH; Windows is not manual-only. The manual `cosign verify-blob --bundle` command above stays documented for users without cosign.
- `wfg upgrade` currently verifies hashes only; bundle verification there is a recorded follow-up gap (ADR-0048).

### Node.js `SHASUMS256.txt` verification

When Node.js must be provisioned, the installer downloads the pinned Node.js archive together with the official Node.js `SHASUMS256.txt` from the same Node.js release and verifies the archive hash against it before extraction; a mismatch aborts with no changes. This relies on same-origin HTTPS plus the official `SHASUMS256.txt`; it is not covered by the cosign bundle.

## What signing proves (and does not prove)

A valid bundle proves that `wayforge-checksums.txt` was produced by the pinned release workflow and that the signature is recorded in the public Rekor transparency log. It does **not** prove that the binaries are safe, vulnerability-free, or reproducible, and it is not build provenance (SLSA/in-toto attestation). Treat signature verification as provenance plus integrity, not as a malware scan.

Explicit non-goals:

- No Authenticode enforcement yet; Windows binaries are unsigned until SignPath (#240).
- `wfg upgrade` remains hash-only and prints a warning pointing at this document.
- Bootstrap residual risk: the installer script itself is hash-checked against the same-origin manifest, not signature-verified directly. Verifying the bundle **before** trusting the manifest (commands above) is the high-assurance path; the hash-only bootstrap check is the lower-assurance fallback when the bundle step is skipped.

## Authenticode status

The `wfg` binary is **not Authenticode-signed**. Windows reports `Get-AuthenticodeSignature` status `NotSigned`. Authenticode signing remains conditional on adopting SignPath (issue #240); until then, the cosign bundle over the checksum manifest plus SHA-256 verification is the integrity guarantee. Do not treat the binary as signed.

## EDR allow-list guidance

If your EDR blocks the installer or the binary, allow-list narrowly — never the whole shell:

- Allow the installed binary path prefix `<prefix>\bin\wfg.exe` (or `<prefix>/bin/wfg`), not `pwsh.exe` / `powershell.exe` broadly.
- Allow the installer script by its SHA-256 hash from `wayforge-checksums.txt` (the `install.ps1` / `install.sh` entry), not by URL or wildcard.
- Avoid blanket PowerShell allow-listing; the recommended flow already avoids piping remote content into a shell, so a narrow allow-list is sufficient.

## 2026-10-21 AMSI detection context

On 2026-10-21, Microsoft Defender flagged `Trojan:PowerShell/AmsiBypazz.E!MTB` (threat ID 2147948519) on a developer host during a wayforge install. Detection source was AMSI, process `pwsh.exe`; the raw evidence log was captured locally and is not committed to the repository (`*.log` is gitignored). The install used the then-recommended `irm ... | iex` cradle, which pipes the downloaded script straight into `Invoke-Expression`, so AMSI scanned the remote script content executing in memory and the detection was attributed to the PowerShell host. Static analysis found no AMSI-bypass constructs in the installer and a Defender scan of the repo script found no threats; the detection is assessed as a false positive triggered by the cradle pattern. The recommended flow — download to file, verify the hash, then run the file — avoids piping remote content to `Invoke-Expression` and removes that in-memory scan surface.

## Reporting a false positive

If an EDR still flags the installer or binary:

1. Submit the file to Microsoft for analysis: <https://www.microsoft.com/wdsi/filesubmission> (include the SHA-256 from `wayforge-checksums.txt`).
2. Open a GitHub issue at <https://github.com/Macacoders/wayforge/issues> with the detection name (for example `Trojan:PowerShell/AmsiBypazz.E!MTB`), the file hash, the EDR product/version, and the install command used.

## Transparency

The signed manifest is recorded in the public Rekor transparency log; checksums are not secret. Anyone can independently verify a release's manifest against its bundle with the commands above.
