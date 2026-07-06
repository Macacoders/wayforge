# Source this file from your PowerShell profile to expose ai-config helper functions.
# Add this line to your profile (run `notepad $PROFILE` to edit):
# . "C:\path\to\ai-config\install\powershell_profile_snippet.ps1"
# Note: these functions delegate to install/bootstrap.ps1 (deprecated) and
# install/uninstall.ps1 (deprecated). Consider using the TypeScript CLI directly:
#   npx tsx cli/src/index.ts install --repo <path> --providers <list>

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

function Invoke-AIConfigScript {
    <#
    .SYNOPSIS
        Private helper: validates RepoPath and invokes an installer script.
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepoPath,

        [Parameter(Mandatory=$true)]
        [string]$ScriptName,

        [switch]$DryRun
    )

    if (-not (Test-Path $RepoPath -PathType Container)) {
        Write-Error "error: repo path does not exist: $RepoPath"
        return 1
    }

    $root = Get-AIConfigRoot
    $scriptPath = "$root\install\$ScriptName.ps1"

    if ($DryRun) {
        & $scriptPath -Repo $RepoPath -DryRun
    } else {
        & $scriptPath -Repo $RepoPath
    }
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

    return Invoke-AIConfigScript -RepoPath $RepoPath -ScriptName "bootstrap"
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

    return Invoke-AIConfigScript -RepoPath $RepoPath -ScriptName "bootstrap" -DryRun
}

Set-Alias -Name ai-setup-repo-dry-run -Value Install-AIConfigRepoDryRun

function Uninstall-AIConfigRepo {
    <#
    .SYNOPSIS
        Uninstall ai-config managed files from a target repository.
    
    .PARAMETER RepoPath
        Path to the target repository.
    
    .EXAMPLE
        Uninstall-AIConfigRepo -RepoPath C:\Projects\MyApp
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepoPath
    )

    return Invoke-AIConfigScript -RepoPath $RepoPath -ScriptName "uninstall"
}

Set-Alias -Name ai-uninstall-repo -Value Uninstall-AIConfigRepo

function Uninstall-AIConfigRepoDryRun {
    <#
    .SYNOPSIS
        Show what would be done when uninstalling ai-config (dry run).
    
    .PARAMETER RepoPath
        Path to the target repository.
    
    .EXAMPLE
        Uninstall-AIConfigRepoDryRun -RepoPath C:\Projects\MyApp
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepoPath
    )

    return Invoke-AIConfigScript -RepoPath $RepoPath -ScriptName "uninstall" -DryRun
}

Set-Alias -Name ai-uninstall-repo-dry-run -Value Uninstall-AIConfigRepoDryRun
