#!/usr/bin/env pwsh
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo_root = (git rev-parse --show-toplevel 2>$null) | Select-Object -First 1
if (-not $repo_root) {
    $repo_root = Get-Location
}
$env:GH_CONFIG_DIR = if ($env:GH_CONFIG_DIR) { $env:GH_CONFIG_DIR } else { Join-Path $repo_root '.gh-config' }

$has_explicit_repo = $false
$prev_arg = ''
foreach ($arg in $args) {
    if ($prev_arg -eq '--repo' -or $prev_arg -eq '-R') {
        $has_explicit_repo = $true
        break
    }
    if ($arg -match '^--repo=.*' -or $arg -match '^-R=.*') {
        $has_explicit_repo = $true
        break
    }
    $prev_arg = $arg
}

if ($has_explicit_repo) {
    gh issue @args
    exit $LASTEXITCODE
}

if ($env:GH_REPO) {
    $repo = $env:GH_REPO
} else {
    $origin_url = (git remote get-url origin 2>$null) | Select-Object -First 1
    if (-not $origin_url) {
        Write-Error 'Error: GH_REPO is not set and git remote origin is unavailable.'
        exit 1
    }

    if ($origin_url -match '^git@github.com:(.+)$') {
        $repo = $Matches[1]
    } elseif ($origin_url -match '^https://github.com/(.+)$') {
        $repo = $Matches[1]
    } elseif ($origin_url -match '^http://github.com/(.+)$') {
        $repo = $Matches[1]
    } elseif ($origin_url -match '^ssh://git@github.com/(.+)$') {
        $repo = $Matches[1]
    } else {
        Write-Error "Error: unsupported origin URL format: $origin_url"
        exit 1
    }

    $repo = $repo -replace '\.git$', ''
}

gh issue --repo $repo @args
exit $LASTEXITCODE
