#!/usr/bin/env pwsh
#requires -Version 5.1

<#
.SYNOPSIS
    One-shot installer for wayforge on Windows.

.DESCRIPTION
    Fetches the prebuilt binary and share archive for this platform and places
    them under a dedicated prefix. Supports install, uninstall, and dry-run.

.PARAMETER Prefix
    Installation directory. Defaults to %LOCALAPPDATA%\wayforge.
    Override with the WAYFORGE_INSTALL_DIR environment variable.

.PARAMETER Version
    Version to install (e.g. "1.2.3" or "v1.2.3"). Defaults to the latest release.

.PARAMETER Uninstall
    Remove wayforge from the prefix.

.PARAMETER DryRun
    Print actions without performing them.

.PARAMETER SkipNodeCheck
    Skip Node.js detection and provisioning.

.PARAMETER UrlBase
    Test override for the download base URL.
#>

[CmdletBinding()]
param(
    [string]$Prefix = "",
    [string]$Version = "",
    [switch]$Uninstall,
    [switch]$DryRun,
    [switch]$SkipNodeCheck,
    [string]$UrlBase = ""
)

$ErrorActionPreference = "Stop"

$Repo = "Macacoders/wayforge"
if ($env:LOCALAPPDATA) {
    $DefaultPrefix = Join-Path $env:LOCALAPPDATA "wayforge"
} else {
    # LOCALAPPDATA is absent on non-Windows hosts (e.g. CI smoke tests);
    # fall back to a home-directory prefix so -DryRun stays testable anywhere.
    $DefaultPrefix = Join-Path $HOME ".wayforge"
}

if ($env:WAYFORGE_INSTALL_DIR) {
    $Prefix = $env:WAYFORGE_INSTALL_DIR
}
elseif (-not $Prefix) {
    $Prefix = $DefaultPrefix
}

# Normalize version: strip leading 'v' if present.
if ($Version) {
    $Version = $Version.TrimStart('v')
}

# ---------------------------------------------------------------------------
# Node.js provisioning
# ---------------------------------------------------------------------------
# Pinned LTS version, minimum major, and download base (override the base
# with WAYFORGE_NODE_BASE_URL for tests).
$NodeMinMajor = 18
$NodeVersion = "24.13.0"
$NodeBaseUrl = if ($env:WAYFORGE_NODE_BASE_URL) { $env:WAYFORGE_NODE_BASE_URL } else { "https://nodejs.org/dist" }

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
# Is64BitOperatingSystem tells us whether the OS is 64-bit; on non-Windows
# hosts (e.g. CI smoke tests) it is usually $true so -DryRun stays testable.
# PROCESSOR_ARCHITECTURE reports the current process bitness, so 32-bit
# PowerShell on 64-bit Windows returns x86; we therefore reject based on OS
# bitness, not process architecture.
if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Error "error: wayforge requires a 64-bit operating system" -ErrorAction Stop
}
$archEnv = $env:PROCESSOR_ARCHITECTURE
if ($archEnv -and $archEnv -eq "ARM64") {
    $Arch = "arm64"
}
else {
    $Arch = "x64"
}

$BinaryName = "wayforge-win32-${Arch}.exe"

# ---------------------------------------------------------------------------
# Version resolution
# ---------------------------------------------------------------------------
function Resolve-LatestVersion {
    $uri = "https://github.com/${Repo}/releases/latest"
    try {
        $response = Invoke-WebRequest -Uri $uri -UseBasicParsing
    }
    catch {
        Write-Error "error: unable to resolve latest release: ${_}" -ErrorAction Stop
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

# ---------------------------------------------------------------------------
# URL construction
# ---------------------------------------------------------------------------
function Build-UrlBase {
    param([Parameter(Mandatory)][string]$ResolvedVersion)

    if ($UrlBase) {
        return $UrlBase
    }

    return "https://github.com/${Repo}/releases/download/v${ResolvedVersion}"
}

# ---------------------------------------------------------------------------
# PATH helpers
# ---------------------------------------------------------------------------
function Get-UserPath {
    return [Environment]::GetEnvironmentVariable("Path", "User")
}

function Add-UserPathEntry {
    param([string]$Entry)
    $current = Get-UserPath
    $parts = @()
    if ($current) {
        $parts = $current -split ';' | Where-Object { $_ -ne "" }
    }
    if ($parts -contains $Entry) {
        return
    }
    $newPath = ($parts + $Entry) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}

function Remove-UserPathEntry {
    param([string]$Entry)
    $current = Get-UserPath
    if (-not $current) {
        return
    }
    $parts = $current -split ';' | Where-Object { $_ -ne "" }
    $filtered = $parts | Where-Object { $_ -ne $Entry }
    if ($filtered.Count -eq $parts.Count) {
        return
    }
    $newPath = $filtered -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}

# ---------------------------------------------------------------------------
# Node.js provisioning
# ---------------------------------------------------------------------------
function Get-NodeMajor {
    $command = Get-Command node -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }
    $version = & node --version 2>$null
    if (-not $version) {
        return $null
    }
    $version = ("$version").TrimStart('v')
    if ($version -notmatch '^\d+') {
        return $null
    }
    return [int]$Matches[0]
}

function Install-LocalNode {
    $nodeDir = Join-Path $Prefix "node"
    $archive = "node-v${NodeVersion}-win-${Arch}.zip"
    $url = "${NodeBaseUrl}/v${NodeVersion}/${archive}"

    Write-Host "Installing Node.js v${NodeVersion} (win-${Arch}) to ${nodeDir}"
    New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null

    # The Node zip contains a top-level node-v<ver>-win-<arch>\ folder; expand
    # to a temp dir and move its contents so node.exe lands at nodeDir\node.exe.
    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("wayforge-node-" + [System.Guid]::NewGuid().ToString("N"))
    $tmpZip = Join-Path ([System.IO.Path]::GetTempPath()) $archive
    try {
        Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing
        Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
    }
    finally {
        if (Test-Path $tmpZip) {
            Remove-Item -Path $tmpZip -Force
        }
    }

    $extracted = Get-ChildItem -Path $tmpDir -Force | Select-Object -First 1
    if (-not $extracted) {
        Remove-Item -Path $tmpDir -Recurse -Force
        Write-Error "error: Node.js archive did not contain ${nodeDir}\node.exe" -ErrorAction Stop
    }
    Get-ChildItem -Path $extracted.FullName -Force | Move-Item -Destination $nodeDir -Force
    Remove-Item -Path $tmpDir -Recurse -Force

    if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
        Write-Error "error: Node.js archive did not contain ${nodeDir}\node.exe" -ErrorAction Stop
    }

    Add-UserPathEntry $nodeDir
    $env:Path = "${nodeDir};$env:Path"
}

function Ensure-Node {
    if ($SkipNodeCheck) {
        return
    }

    $major = Get-NodeMajor
    if ($null -ne $major) {
        if ($major -ge $NodeMinMajor) {
            Write-Host "Node.js $(& node --version) detected"
            return
        }
        Write-Host "Node.js $(& node --version) is older than the required v${NodeMinMajor}; provisioning Node.js v${NodeVersion}"
    }
    else {
        Write-Host "Node.js >= ${NodeMinMajor} not found on PATH; provisioning Node.js v${NodeVersion}"
    }

    if ($DryRun) {
        Write-Host "[dry-run] would install Node.js v${NodeVersion} (win-${Arch})"
        Write-Host "[dry-run] would download: ${NodeBaseUrl}/v${NodeVersion}/node-v${NodeVersion}-win-${Arch}.zip"
        Write-Host "[dry-run] would extract to: $(Join-Path $Prefix 'node')"
        Write-Host "[dry-run] would add to User PATH: $(Join-Path $Prefix 'node')"
        return
    }

    try {
        Install-LocalNode
    }
    catch {
        Write-Error "error: failed to provision Node.js v${NodeVersion}; install Node.js >= ${NodeMinMajor} manually from https://nodejs.org and re-run" -ErrorAction Stop
    }

    $major = Get-NodeMajor
    if ($null -eq $major -or $major -lt $NodeMinMajor) {
        Write-Error "error: provisioned Node.js did not report version >= ${NodeMinMajor}; install Node.js manually from https://nodejs.org and re-run" -ErrorAction Stop
    }
    Write-Host "Node.js $(& node --version) provisioned at $(Join-Path $Prefix 'node')"
}

# ---------------------------------------------------------------------------
# Checksum verification
# ---------------------------------------------------------------------------
# Returns the HTTP status code carried by an Invoke-WebRequest failure, or
# $null for transport failures (timeout/TLS/DNS) where no response exists.
# PS 5.1 exposes HttpWebResponse.StatusCode; PS 7 exposes
# HttpResponseMessage.StatusCode; both cast to [int].
function Get-HttpStatusCode {
    param($ErrorRecord)

    $response = $ErrorRecord.Exception.Response
    if (-not $response) {
        return $null
    }
    try {
        return [int]$response.StatusCode
    }
    catch {
        return $null
    }
}

# Parses a sha256sum-format checksum file into a hashtable keyed by bare asset
# name (release entries carry a dist/ prefix; GetFileName normalizes, mirroring
# parseChecksums in cli/src/lib/upgrade.ts).
function Get-ExpectedChecksum {
    param([Parameter(Mandatory)][string]$ChecksumFile)

    $expected = @{}
    foreach ($line in Get-Content -Path $ChecksumFile) {
        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') {
            $name = [System.IO.Path]::GetFileName($Matches[2].Trim())
            $expected[$name] = $Matches[1].ToLowerInvariant()
        }
    }
    return $expected
}

function Assert-Checksum {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][hashtable]$Expected
    )

    if (-not $Expected.ContainsKey($Name)) {
        Write-Error "error: checksum file has no entry for ${Name}; aborting without changes" -ErrorAction Stop
    }
    $actual = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected[$Name]) {
        Write-Error "error: checksum mismatch for ${Name}: expected $($Expected[$Name]), got ${actual}" -ErrorAction Stop
    }
    Write-Host "verified ${Name} checksum"
}

# ---------------------------------------------------------------------------
# Install path
# ---------------------------------------------------------------------------
function Install-Wayforge {
    $resolvedVersion = if ($Version) { $Version } else { Resolve-LatestVersion }
    if (-not $resolvedVersion) {
        Write-Error "error: version could not be determined" -ErrorAction Stop
    }

    $baseUrl = Build-UrlBase -ResolvedVersion $resolvedVersion
    $shareName = "wayforge-share-${resolvedVersion}.zip"
    $binaryUrl = "${baseUrl}/${BinaryName}"
    $shareUrl = "${baseUrl}/${shareName}"
    $checksumUrl = "${baseUrl}/wayforge-checksums.txt"

    $binDir = Join-Path $Prefix "bin"
    $shareDir = Join-Path $Prefix (Join-Path "share" "wayforge")
    $binaryPath = Join-Path $binDir "wfg.exe"

    if ($DryRun) {
        $baseCheck = Join-Path $shareDir "base"
        Ensure-Node
        Write-Host "[dry-run] ARCH: ${Arch}"
        Write-Host "[dry-run] prefix: ${Prefix}"
        Write-Host "[dry-run] version: ${resolvedVersion}"
        Write-Host "[dry-run] binary URL: ${binaryUrl}"
        Write-Host "[dry-run] share URL: ${shareUrl}"
        Write-Host "[dry-run] checksum URL: ${checksumUrl}"
        Write-Host "[dry-run] would verify: ${BinaryName}, ${shareName}"
        Write-Host "[dry-run] would create directory: ${binDir}"
        Write-Host "[dry-run] would create directory: ${shareDir}"
        Write-Host "[dry-run] would download: ${binaryUrl} -> ${binaryPath}"
        Write-Host "[dry-run] would download and extract: ${shareUrl} -> ${shareDir}"
        Write-Host "[dry-run] would verify directory exists: ${baseCheck}"
        Write-Host "[dry-run] would add to User PATH: ${binDir}"
        return
    }

    $tmpBinary = Join-Path ([System.IO.Path]::GetTempPath()) ("wayforge-binary-" + [System.Guid]::NewGuid().ToString("N"))
    $tmpShare = Join-Path ([System.IO.Path]::GetTempPath()) ("wayforge-share-" + [System.Guid]::NewGuid().ToString("N") + ".zip")
    $tmpChecksums = Join-Path ([System.IO.Path]::GetTempPath()) ("wayforge-checksums-" + [System.Guid]::NewGuid().ToString("N") + ".txt")
    try {
        Invoke-WebRequest -Uri $binaryUrl -OutFile $tmpBinary -UseBasicParsing
        Invoke-WebRequest -Uri $shareUrl -OutFile $tmpShare -UseBasicParsing

        # Older releases predate wayforge-checksums.txt; only a confirmed
        # 404 may fall back to an unverified install. Every other failure
        # (403/5xx, timeout, TLS) aborts before any prefix change.
        $skipChecksums = $false
        try {
            Invoke-WebRequest -Uri $checksumUrl -OutFile $tmpChecksums -UseBasicParsing
        }
        catch {
            $statusCode = Get-HttpStatusCode $_
            if ($statusCode -eq 404) {
                $skipChecksums = $true
                Write-Warning "wayforge-checksums.txt is unavailable for ${resolvedVersion}; skipping checksum verification"
            }
            else {
                $detail = if ($statusCode) { " (HTTP ${statusCode})" } else { "" }
                Write-Error "error: failed to download wayforge-checksums.txt for ${resolvedVersion}${detail}: $($_.Exception.Message); aborting without changes" -ErrorAction Stop
            }
        }
        if (-not $skipChecksums) {
            $expected = Get-ExpectedChecksum -ChecksumFile $tmpChecksums
            Assert-Checksum -Path $tmpBinary -Name $BinaryName -Expected $expected
            Assert-Checksum -Path $tmpShare -Name $shareName -Expected $expected
        }

        Ensure-Node

        New-Item -ItemType Directory -Force -Path $binDir | Out-Null
        New-Item -ItemType Directory -Force -Path $shareDir | Out-Null

        Move-Item -Path $tmpBinary -Destination $binaryPath -Force
        $tmpBinary = $null

        if (Test-Path $shareDir) {
            Remove-Item -Path $shareDir -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $shareDir | Out-Null
        Expand-Archive -Path $tmpShare -DestinationPath $shareDir -Force

        $baseCheck = Join-Path $shareDir "base"
        if (-not (Test-Path $baseCheck -PathType Container)) {
            Write-Error "error: share archive did not create ${baseCheck}" -ErrorAction Stop
        }

        Add-UserPathEntry $binDir

        Write-Host "wayforge ${resolvedVersion} installed to ${binaryPath}"
        Write-Host "${binDir} added to your User PATH."
    }
    finally {
        foreach ($tmp in @($tmpBinary, $tmpShare, $tmpChecksums)) {
            if ($tmp -and (Test-Path $tmp)) {
                Remove-Item -Path $tmp -Force
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Uninstall path
# ---------------------------------------------------------------------------
function Uninstall-Wayforge {
    $binDir = Join-Path $Prefix "bin"
    $shareDir = Join-Path $Prefix (Join-Path "share" "wayforge")
    $nodeDir = Join-Path $Prefix "node"
    $binaryPath = Join-Path $binDir "wfg.exe"
    $trackingFile = Join-Path $Prefix "installed-projects.json"

    if ($DryRun) {
        Write-Host "[dry-run] prefix: ${Prefix}"
        Write-Host "[dry-run] would remove: ${binaryPath}"
        Write-Host "[dry-run] would remove: ${shareDir}"
        Write-Host "[dry-run] would remove: ${nodeDir}"
        Write-Host "[dry-run] would remove: ${trackingFile}"
        Write-Host "[dry-run] would remove from User PATH: ${binDir}"
        Write-Host "[dry-run] would remove from User PATH: ${nodeDir}"
        return
    }

    if (Test-Path $binaryPath) {
        Remove-Item -Path $binaryPath -Force
    }
    if (Test-Path $shareDir) {
        Remove-Item -Path $shareDir -Recurse -Force
    }
    if (Test-Path $nodeDir) {
        Remove-Item -Path $nodeDir -Recurse -Force
    }
    if (Test-Path $trackingFile) {
        Remove-Item -Path $trackingFile -Force
    }

    Remove-UserPathEntry $binDir
    Remove-UserPathEntry $nodeDir

    if (Test-Path $Prefix) {
        $children = Get-ChildItem -Path $Prefix -Force -ErrorAction SilentlyContinue
        if (-not $children) {
            Remove-Item -Path $Prefix -Force
        }
    }

    Write-Host "wayforge uninstalled from ${Prefix}"
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
if ($Uninstall) {
    Uninstall-Wayforge
}
else {
    Install-Wayforge
}
