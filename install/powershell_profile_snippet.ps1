# Source this file from your PowerShell profile to expose ai-config helper functions.
# Add this line to your profile (run `notepad $PROFILE` to edit):
# . "C:\path\to\ai-config\install\powershell_profile_snippet.ps1"

function Get-AIConfigRoot {
    <#
    .SYNOPSIS
        Returns the root directory of the ai-config repository.
    #>
    if ($env:AI_CONFIG_HOME -and (Test-Path $env:AI_CONFIG_HOME -PathType Container)) {
        return $env:AI_CONFIG_HOME
    }

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    return Resolve-Path (Join-Path $scriptDir '..') | Select-Object -ExpandProperty Path
}

function Install-AIConfigRepo {
    <#
    .SYNOPSIS
        Bootstrap ai-config into a target repository.
    
    .PARAMETER RepoPath
        Path to the target repository.
    
    .EXAMPLE
        Install-AIConfigRepo -RepoPath C:\Projects\MyApp
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = Get-AIConfigRoot
    & "$root\install\bootstrap.ps1" -Repo $RepoPath
}

Set-Alias -Name ai-setup-repo -Value Install-AIConfigRepo

function Install-AIConfigRepoDryRun {
    <#
    .SYNOPSIS
        Show what would be done when bootstrapping ai-config (dry run).
    
    .PARAMETER RepoPath
        Path to the target repository.
    
    .EXAMPLE
        Install-AIConfigRepoDryRun -RepoPath C:\Projects\MyApp
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepoPath
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = Get-AIConfigRoot
    & "$root\install\bootstrap.ps1" -Repo $RepoPath -DryRun
}

Set-Alias -Name ai-setup-repo-dry-run -Value Install-AIConfigRepoDryRun
