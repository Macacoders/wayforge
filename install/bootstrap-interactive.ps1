#!/usr/bin/env pwsh
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BOOTSTRAP_PS1 = Join-Path $PSScriptRoot 'bootstrap.ps1'

function log {
    param([string]$Message)
    Write-Host "[ai-config] $Message"
}

function usage {
    @'
Usage:
  .\install\bootstrap-interactive.ps1 [<target-repo-path>]

Guided interactive installer that collects safe preset choices and invokes
install/bootstrap.ps1.

If <target-repo-path> is provided, it is used as the default target
repository path. Otherwise, the current directory is used as default.
'@ | Write-Host
}

function contains_provider {
    param([string]$List, [string]$Needle)
    $items = $List -split ','
    foreach ($item in $items) {
        $item = $item.Trim()
        if ($item -eq $Needle) {
            return $true
        }
    }
    return $false
}

function prompt_menu_choice {
    param([string]$Prompt, [string]$Default)
    while ($true) {
        $value = Read-Host "${Prompt} [$Default]"
        if ([string]::IsNullOrWhiteSpace($value)) {
            $value = $Default
        }
        if ($value -match '^[0-9]+$') {
            return $value
        }
        log 'please enter a number'
    }
}

# Accept optional positional argument as target repo path
$POSITIONAL_REPO = $null
if ($args.Count -gt 0) {
    if ($args[0] -eq '-h' -or $args[0] -eq '-Help' -or $args[0] -eq '--help') {
        usage
        exit 0
    }
    $POSITIONAL_REPO = $args[0]
    if (-not (Test-Path $POSITIONAL_REPO -PathType Container)) {
        log "warning: specified path does not exist or is not a directory: $POSITIONAL_REPO"
        log "will fall back to current directory prompt"
        $POSITIONAL_REPO = $null
    }
}

# Check bootstrap.ps1 exists
if (-not (Test-Path $BOOTSTRAP_PS1 -PathType Leaf)) {
    log "error: missing installer script: $BOOTSTRAP_PS1"
    exit 1
}

# Target repository path
$DEFAULT_REPO = if ($POSITIONAL_REPO) { $POSITIONAL_REPO } else { (Get-Location).Path }
while ($true) {
    $REPO_PATH = Read-Host "Target repository path [$DEFAULT_REPO]"
    if ([string]::IsNullOrWhiteSpace($REPO_PATH)) {
        $REPO_PATH = $DEFAULT_REPO
    }
    if (Test-Path $REPO_PATH -PathType Container) {
        break
    }
    log "path does not exist or is not a directory: $REPO_PATH"
}

# Runtime selection
Write-Host "`nRuntime:"
Write-Host '  1) opencode (default)'
Write-Host '  2) kilocode'
$RUNTIME_CHOICE = prompt_menu_choice 'Choose runtime' '1'
switch ($RUNTIME_CHOICE) {
    '1' { $RUNTIME = 'opencode' }
    '2' { $RUNTIME = 'kilocode' }
    default { log "invalid runtime selection: $RUNTIME_CHOICE"; exit 1 }
}

# Provider set selection
if ($RUNTIME -eq 'opencode') {
    Write-Host "`nProvider set:"
    Write-Host '  1) free-tier (default, no external provider)'
    Write-Host '  2) openai'
    Write-Host '  3) github-copilot'
    Write-Host '  4) laberit'
    Write-Host '  5) opencode-go'
    Write-Host '  6) openai,github-copilot'
    Write-Host '  7) openai,laberit'
    Write-Host '  8) github-copilot,laberit'
    Write-Host '  9) openai,github-copilot,laberit'
    $PROVIDER_CHOICE = prompt_menu_choice 'Choose provider set' '1'
    switch ($PROVIDER_CHOICE) {
        '1' { $PROVIDERS = 'free-tier' }
        '2' { $PROVIDERS = 'openai' }
        '3' { $PROVIDERS = 'github-copilot' }
        '4' { $PROVIDERS = 'laberit' }
        '5' { $PROVIDERS = 'opencode-go' }
        '6' { $PROVIDERS = 'openai,github-copilot' }
        '7' { $PROVIDERS = 'openai,laberit' }
        '8' { $PROVIDERS = 'github-copilot,laberit' }
        '9' { $PROVIDERS = 'openai,github-copilot,laberit' }
        default { log "invalid provider selection: $PROVIDER_CHOICE"; exit 1 }
    }
} else {
    Write-Host "`nProvider set:"
    Write-Host '  1) openai (default)'
    Write-Host '  2) github-copilot'
    Write-Host '  3) laberit'
    Write-Host '  4) opencode-go'
    Write-Host '  5) openai,github-copilot'
    Write-Host '  6) openai,laberit'
    Write-Host '  7) github-copilot,laberit'
    Write-Host '  8) openai,github-copilot,laberit'
    $PROVIDER_CHOICE = prompt_menu_choice 'Choose provider set' '1'
    switch ($PROVIDER_CHOICE) {
        '1' { $PROVIDERS = 'openai' }
        '2' { $PROVIDERS = 'github-copilot' }
        '3' { $PROVIDERS = 'laberit' }
        '4' { $PROVIDERS = 'opencode-go' }
        '5' { $PROVIDERS = 'openai,github-copilot' }
        '6' { $PROVIDERS = 'openai,laberit' }
        '7' { $PROVIDERS = 'github-copilot,laberit' }
        '8' { $PROVIDERS = 'openai,github-copilot,laberit' }
        default { log "invalid provider selection: $PROVIDER_CHOICE"; exit 1 }
    }
}

# Model preset
Write-Host "`nModel preset:"
Write-Host '  1) installer defaults (recommended)'
Write-Host '  2) faster responses'
$MODEL_PRESET_CHOICE = prompt_menu_choice 'Choose model preset' '1'
$MODEL_OVERRIDE = ''
$SMALL_MODEL_OVERRIDE = ''
switch ($MODEL_PRESET_CHOICE) {
    '1' {
        # No overrides; use installer defaults
    }
    '2' {
        if (contains_provider $PROVIDERS 'openai') {
            $MODEL_OVERRIDE = 'openai/gpt-5.4-mini'
        } elseif (contains_provider $PROVIDERS 'github-copilot') {
            $MODEL_OVERRIDE = 'github-copilot/gpt-5.3-codex'
        } elseif (contains_provider $PROVIDERS 'opencode-go') {
            $MODEL_OVERRIDE = 'opencode-go/deepseek-v4-flash'
        } elseif (contains_provider $PROVIDERS 'laberit') {
            $MODEL_OVERRIDE = 'laberit/laberit-ai'
        }

        if (contains_provider $PROVIDERS 'github-copilot') {
            $SMALL_MODEL_OVERRIDE = 'github-copilot/gemini-3.5-flash'
        } elseif (contains_provider $PROVIDERS 'openai') {
            $SMALL_MODEL_OVERRIDE = 'openai/gpt-5.4-mini'
        } elseif (contains_provider $PROVIDERS 'opencode-go') {
            $SMALL_MODEL_OVERRIDE = 'opencode-go/deepseek-v4-flash'
        } elseif (contains_provider $PROVIDERS 'laberit') {
            $SMALL_MODEL_OVERRIDE = 'laberit/laberit-ai'
        }
    }
    default {
        log "invalid model preset selection: $MODEL_PRESET_CHOICE"
        exit 1
    }
}

# Agent preset
Write-Host "`nAgent preset:"
Write-Host '  1) balanced (default)'
Write-Host '  2) fast'
Write-Host '  3) thorough'
$AGENT_PRESET_CHOICE = prompt_menu_choice 'Choose agent preset' '1'
switch ($AGENT_PRESET_CHOICE) {
    '1' { $AGENT_PRESET = 'balanced' }
    '2' { $AGENT_PRESET = 'fast' }
    '3' { $AGENT_PRESET = 'thorough' }
    default { log "invalid agent preset selection: $AGENT_PRESET_CHOICE"; exit 1 }
}

# Dry run
Write-Host "`nDry run:"
Write-Host '  1) no (default)'
Write-Host '  2) yes'
$DRY_RUN_CHOICE = prompt_menu_choice 'Enable dry run' '1'
switch ($DRY_RUN_CHOICE) {
    '1' { $DRY_RUN = $false }
    '2' { $DRY_RUN = $true }
    default { log "invalid dry-run selection: $DRY_RUN_CHOICE"; exit 1 }
}

# Force refresh managed files
Write-Host "`nForce refresh managed files:"
Write-Host '  1) no (default)'
Write-Host '  2) yes'
$FORCE_CHOICE = prompt_menu_choice 'Enable force' '1'
switch ($FORCE_CHOICE) {
    '1' { $FORCE = $false }
    '2' { $FORCE = $true }
    default { log "invalid force selection: $FORCE_CHOICE"; exit 1 }
}

# Provider connection instructions
Write-Host "`nProvider connection instructions (not automated):"
if (contains_provider $PROVIDERS 'openai') {
    Write-Host '  - OpenAI: in OpenCode/Kilo Code, run /connect and complete OpenAI auth.'
}
if (contains_provider $PROVIDERS 'github-copilot') {
    Write-Host '  - GitHub Copilot: in OpenCode/Kilo Code, run /connect and complete device login.'
}
if (contains_provider $PROVIDERS 'laberit') {
    Write-Host '  - laberit: set OPENAI_BASE_URL and OPENAI_API_KEY in your local environment before use.'
}
if (contains_provider $PROVIDERS 'opencode-go') {
    Write-Host '  - OpenCode Go: in OpenCode/Kilo Code, run /connect and complete OpenCode Go auth.'
}

# Build command arguments
$cmd = @(
    '-Repo', $REPO_PATH,
    '-Runtime', $RUNTIME,
    '-Providers', $PROVIDERS
)
if ($MODEL_OVERRIDE) { $cmd += '-Model'; $cmd += $MODEL_OVERRIDE }
if ($SMALL_MODEL_OVERRIDE) { $cmd += '-SmallModel'; $cmd += $SMALL_MODEL_OVERRIDE }
if ($AGENT_PRESET -ne 'balanced') { $cmd += '-AgentPreset'; $cmd += $AGENT_PRESET }
if ($DRY_RUN) { $cmd += '-DryRun' }
if ($FORCE) { $cmd += '-Force' }

# Summary
Write-Host "`nSummary:"
Write-Host "  Repo: $REPO_PATH"
Write-Host "  Runtime: $RUNTIME"
Write-Host "  Providers: $PROVIDERS"
if ($MODEL_OVERRIDE) {
    Write-Host "  Model override: $MODEL_OVERRIDE"
} else {
    Write-Host '  Model override: none (installer default)'
}
if ($SMALL_MODEL_OVERRIDE) {
    Write-Host "  Small model override: $SMALL_MODEL_OVERRIDE"
} else {
    Write-Host '  Small model override: none (installer default)'
}
Write-Host "  Agent preset: $AGENT_PRESET"
Write-Host "  Dry run: $(if ($DRY_RUN) { 1 } else { 0 })"
Write-Host "  Force: $(if ($FORCE) { 1 } else { 0 })"

# Confirmation
$proceed = Read-Host "`nProceed with install? [Y/n]"
if ([string]::IsNullOrWhiteSpace($proceed)) { $proceed = 'Y' }
if ($proceed -in 'y', 'Y', 'yes', 'YES') {
    # proceed
} else {
    log 'cancelled'
    exit 0
}

# Execute bootstrap.ps1 with collected flags
& $BOOTSTRAP_PS1 @cmd
