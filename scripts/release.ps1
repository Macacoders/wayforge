#!/usr/bin/env pwsh
#Requires -Version 5.1
param(
    [string]$Version = '',
    [switch]$DryRun,
    [switch]$Help
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT_DIR = Resolve-Path (Join-Path $SCRIPT_DIR '..')

function usage {
    @'
Usage: scripts\release.ps1 -Version <semver> [-DryRun] [-Help]

Prepare a new ai-config release.

Options:
  -Version <semver>  New version (e.g., 0.2.0)
  -DryRun            Preview operations without making changes
  -Help              Show this help
'@ | Write-Output
    exit 0
}

if ($Help -or -not $Version) {
    usage
}

# Validate SemVer format
if ($Version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$') {
    Write-Error "invalid version format '$Version'. Expected SemVer (e.g., 0.2.0)"
    exit 1
}

$currentVersion = if (Test-Path (Join-Path $ROOT_DIR 'VERSION')) { (Get-Content (Join-Path $ROOT_DIR 'VERSION') -Raw).Trim() } else { '0.0.0' }
Write-Output "[release] Current version: $currentVersion"
Write-Output "[release] New version:     $Version"
Write-Output ""

# 1. Verify clean working tree
$status = git -C $ROOT_DIR status --porcelain
if ($status) {
    Write-Error "working tree is not clean. Commit or stash changes first."
    exit 1
}

# 2. Verify we're on develop
$currentBranch = git -C $ROOT_DIR rev-parse --abbrev-ref HEAD
if ($currentBranch -ne 'develop') {
    Write-Error "must be on 'develop' branch (currently on '$currentBranch')"
    exit 1
}

# 3. Update VERSION file
Write-Output "[release] update VERSION: $currentVersion -> $Version"
if (-not $DryRun) {
    Set-Content -Path (Join-Path $ROOT_DIR 'VERSION') -Value "$Version" -NoNewline
    Write-Output "  written: VERSION"
} else {
    Write-Output "  [dry-run] would write VERSION"
}

# 4. Update CHANGELOG.md
$today = Get-Date -Format 'yyyy-MM-dd'
$changelog = Join-Path $ROOT_DIR 'CHANGELOG.md'
$newEntry = @"

## [$Version] - $today

### Added

- Placeholder: describe changes for this release.
"@

if (-not $DryRun) {
    $content = Get-Content $changelog -Raw
    # Insert new entry after header, before first existing entry
    if ($content -match '(# Changelog[^\n]*\n\n[^\n]*\n[^\n]*\n\n)') {
        $header = $matches[1]
        $rest = $content.Substring($header.Length)
        $newContent = "$header$newEntry`n`n$rest"
        Set-Content -Path $changelog -Value $newContent -Encoding UTF8
    } else {
        Add-Content -Path $changelog -Value $newEntry -Encoding UTF8
    }
    # Update version link at bottom
    $linkContent = Get-Content $changelog -Raw
    $oldLink = "[$currentVersion]:"
    $newLink = "[$Version]: https://github.com/Macacoders/ai-config/releases/tag/v$Version`r`n$oldLink"
    if ($linkContent -match [regex]::Escape($oldLink)) {
        $linkContent = $linkContent -replace [regex]::Escape($oldLink), $newLink
        Set-Content -Path $changelog -Value $linkContent -Encoding UTF8
    }
    Write-Output "  updated: CHANGELOG.md"
} else {
    Write-Output "  [dry-run] would add entry to CHANGELOG.md:"
    $newEntry.Trim() -split "`n" | ForEach-Object { Write-Output "    $_" }
}

# 5. Create tag
Write-Output ""
Write-Output "[release] git tag -a v$Version -m ""Release v$Version"""
if (-not $DryRun) {
    git -C $ROOT_DIR tag -a "v$Version" -m "Release v$Version"
    Write-Output "  created tag: v$Version"
} else {
    Write-Output "  [dry-run] would create tag"
}

# 6. Summary
Write-Output ""
Write-Output "=== Release v$Version prepared ==="
Write-Output ""
Write-Output "Next steps:"
Write-Output "  1. Review CHANGELOG.md and update the placeholder entry"
Write-Output "  2. Push the tag:       git push origin v$Version"
Write-Output "  3. Merge to main:      git checkout main && git merge develop && git push origin main"
Write-Output "  4. Or push both:       git push origin main v$Version"
Write-Output ""
Write-Output "The GitHub Actions workflow will auto-create the release when main is pushed."
