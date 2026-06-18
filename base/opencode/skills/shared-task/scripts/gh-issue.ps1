#!/usr/bin/env pwsh
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Show-Usage {
    @'
Usage:
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] check
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] labels-check
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] list
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] create <title> [--body-file <path>] [--label <name>]...
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] claim <issue-number>
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] assign <issue-number> <collaborator>
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] release <issue-number> [--blocked <reason>]
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] close <issue-number> [completion-summary]
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] prclose <issue-number> [completion-summary]
  gh-issue.ps1 [--repo OWNER/REPO|-R OWNER/REPO] raw <gh issue args...>
'@
}

$repo_root = (git rev-parse --show-toplevel 2>$null) | Select-Object -First 1
if (-not $repo_root) {
    $repo_root = Get-Location
}
$env:GH_CONFIG_DIR = if ($env:GH_CONFIG_DIR) { $env:GH_CONFIG_DIR } else { Join-Path $repo_root '.gh-config' }

$remaining = [System.Collections.Generic.List[string]]::new()
$explicitRepo = $null
for ($i = 0; $i -lt $args.Count; $i++) {
    $arg = $args[$i]
    if ($arg -eq '--repo' -or $arg -eq '-R') {
        if ($i + 1 -ge $args.Count) {
            throw "Error: $arg requires OWNER/REPO value."
        }
        $explicitRepo = $args[$i + 1]
        $i++
        continue
    }
    if ($arg -match '^--repo=(.+)$' -or $arg -match '^-R=(.+)$') {
        $explicitRepo = $Matches[1]
        continue
    }
    $remaining.Add($arg)
}

if ($remaining.Count -eq 0) {
    Show-Usage
    exit 1
}

if ($explicitRepo) {
    $repo = $explicitRepo
} elseif ($env:GH_REPO) {
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

function Invoke-GhIssue {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$IssueArgs)
    $subcommand = $IssueArgs[0]
    $remainingArgs = @()
    if ($IssueArgs.Count -gt 1) {
        $remainingArgs = $IssueArgs[1..($IssueArgs.Count - 1)]
    }
    $output = gh issue $subcommand --repo $repo @remainingArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gh issue $subcommand failed (exit $LASTEXITCODE)"
    }
    return $output
}

function Get-GhRepoLabels {
    $output = gh api "repos/$repo/labels" --paginate --jq '.[].name'
    if ($LASTEXITCODE -ne 0) {
        throw "gh api repo labels query failed (exit $LASTEXITCODE)"
    }
    return $output
}

$requiredLabels = @(
    'status:to-do',
    'status:doing',
    'status:in-review',
    'status:blocked',
    'type:task',
    'type:feature',
    'type:bug',
    'type:docs',
    'type:chore',
    'priority:high',
    'priority:medium',
    'priority:low'
)

function Get-MissingRequiredLabels {
    $existing = Get-GhRepoLabels
    $set = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($line in ($existing -split "`r?`n")) {
        if ($line) { [void]$set.Add($line) }
    }

    $missing = [System.Collections.Generic.List[string]]::new()
    foreach ($label in $requiredLabels) {
        if (-not $set.Contains($label)) {
            $missing.Add($label)
        }
    }

    return $missing
}

function Ensure-RequiredLabels {
    $missing = @(Get-MissingRequiredLabels)
    if ($missing.Count -gt 0) {
        throw ('Error: missing required labels: ' + ($missing -join ', '))
    }
}

function Get-IssueState([string]$Issue) {
    Invoke-GhIssue view $Issue --json state --jq '.state'
}

function Get-IssueAssigneeCount([string]$Issue) {
    Invoke-GhIssue view $Issue --json assignees --jq '.assignees | length'
}

function Get-IssueFirstAssignee([string]$Issue) {
    $json = Invoke-GhIssue view $Issue --json assignees --jq '.assignees[0].login'
    if (-not $json) { return '' }
    return "$json"
}

function Test-IssueLabel([string]$Issue, [string]$Label) {
    $json = Invoke-GhIssue view $Issue --json labels --jq '[.labels[].name]'
    $labels = $json | ConvertFrom-Json
    return $labels -contains $Label
}

function Ensure-LabelPresent([string]$Issue, [string]$Label) {
    if (-not (Test-IssueLabel $Issue $Label)) {
        Invoke-GhIssue edit $Issue --add-label $Label | Out-Null
    }
}

function Ensure-LabelAbsent([string]$Issue, [string]$Label) {
    if (Test-IssueLabel $Issue $Label) {
        Invoke-GhIssue edit $Issue --remove-label $Label | Out-Null
    }
}

function Ensure-OpenIssue([string]$Issue) {
    if ((Get-IssueState $Issue) -ne 'OPEN') {
        throw "Error: issue #$Issue is not open."
    }
}

function Get-CurrentUser {
    $result = gh api user --jq '.login'
    if ($LASTEXITCODE -ne 0) {
        throw "gh api user query failed (exit $LASTEXITCODE)"
    }
    return "$result"
}

$command = $remaining[0]
$rangeResult = $remaining.GetRange(1, $remaining.Count - 1)
$rest = [string[]]$rangeResult

switch ($command) {
    'check' {
        $null = gh api "repos/$repo" --jq '.full_name'
        if ($LASTEXITCODE -ne 0) {
            throw "Error: GitHub access check failed for $repo (exit $LASTEXITCODE)"
        }
        Write-Output "OK: GitHub access verified for $repo"
    }
    'labels-check' {
        $missing = @(Get-MissingRequiredLabels)
        if ($missing.Count -gt 0) {
            Write-Error ("Missing required labels in ${repo}:`n  - " + ($missing -join "`n  - "))
            exit 1
        }
        Write-Output "OK: all required labels are present in $repo"
    }
    'list' {
        Ensure-RequiredLabels
        $json = gh issue list --repo $repo --state open --limit 100 --json number,title,assignees,labels
        if ($LASTEXITCODE -ne 0) {
            throw "gh issue list failed (exit $LASTEXITCODE)"
        }
        $issues = $json | ConvertFrom-Json
        foreach ($issue in $issues) {
            $assignee = if ($issue.assignees.Count -gt 0) { ($issue.assignees.login -join ',') } else { '-' }
            $statusLabel = $issue.labels | Where-Object { $_.name -like 'status:*' } | ForEach-Object { $_.name }
            $status = if ($statusLabel) { $statusLabel -join ',' } else { '-' }
            "#$($issue.number)`t$($issue.title)`tassignee:$assignee`t$status"
        }
    }
    'create' {
        Ensure-RequiredLabels
        if ($rest.Length -lt 1) { throw 'Error: create requires <title>.' }
        $title = $rest[0]

        $bodyFile = $null
        $labels = [System.Collections.Generic.List[string]]::new()
        for ($i = 1; $i -lt $rest.Length; $i++) {
            $arg = $rest[$i]
            if ($arg -eq '--body-file') {
                if ($i + 1 -ge $rest.Length) { throw 'Error: --body-file requires a path.' }
                $bodyFile = $rest[$i + 1]
                $i++
                continue
            }
            if ($arg -match '^--body-file=(.+)$') {
                $bodyFile = $Matches[1]
                continue
            }
            if ($arg -eq '--label') {
                if ($i + 1 -ge $rest.Length) { throw 'Error: --label requires a value.' }
                $labels.Add($rest[$i + 1])
                $i++
                continue
            }
            if ($arg -match '^--label=(.+)$') {
                $labels.Add($Matches[1])
                continue
            }
            throw "Error: unknown create option: $arg"
        }

        $createArgs = [System.Collections.Generic.List[string]]::new()
        $createArgs.Add('create')
        $createArgs.Add('--title')
        $createArgs.Add($title)
        if ($bodyFile) {
            $createArgs.Add('--body-file')
            $createArgs.Add($bodyFile)
        }
        foreach ($label in $labels) {
            $createArgs.Add('--label')
            $createArgs.Add($label)
        }

        Invoke-GhIssue @createArgs
    }
    'claim' {
        Ensure-RequiredLabels
        if ($rest.Length -lt 1) { throw 'Error: claim requires <issue-number>.' }
        $issue = $rest[0]
        Ensure-OpenIssue $issue

        if ((Get-IssueAssigneeCount $issue) -ne '0') {
            $assignee = Get-IssueFirstAssignee $issue
            throw "Error: issue #$issue is already assigned to @$assignee."
        }
        if (Test-IssueLabel $issue 'status:doing') {
            throw "Error: issue #$issue already has status:doing."
        }

        $me = Get-CurrentUser
        Invoke-GhIssue edit $issue --add-assignee $me | Out-Null
        Ensure-LabelPresent $issue 'status:doing'
        Ensure-LabelAbsent $issue 'status:to-do'
        Invoke-GhIssue comment $issue --body "Claimed by @$me and starting work." | Out-Null
    }
    'assign' {
        Ensure-RequiredLabels
        if ($rest.Length -lt 2) { throw 'Error: assign requires <issue-number> <collaborator>.' }
        $issue = $rest[0]
        $collaborator = $rest[1]
        Ensure-OpenIssue $issue

        if ((Get-IssueAssigneeCount $issue) -ne '0') {
            $assignee = Get-IssueFirstAssignee $issue
            throw "Error: issue #$issue is already assigned to @$assignee."
        }
        if (Test-IssueLabel $issue 'status:doing') {
            throw "Error: issue #$issue already has status:doing."
        }

        Invoke-GhIssue edit $issue --add-assignee $collaborator | Out-Null
        Ensure-LabelPresent $issue 'status:doing'
        Ensure-LabelAbsent $issue 'status:to-do'
        Invoke-GhIssue comment $issue --body "Assigned to @$collaborator and marked status:doing." | Out-Null
    }
    'release' {
        Ensure-RequiredLabels
        if ($rest.Length -lt 1) { throw 'Error: release requires <issue-number>.' }
        $issue = $rest[0]
        $blockedReason = $null
        if ($rest.Length -gt 1) {
            if ($rest.Length -eq 3 -and $rest[1] -eq '--blocked') {
                $blockedReason = $rest[2]
            } else {
                throw 'Error: release accepts only optional --blocked <reason>.'
            }
        }

        Ensure-OpenIssue $issue
        $me = Get-CurrentUser
        $assignee = Get-IssueFirstAssignee $issue
        if ($assignee -and $assignee -ne $me) {
            throw "Error: issue #$issue is assigned to @$assignee (not @$me)."
        }
        if ($assignee -eq $me) {
            Invoke-GhIssue edit $issue --remove-assignee $me | Out-Null
        }

        Ensure-LabelAbsent $issue 'status:doing'

        if ($blockedReason) {
            Ensure-LabelAbsent $issue 'status:to-do'
            Ensure-LabelPresent $issue 'status:blocked'
            Invoke-GhIssue comment $issue --body "Released by @$me. Blocked: $blockedReason" | Out-Null
        } else {
            Ensure-LabelAbsent $issue 'status:blocked'
            Ensure-LabelAbsent $issue 'status:in-review'
            Ensure-LabelPresent $issue 'status:to-do'
            Invoke-GhIssue comment $issue --body "Released by @$me and returned to status:to-do." | Out-Null
        }
    }
    'close' {
        Ensure-RequiredLabels
        if ($rest.Length -lt 1) { throw 'Error: close requires <issue-number>.' }
        $issue = $rest[0]
        $summary = if ($rest.Length -gt 1) { ($rest[1..($rest.Length - 1)] -join ' ') } else { 'Completed and validated.' }
        Ensure-OpenIssue $issue

        Invoke-GhIssue comment $issue --body $summary | Out-Null
        Ensure-LabelAbsent $issue 'status:doing'
        Ensure-LabelAbsent $issue 'status:to-do'
        Ensure-LabelAbsent $issue 'status:in-review'
        Ensure-LabelAbsent $issue 'status:blocked'
        Invoke-GhIssue close $issue | Out-Null
    }
    'prclose' {
        Ensure-RequiredLabels
        if ($rest.Length -lt 1) { throw 'Error: prclose requires <issue-number>.' }
        $issue = $rest[0]
        $summary = if ($rest.Length -gt 1) { ($rest[1..($rest.Length - 1)] -join ' ') } else { 'Ready for review via PR.' }
        Ensure-OpenIssue $issue

        $branch = (git rev-parse --abbrev-ref HEAD 2>$null) | Select-Object -First 1
        if (-not $branch -or $branch -eq 'HEAD') {
            throw 'Error: prclose requires an active local branch.'
        }
        $issueTitle = Invoke-GhIssue view $issue --json title --jq '.title'
        $protectedBranch = $false
        if ($branch -in @('main', 'master', 'develop')) {
            $protectedBranch = $true
            # Generate slug from issue title
            $slug = ($issueTitle.ToLower() -replace '[^a-z0-9\s-]', '') -replace '\s+', '-' -replace '-{2,}', '-' -replace '^-|-$', ''
            if ($slug.Length -gt 60) { $slug = $slug.Substring(0, 60) -replace '-$', '' }
            $featureBranch = "feature/issue-$issue-$slug"
            Write-Output "On protected branch '$branch'. Creating feature branch '$featureBranch'..."
            git checkout -b $featureBranch
            git add -A
            git commit -m "[Issue #$issue] $issueTitle"
            git push -u origin $featureBranch
            $branch = $featureBranch
        }

        if (-not $protectedBranch) {
            $dirty = git status --porcelain
            if ($dirty) {
                throw 'Error: prclose requires a clean working tree. Commit or stash changes first.'
            }
        }
        $prBody = "Fixes #${issue}`n`n## Summary`n`n_Describe the purpose and scope of this change._`n`n## Testing`n`n_Describe how you validated this change. List tests run, commands executed, or review scenarios checked._`n`n## Breaking changes`n`nNone."
        $me = gh api user --jq '.login' 2>$null
        if ($LASTEXITCODE -ne 0) { throw "gh api user query failed (exit $LASTEXITCODE)" }
        $prUrl = gh pr create --repo $repo --title "[Issue #$issue] '$issueTitle'" --body $prBody --assignee $me
        if ($LASTEXITCODE -ne 0) {
            throw "Error: gh pr create failed (exit $LASTEXITCODE)"
        }

        Invoke-GhIssue comment $issue --body ($summary + "`n`nPull request: $prUrl") | Out-Null
        Ensure-LabelAbsent $issue 'status:doing'
        Ensure-LabelAbsent $issue 'status:to-do'
        Ensure-LabelAbsent $issue 'status:blocked'
        Ensure-LabelPresent $issue 'status:in-review'
    }
    'raw' {
        if ($rest.Length -eq 0) { throw 'Error: raw requires <gh issue args...>.' }
        Invoke-GhIssue @rest
    }
    default {
        throw "Error: unknown command: $command"
    }
}
