#!/usr/bin/env pwsh
#requires -Version 5.1

<#
.SYNOPSIS
    One-shot installer for ai-config on Windows.

.DESCRIPTION
    Fetches the prebuilt binary and share archive for this platform and places
    them under a dedicated prefix. Supports install, uninstall, and dry-run.

.PARAMETER Prefix
    Installation directory. Defaults to %LOCALAPPDATA%\ai-config.
    Override with the AI_CONFIG_INSTALL_DIR environment variable.

.PARAMETER Version
    Version to install (e.g. "1.2.3" or "v1.2.3"). Defaults to the latest release.

.PARAMETER Uninstall
    Remove ai-config from the prefix.

.PARAMETER DryRun
    Print actions without performing them.

.PARAMETER UrlBase
    Test override for the download base URL.
#>

[CmdletBinding()]
param(
    [string]$Prefix = "",
    [string]$Version = "",
    [switch]$Uninstall,
    [switch]$DryRun,
    [string]$UrlBase = ""
)

$ErrorActionPreference = "Stop"

$Repo = "Macacoders/ai-config"
if ($env:LOCALAPPDATA) {
    $DefaultPrefix = Join-Path $env:LOCALAPPDATA "ai-config"
} else {
    # LOCALAPPDATA is absent on non-Windows hosts (e.g. CI smoke tests);
    # fall back to a home-directory prefix so -DryRun stays testable anywhere.
    $DefaultPrefix = Join-Path $HOME ".ai-config"
}

if ($env:AI_CONFIG_INSTALL_DIR) {
    $Prefix = $env:AI_CONFIG_INSTALL_DIR
}
elseif (-not $Prefix) {
    $Prefix = $DefaultPrefix
}

# Normalize version: strip leading 'v' if present.
if ($Version) {
    $Version = $Version.TrimStart('v')
}

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
# Is64BitOperatingSystem tells us whether the OS is 64-bit; on non-Windows
# hosts (e.g. CI smoke tests) it is usually $true so -DryRun stays testable.
# PROCESSOR_ARCHITECTURE reports the current process bitness, so 32-bit
# PowerShell on 64-bit Windows returns x86; we therefore reject based on OS
# bitness, not process architecture.
if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Error "error: ai-config requires a 64-bit operating system" -ErrorAction Stop
}
$archEnv = $env:PROCESSOR_ARCHITECTURE
if ($archEnv -and $archEnv -eq "ARM64") {
    $Arch = "arm64"
}
else {
    $Arch = "x64"
}

$BinaryName = "ai-config-win32-${Arch}.exe"

# ---------------------------------------------------------------------------
# Version resolution
# ---------------------------------------------------------------------------
function Resolve-LatestVersion {
    $uri = "https://github.com/${Repo}/releases/latest"
    try {
        $response = Invoke-WebRequest -Uri $uri -MaximumRedirection 0 -UseBasicParsing
        $location = $response.Headers["Location"]
    }
    catch {
        # With -MaximumRedirection 0 the redirect throws; headers are still
        # exposed on the exception response.
        if ($_.Exception.Response -and $_.Exception.Response.Headers) {
            $location = $_.Exception.Response.Headers["Location"]
        }
        else {
            Write-Error "error: unable to resolve latest release" -ErrorAction Stop
        }
    }

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
    if ($UrlBase) {
        return $UrlBase
    }

    if ($Version) {
        $ref = "v${Version}"
    }
    else {
        $ref = "latest"
    }
    return "https://github.com/${Repo}/releases/${ref}/download"
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
# Install path
# ---------------------------------------------------------------------------
function Install-AiConfig {
    $resolvedVersion = if ($Version) { $Version } else { Resolve-LatestVersion }
    if (-not $resolvedVersion) {
        Write-Error "error: version could not be determined" -ErrorAction Stop
    }

    $baseUrl = Build-UrlBase
    $shareName = "ai-config-share-${resolvedVersion}.zip"
    $binaryUrl = "${baseUrl}/${BinaryName}"
    $shareUrl = "${baseUrl}/${shareName}"

    $binDir = Join-Path $Prefix "bin"
    $shareDir = Join-Path $Prefix (Join-Path "share" "ai-config")
    $binaryPath = Join-Path $binDir "ai-config.exe"

    if ($DryRun) {
        $baseCheck = Join-Path $shareDir "base"
        Write-Host "[dry-run] ARCH: ${Arch}"
        Write-Host "[dry-run] prefix: ${Prefix}"
        Write-Host "[dry-run] version: ${resolvedVersion}"
        Write-Host "[dry-run] binary URL: ${binaryUrl}"
        Write-Host "[dry-run] share URL: ${shareUrl}"
        Write-Host "[dry-run] would create directory: ${binDir}"
        Write-Host "[dry-run] would create directory: ${shareDir}"
        Write-Host "[dry-run] would download: ${binaryUrl} -> ${binaryPath}"
        Write-Host "[dry-run] would download and extract: ${shareUrl} -> ${shareDir}"
        Write-Host "[dry-run] would verify directory exists: ${baseCheck}"
        Write-Host "[dry-run] would add to User PATH: ${binDir}"
        return
    }

    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    New-Item -ItemType Directory -Force -Path $shareDir | Out-Null

    $tmpBinary = "${binaryPath}.tmp"
    Invoke-WebRequest -Uri $binaryUrl -OutFile $tmpBinary -UseBasicParsing
    Move-Item -Path $tmpBinary -Destination $binaryPath -Force

    $tmpShare = Join-Path $env:TEMP "ai-config-share-${resolvedVersion}.zip"
    Invoke-WebRequest -Uri $shareUrl -OutFile $tmpShare -UseBasicParsing

    if (Test-Path $shareDir) {
        Remove-Item -Path $shareDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $shareDir | Out-Null
    Expand-Archive -Path $tmpShare -DestinationPath $shareDir -Force
    Remove-Item -Path $tmpShare -Force

    $baseCheck = Join-Path $shareDir "base"
    if (-not (Test-Path $baseCheck -PathType Container)) {
        Write-Error "error: share archive did not create ${baseCheck}" -ErrorAction Stop
    }

    Add-UserPathEntry $binDir

    Write-Host "ai-config ${resolvedVersion} installed to ${binaryPath}"
    Write-Host "${binDir} added to your User PATH."
}

# ---------------------------------------------------------------------------
# Uninstall path
# ---------------------------------------------------------------------------
function Uninstall-AiConfig {
    $binDir = Join-Path $Prefix "bin"
    $shareDir = Join-Path $Prefix (Join-Path "share" "ai-config")
    $binaryPath = Join-Path $binDir "ai-config.exe"
    $trackingFile = Join-Path $Prefix "installed-projects.json"

    if ($DryRun) {
        Write-Host "[dry-run] prefix: ${Prefix}"
        Write-Host "[dry-run] would remove: ${binaryPath}"
        Write-Host "[dry-run] would remove: ${shareDir}"
        Write-Host "[dry-run] would remove: ${trackingFile}"
        Write-Host "[dry-run] would remove from User PATH: ${binDir}"
        return
    }

    if (Test-Path $binaryPath) {
        Remove-Item -Path $binaryPath -Force
    }
    if (Test-Path $shareDir) {
        Remove-Item -Path $shareDir -Recurse -Force
    }
    if (Test-Path $trackingFile) {
        Remove-Item -Path $trackingFile -Force
    }

    Remove-UserPathEntry $binDir

    if (Test-Path $Prefix) {
        $children = Get-ChildItem -Path $Prefix -Force -ErrorAction SilentlyContinue
        if (-not $children) {
            Remove-Item -Path $Prefix -Force
        }
    }

    Write-Host "ai-config uninstalled from ${Prefix}"
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
if ($Uninstall) {
    Uninstall-AiConfig
}
else {
    Install-AiConfig
}
