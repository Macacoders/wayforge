#!/usr/bin/env pwsh

# Source this file from your PowerShell profile to expose wayforge helper functions.
# Add this line to your profile (run `notepad $PROFILE` to edit):
# . "C:\path\to\wayforge\install\powershell_profile_snippet.ps1"
# Note: install aliases delegate to the TypeScript CLI directly (npx tsx).
# Uninstall already uses the TS CLI directly.

function _wayforge_root {
    if ($env:WAYFORGE_HOME -and (Test-Path $env:WAYFORGE_HOME -PathType Container)) {
        return $env:WAYFORGE_HOME
    }

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    return Resolve-Path (Join-Path $scriptDir '..') | Select-Object -ExpandProperty Path
}

function wayforge-setup-repo {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _wayforge_root
    & npx.cmd tsx "$root\cli\src\index.ts" install --repo $RepoPath
}

function wayforge-setup-repo-dry-run {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _wayforge_root
    & npx.cmd tsx "$root\cli\src\index.ts" install --repo $RepoPath --dry-run
}

function wayforge-uninstall-repo {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _wayforge_root
    & npx.cmd tsx "$root\cli\src\index.ts" uninstall --repo $RepoPath
}

function wayforge-uninstall-repo-dry-run {
    param(
        [Parameter(Position=0, Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = _wayforge_root
    & npx.cmd tsx "$root\cli\src\index.ts" uninstall --repo $RepoPath --dry-run
}
