#!/usr/bin/env pwsh

# Source this file from your PowerShell profile to expose ai-config helper functions.
# Add this line to your profile (run `notepad $PROFILE` to edit):
# . "C:\path\to\ai-config\install\powershell_profile_snippet.ps1"
# Note: install aliases delegate to install/bootstrap.ps1 (thin wrapper with
# binary auto-download and npx tsx fallback). Uninstall uses the TS CLI directly.

function _ai_config_root {
    if ($env:AI_CONFIG_HOME -and (Test-Path $env:AI_CONFIG_HOME -PathType Container)) {
        return $env:AI_CONFIG_HOME
    }

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    return Resolve-Path (Join-Path $scriptDir '..') | Select-Object -ExpandProperty Path
}

function ai-setup-repo {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _ai_config_root
    & "$root\install\bootstrap.ps1" --repo $RepoPath
}

function ai-setup-repo-dry-run {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _ai_config_root
    & "$root\install\bootstrap.ps1" --repo $RepoPath --dry-run
}

function ai-uninstall-repo {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _ai_config_root
    & npx.cmd tsx "$root\cli\src\index.ts" uninstall --repo $RepoPath
}

function ai-uninstall-repo-dry-run {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _ai_config_root
    & npx.cmd tsx "$root\cli\src\index.ts" uninstall --repo $RepoPath --dry-run
}
