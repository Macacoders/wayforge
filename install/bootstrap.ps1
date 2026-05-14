#!/usr/bin/env pwsh
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT_DIR = Resolve-Path (Join-Path $SCRIPT_DIR '..') | Select-Object -ExpandProperty Path

$DRY_RUN = $false
$FORCE = $false
$REPO_PATH = ''

function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function log {
    param([string]$Message)
    Write-Host "[ai-config] $Message"
}

function run-mkdir {
    param([string]$Dir)
    if ($DRY_RUN) {
        return
    }
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
}

function run-rm {
    param([string]$Path)
    if ($DRY_RUN) {
        log "DRY-RUN: Remove-Item -Path $Path"
        return
    }
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Force
    }
}

function run-ln {
    param(
        [string]$Src,
        [string]$Dst
    )
    if ($DRY_RUN) {
        log "DRY-RUN: New-Item -ItemType SymbolicLink -Path $Dst -Target $Src"
        return
    }
    New-Item -ItemType SymbolicLink -Path $Dst -Target $Src | Out-Null
}

function ensure-dir {
    param([string]$Dir)
    if (Test-Path $Dir -PathType Container) {
        return
    }
    if ($DRY_RUN) {
        log "DRY-RUN: New-Item -ItemType Directory -Path $Dir"
        return
    }
    run-mkdir $Dir
    log "created directory: $Dir"
}

function safe-link {
    param(
        [string]$Src,
        [string]$Dst
    )

    if (-not (Test-Path $Src)) {
        log "error: source does not exist: $Src"
        exit 1
    }

    # Check if destination exists and is a symlink
    if (Test-Path $Dst) {
        $item = Get-Item $Dst -ErrorAction SilentlyContinue
        if ($item -and $item.Attributes -match 'ReparsePoint') {
            # It's a symlink/junction
            $currentTarget = $item.Target
            if ($currentTarget -eq $Src -and -not $FORCE) {
                log "kept existing symlink: $Dst -> $Src"
                return
            }

            if ($FORCE) {
                run-rm $Dst
                run-ln $Src $Dst
                if ($DRY_RUN) {
                    log "DRY-RUN: would replace symlink: $Dst -> $Src"
                } else {
                    log "linked (replaced symlink): $Dst -> $Src"
                }
                return
            }

            log "skip existing symlink (use -Force to replace): $Dst -> $currentTarget"
            return
        }

        # It's a regular file or directory
        log "skip existing non-symlink: $Dst"
        return
    }

    $parent = Split-Path -Parent $Dst
    ensure-dir $parent
    run-ln $Src $Dst
    if ($DRY_RUN) {
        log "DRY-RUN: would link: $Dst -> $Src"
    } else {
        log "linked: $Dst -> $Src"
    }
}

function install-repo {
    param([string]$Repo)

    if (-not (Test-Path $Repo -PathType Container)) {
        log "error: repo path does not exist: $Repo"
        exit 1
    }

    ensure-dir (Join-Path $Repo '.opencode')

    safe-link (Join-Path $ROOT_DIR 'opencode.jsonc') (Join-Path $Repo 'opencode.jsonc')
    safe-link (Join-Path (Join-Path $ROOT_DIR 'templates') 'AGENTS.md') (Join-Path $Repo 'AGENTS.md')
    safe-link (Join-Path (Join-Path $ROOT_DIR '.opencode') 'agents') (Join-Path (Join-Path $Repo '.opencode') 'agents')
    safe-link (Join-Path (Join-Path $ROOT_DIR '.opencode') 'commands') (Join-Path (Join-Path $Repo '.opencode') 'commands')
    safe-link (Join-Path (Join-Path $ROOT_DIR '.opencode') 'skills') (Join-Path (Join-Path $Repo '.opencode') 'skills')

    log "repo bootstrap complete for: $Repo"
}

function usage {
    @'
Usage:
  .\install\bootstrap.ps1 -Repo <path> [-DryRun] [-Force]

Options:
  -Repo <path>   Link OpenCode config into a target project.
  -DryRun        Print planned operations without modifying files.
  -Force         Replace existing symlinks. Never overwrites non-symlink files.
  -h, -Help      Show this help.
'@ | Write-Host
}

# Parse arguments
for ($i = 0; $i -lt $args.Count; $i++) {
    switch ($args[$i]) {
        '-Repo' {
            $i++
            if ($i -lt $args.Count) {
                $REPO_PATH = $args[$i]
            } else {
                log "error: -Repo requires a path"
                exit 1
            }
        }
        '-DryRun' {
            $DRY_RUN = $true
        }
        '-Force' {
            $FORCE = $true
        }
        { $_ -in '-h', '-Help', '--help' } {
            usage
            exit 0
        }
        default {
            log "error: unknown option: $($args[$i])"
            usage
            exit 1
        }
    }
}

if ([string]::IsNullOrEmpty($REPO_PATH)) {
    log "error: -Repo <path> is required"
    usage
    exit 1
}

# Resolve full path
$REPO_PATH = Resolve-Path $REPO_PATH -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
if (-not $REPO_PATH) {
    log "error: cannot resolve repo path"
    exit 1
}

# Check for administrator privileges (required for creating symlinks on Windows)
if (-not $DRY_RUN -and -not (Test-Administrator)) {
    log "warning: Administrator privileges are required to create symbolic links on Windows."
    log "         Please run PowerShell as Administrator, or enable Developer Mode."
    log "         Falling back to dry-run mode. Use -DryRun to suppress this warning."
    $DRY_RUN = $true
}

install-repo $REPO_PATH
log "done"
