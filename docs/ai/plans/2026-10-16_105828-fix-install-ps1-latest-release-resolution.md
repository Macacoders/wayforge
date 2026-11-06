---
status: completed
created: 2026-10-16
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Fix install.ps1 latest-release resolution Implementation plan

**Goal:** Make the published Windows one-shot installer (`powershell -c "irm .../install.ps1 | iex"`) install successfully without an explicit `-Version`, on both Windows PowerShell 5.1 and PowerShell 7.

**Architecture:** `install.ps1` has two coupled defects on the "latest" path. (1) `Resolve-LatestVersion` disables redirects with `-MaximumRedirection 0` and tries to read the `Location` header from an exception that carries no usable response on either PowerShell edition, so it always errors. (2) Even when a version *is* resolved, `Build-UrlBase` ignores it and emits `.../releases/download/latest/...`, which GitHub 404s. The fix stops disabling redirects and reads the final URL from the returned response (edition-agnostic), and pins the download base to the resolved tag. A network-free Pester test stubs `Invoke-WebRequest` to exercise both code branches.

**Tech Stack:** PowerShell 5.1 (`install/install.ps1`), Pester 6 (`tests/powershell/install.Tests.ps1`).

**Scope classification:** `single-task`

## Verified facts (probed on 2026-10-16 against `Macacoders/wayforge`)

- `powershell -c "irm .../install.ps1 | iex"` runs **Windows PowerShell 5.1**. Reproduced: `Resolve-LatestVersion` errors with `error: unable to resolve latest release` (the user-reported message). Under `pwsh` (7) it errors with `error: unable to resolve latest release (got )`.
- Latest release is `v1.0.1`; assets include `install.ps1`, `wayforge-win32-x64.exe`, `wayforge-share-1.0.1.zip`.
- `https://github.com/Macacoders/wayforge/releases/download/latest/install.ps1` → **404**.
- `https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1` → 200.
- `https://github.com/Macacoders/wayforge/releases/download/v1.0.1/install.ps1` → 200 (and the binary/share assets → 200).
- After a redirect (no `-MaximumRedirection 0`): PS 5.1 exposes the final URL as `$response.BaseResponse.ResponseUri`; PS 7 exposes it as `$response.BaseResponse.RequestMessage.RequestUri`.
- The current Pester suite always passes `-Version 9.9.9`, so it never exercises the latest path — that is the coverage gap this plan closes.
- `install/install.sh` is **not** affected: it resolves the redirect with `curl -w '%{url_effective}'` and always builds `releases/download/<tag>`.

## Tasks

### Task 1: Resolve and download the latest release on both PowerShell editions

**Objective:** `install.ps1 -DryRun -SkipNodeCheck` (no `-Version`) prints the resolved tag and `releases/download/v<tag>/...` URLs on Windows PowerShell 5.1 and PowerShell 7, and a network-free Pester test locks the behavior.

**Files:**
- Modify: `install/install.ps1` (`Resolve-LatestVersion` ~98-124, `Build-UrlBase` ~129-141, call site ~286)
- Validate: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

With no `-Version`, `Resolve-LatestVersion` must follow the `https://github.com/Macacoders/wayforge/releases/latest` redirect and return the tag (e.g. `1.0.1`), and `Install-Wayforge` must build the asset base from that resolved tag: `https://github.com/Macacoders/wayforge/releases/download/v1.0.1/...` (binary `/wayforge-win32-x64.exe`, share `/wayforge-share-1.0.1.zip`), both HTTP 200. This must hold in Windows PowerShell 5.1 and PowerShell 7. The literal `releases/download/latest/...` must never appear (it 404s).

**Step 2: Add or update validation**

Add a new `Describe 'Latest release resolution (-DryRun, no -Version)'` block to `tests/powershell/install.Tests.ps1`. The test must run **without network** by redefining `Invoke-WebRequest` in the child `pwsh` session so it shadows the cmdlet, returning a fake redirect response whose shape matches each PowerShell edition. Both `It` cases run under the existing child-`pwsh` harness, so the host is irrelevant — the two cases exercise the two response-shape branches.

```powershell
Describe 'Latest release resolution (-DryRun, no -Version)' {
    BeforeEach {
        $script:tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:tmp | Out-Null
    }
    AfterEach {
        Remove-Item -Path $script:tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    It 'reads the final URL from BaseResponse.ResponseUri (Windows PowerShell 5.1 shape)' {
        $stub = @"
function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]`$Uri, [switch]`$UseBasicParsing)
    [pscustomobject]@{
        BaseResponse = [pscustomobject]@{
            ResponseUri = [uri]'https://github.com/Macacoders/wayforge/releases/tag/v9.9.9'
        }
    }
}
& '$script:installScript' -DryRun -SkipNodeCheck -Prefix '$script:tmp/prefix' 2>&1
exit 0
"@
        $combined = (& pwsh -NoProfile -Command $stub | Out-String)
        $combined | Should -Match '\[dry-run\] version: 9\.9\.9'
        $combined | Should -Match 'releases/download/v9\.9\.9/wayforge-win32-x64\.exe'
        $combined | Should -Not -Match 'releases/download/latest'
    }

    It 'reads the final URL from BaseResponse.RequestMessage.RequestUri (PowerShell 7 shape)' {
        $stub = @"
function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]`$Uri, [switch]`$UseBasicParsing)
    [pscustomobject]@{
        BaseResponse = [pscustomobject]@{
            ResponseUri = `$null
            RequestMessage = [pscustomobject]@{ RequestUri = [uri]'https://github.com/Macacoders/wayforge/releases/tag/v9.9.9' }
        }
    }
}
& '$script:installScript' -DryRun -SkipNodeCheck -Prefix '$script:tmp/prefix' 2>&1
exit 0
"@
        $combined = (& pwsh -NoProfile -Command $stub | Out-String)
        $combined | Should -Match '\[dry-run\] version: 9\.9\.9'
        $combined | Should -Match 'releases/download/v9\.9\.9/wayforge-win32-x64\.exe'
        $combined | Should -Not -Match 'releases/download/latest'
    }
}
```

Note: the tests must pass `-SkipNodeCheck` so the stub is the only HTTP call (dry-run performs no downloads). Verified against the current implementation: both cases fail (`error: unable to resolve latest release`), and against the patched implementation: both pass.

**Step 3: Write minimal implementation**

Replace the `Resolve-LatestVersion` function body (leave the function name, `$uri`, and tag-parsing/validation logic as-is; change only how `$location` is obtained):

```powershell
function Resolve-LatestVersion {
    $uri = "https://github.com/${Repo}/releases/latest"
    try {
        $response = Invoke-WebRequest -Uri $uri -UseBasicParsing
    }
    catch {
        Write-Error "error: unable to resolve latest release" -ErrorAction Stop
    }

    # /releases/latest redirects to /releases/tag/<tag>; read the final URL.
    # Windows PowerShell 5.1 exposes it as BaseResponse.ResponseUri; PowerShell 7
    # as BaseResponse.RequestMessage.RequestUri.
    $finalUri = $response.BaseResponse.ResponseUri
    if (-not $finalUri) {
        $finalUri = $response.BaseResponse.RequestMessage.RequestUri
    }
    $location = "$finalUri"

    if (-not $location -or $location -notmatch "/tag/") {
        Write-Error "error: unable to resolve latest release (got ${location})" -ErrorAction Stop
    }

    $tag = Split-Path $location -Leaf
    if (-not $tag) {
        Write-Error "error: unable to parse latest release tag from ${location}" -ErrorAction Stop
    }
    return $tag.TrimStart('v')
}
```

Replace `Build-UrlBase` so it always builds from the resolved tag (removes the `releases/download/latest` 404 path):

```powershell
function Build-UrlBase {
    param([Parameter(Mandatory)][string]$ResolvedVersion)

    if ($UrlBase) {
        return $UrlBase
    }

    return "https://github.com/${Repo}/releases/download/v${ResolvedVersion}"
}
```

Update the call site in `Install-Wayforge` (~line 286) to pass the already-computed tag:

```powershell
    $baseUrl = Build-UrlBase -ResolvedVersion $resolvedVersion
```

**Step 4: Run test to verify pass**

Run (agent, no network — Pester 6.1.0 is installed in this environment):

```powershell
make check-pester
```

Expected: all `install.Tests.ps1` cases pass, including the two new latest-resolution cases; no regressions in the existing `-Version 9.9.9` cases.

Run (agent, no-network smoke against the patched file, optional cross-check):

```powershell
pwsh -NoProfile -Command "& ./install/install.ps1 -DryRun -SkipNodeCheck -Version 9.9.9 -Prefix (Join-Path $env:TEMP 'wf-check')" |
  Select-String 'releases/download/v9.9.9'
```

Expected: prints `releases/download/v9.9.9/wayforge-win32-x64.exe` (existing behavior preserved).

Run (human, Windows + network — real redirect resolution):

```powershell
powershell -File ./install/install.ps1 -DryRun -SkipNodeCheck -Prefix "$env:TEMP\wf-check"
```

Expected: prints `[dry-run] version: 1.0.1` and `releases/download/v1.0.1/...` (no error).

**Step 5: Commit**

```sh
git add install/install.ps1 tests/powershell/install.Tests.ps1
git commit -m "fix(install): resolve latest release on PowerShell 5.1 and 7"
```

## Post-merge (operational, not a task)

The published asset on the current latest release (`v1.0.1`) still contains the bug, so the README one-liner stays broken until a new release is published:

1. Bump `VERSION` to the next patch (e.g. `1.0.2`) and update `CHANGELOG.md`.
2. Merge `develop → main` via PR (branch protection forbids direct pushes), which triggers `release.yml` and uploads the fixed `install.ps1` as an asset.
3. Verify the public command end to end:
   ```powershell
   powershell -c "irm https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 | iex"
   ```

## Validation ownership

| Validation | Owner |
| --- | --- |
| New network-free Pester latest-resolution cases (`Invoke-WebRequest` stub) | agent |
| `make check-pester` (full PowerShell suite) | agent |
| Existing `-Version 9.9.9` dry-run URL-shape check | agent |
| `powershell -File install.ps1 -DryRun` without `-Version` (real redirect, Windows + network) | human |
| Published `irm ... \| iex` one-liner after patch release | human |

## Acceptance criteria

- `install.ps1 -DryRun -SkipNodeCheck` with no `-Version` resolves the latest tag and prints `releases/download/v<tag>/...` URLs on both Windows PowerShell 5.1 and PowerShell 7.
- `releases/download/latest/...` is never produced by the installer.
- `tests/powershell/install.Tests.ps1` contains a network-free case (covering both response shapes) that fails against the pre-fix implementation and passes after it.
- After a patch release, `powershell -c "irm .../install.ps1 | iex"` completes without `-Version`.
