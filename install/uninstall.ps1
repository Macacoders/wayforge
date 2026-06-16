#!/usr/bin/env pwsh
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT_DIR = Resolve-Path (Join-Path $SCRIPT_DIR '..') | Select-Object -ExpandProperty Path
. (Join-Path $SCRIPT_DIR 'lib/managed_sync.ps1')

$DRY_RUN = $false
$REPO_PATH = ''

function log {
    param([string]$Message)
    Write-Host "[ai-config] $Message"
}

function usage {
    @'
Usage:
  .\install\uninstall.ps1 -Repo <path> [-DryRun]

Options:
  -Repo <path>  Uninstall ai-config managed files from the target project.
  -DryRun       Print planned operations without modifying files.
  -h, -Help     Show this help.
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

# Resolve canonical absolute path
$REPO_PATH = Resolve-Path $REPO_PATH -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
if (-not $REPO_PATH) {
    log "error: cannot resolve repo path"
    exit 1
}

# Read the managed manifest to discover all tracked paths
if (-not (Read-ManagedManifest $REPO_PATH)) {
    log "error: no .ai-config-managed found in $REPO_PATH"
    exit 1
}

# Remove each managed file
$removedFiles = 0
foreach ($relPath in $script:_ManagedManifestPaths) {
    $absPath = Join-Path $REPO_PATH $relPath
    if (Test-Path $absPath -PathType Leaf) {
        $removedFiles++
    }
    run-rm $absPath
}

# Remove the manifest file itself (last, since we read from it)
$manifestPath = Join-Path $REPO_PATH '.ai-config-managed'
if (Test-Path $manifestPath -PathType Leaf) {
    run-rm $manifestPath
}

# Clean up empty parent directories
$cleanedDirs = 0
foreach ($relPath in $script:_ManagedManifestPaths) {
    $absPath = Join-Path $REPO_PATH $relPath
    $dir = Split-Path -Parent $absPath
    while ($dir -ne $REPO_PATH) {
        if ($DRY_RUN) {
            if (Test-Path $dir -PathType Container) {
                $isEmpty = -not (Get-ChildItem -Path $dir -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
                if ($isEmpty) {
                    $cleanedDirs++
                    log "DRY-RUN: would remove empty directory: $dir"
                }
            }
        } else {
            # Use .NET Directory.Delete (matches rmdir: only removes empty directories)
            try {
                [System.IO.Directory]::Delete($dir)
                $cleanedDirs++
                log "removed empty directory: $dir"
            } catch {
                # Directory not empty or inaccessible, skip
                Out-Null -InputObject $_
            }
        }
        # Safety: ensure we make progress toward repo root
        $parent = Split-Path -Parent $dir
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
}

# Remove tracking entry from installed-projects.json
$canonicalRepoPath = $REPO_PATH
$trackingFile = Join-Path $ROOT_DIR 'installed-projects.json'

if (Test-Path $trackingFile -PathType Leaf) {
    try {
        $data = Get-Content -Path $trackingFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop

        $projects = @($data.projects)
        $matchingProjects = @($projects | Where-Object { $_.path -eq $canonicalRepoPath })
        if ($matchingProjects.Count -gt 0) {
            $totalProjects = $projects.Count
            if ($DRY_RUN) {
                if ($totalProjects -eq 1) {
                    log "DRY-RUN: would remove tracking file (last project uninstalled): $trackingFile"
                } else {
                    log "DRY-RUN: would remove tracking entry: $canonicalRepoPath"
                }
            } else {
                if ($totalProjects -eq 1) {
                    Remove-Item -Path $trackingFile -Force
                    log "removed tracking file (last project uninstalled): $trackingFile"
                } else {
                    $filtered = @($projects | Where-Object { $_.path -ne $canonicalRepoPath })
                    $data.projects = $filtered
                    $data | ConvertTo-Json -Depth 3 | Set-Content -Path $trackingFile
                    log "removed tracking entry: $canonicalRepoPath"
                }
            }
        }
    } catch {
        log "warning: failed to update tracking file: $_"
    }
}

# Summary
if ($DRY_RUN) {
    log "DRY-RUN: summary: would remove $removedFiles managed file(s), would clean $cleanedDirs empty directory(ies)"
} else {
    log "summary: removed $removedFiles managed file(s), cleaned $cleanedDirs empty directory(ies)"
}
