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

function run-copytree {
    param(
        [string]$Src,
        [string]$Dst
    )
    if ($DRY_RUN) {
        log "DRY-RUN: Copy-Item -Path $Src -Destination $Dst -Recurse"
        return
    }
    Copy-Item -Path $Src -Destination $Dst -Recurse
}

function run-copyfile {
    param(
        [string]$Src,
        [string]$Dst
    )
    if ($DRY_RUN) {
        log "DRY-RUN: Copy-Item -Path $Src -Destination $Dst"
        return
    }
    Copy-Item -Path $Src -Destination $Dst -Force
}

function run-rmrf {
    param([string]$Path)
    if ($DRY_RUN) {
        log "DRY-RUN: Remove-Item -Path $Path -Recurse -Force"
        return
    }
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force
    }
}

function run-writefile {
    param(
        [string]$Path,
        [string]$Content
    )
    if ($DRY_RUN) {
        log "DRY-RUN: write file $Path"
        return
    }
    [System.IO.File]::WriteAllText($Path, $Content)
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

function Is-ManagedOpenCodeFile {
    param([string]$Path)
    if (-not (Test-Path $Path -PathType Leaf)) {
        return $false
    }

    $firstLine = Get-Content -Path $Path -TotalCount 1 -ErrorAction SilentlyContinue
    return ($firstLine -eq $MANAGED_OPENCODE_HEADER)
}

function Is-ManagedDir {
    param([string]$Path)

    # Check 1: old per-directory marker
    if (Test-Path (Join-Path $Path $MANAGED_DIR_MARKER) -PathType Leaf) {
        return $true
    }

    # Check 2: new unified manifest by walking up parent directories
    $dir = $Path
    while ($true) {
        $manifestPath = Join-Path $dir '.ai-config-managed'
        if (Test-Path $manifestPath -PathType Leaf) {
            $relPath = $Path.Substring($dir.Length).TrimStart('\', '/').Replace('\', '/')
            if (-not [string]::IsNullOrEmpty($relPath)) {
                $lines = [System.IO.File]::ReadAllLines($manifestPath)
                $match = "  - $relPath"
                if ($lines -contains $match) {
                    return $true
                }
                # Check if any managed path starts with this directory
                $prefix = "  - $relPath/"
                if ($lines | Where-Object { $_.StartsWith($prefix) }) {
                    return $true
                }
            }
            return $false
        }
        $parent = Split-Path -Parent $dir
        if ($parent -eq $dir) { break }
        $dir = $parent
    }

    return $false
}

function Is-ManagedFile {
    param([string]$Path)

    # Check 1: old per-file sidecar marker
    if (Test-Path "${Path}.ai-config-managed" -PathType Leaf) {
        return $true
    }

    # Check 2: new unified manifest by walking up parent directories
    $dir = Split-Path -Parent $Path
    while ($true) {
        $manifestPath = Join-Path $dir '.ai-config-managed'
        if (Test-Path $manifestPath -PathType Leaf) {
            $relPath = $Path.Substring($dir.Length).TrimStart('\', '/').Replace('\', '/')
            if (-not [string]::IsNullOrEmpty($relPath)) {
                $lines = [System.IO.File]::ReadAllLines($manifestPath)
                $match = "  - $relPath"
                if ($lines -contains $match) {
                    return $true
                }
            }
            return $false
        }
        $parent = Split-Path -Parent $dir
        if ($parent -eq $dir) { break }
        $dir = $parent
    }

    return $false
}

# Script-scoped variable: set by Init-ManagedManifest, used by sync functions to track paths
$script:_ManagedRepoRoot = $null

# Script-scoped array: populated by Read-ManagedManifest with managed paths from existing install
$script:_ManagedManifestPaths = @()

# Internal helper: record a managed file either in the manifest accumulator
# or by writing the old per-file sidecar marker (fallback).
function _ManagedTrackFile {
    param([string]$DstFile)

    if ($script:_ManagedRepoRoot -and (Test-Path (Join-Path $script:_ManagedRepoRoot '.ai-config-managed.tmp') -PathType Leaf)) {
        $repoRoot = $script:_ManagedRepoRoot
        if ($DstFile.StartsWith("$repoRoot\")) {
            $rel = $DstFile.Substring($repoRoot.Length).TrimStart('\', '/').Replace('\', '/')
            Add-ManagedPath -Repo $repoRoot -Path $rel
            return
        }
    }
    run-writefile "${DstFile}.ai-config-managed" 'generated-by=ai-config-bootstrap.sh'
}

# Initialize a managed manifest accumulator for a repo install.
# Creates a temporary file at $Repo/.ai-config-managed.tmp with version header.
# Optional third positional parameter: $Ref (tag/branch/commit) used to install.
function Init-ManagedManifest {
    param(
        [string]$Repo,
        [string]$Version,
        [string]$Ref
    )

    $script:_ManagedRepoRoot = $Repo
    $manifestTmp = Join-Path $Repo '.ai-config-managed.tmp'

    if ($DRY_RUN) {
        log "DRY-RUN: would initialize managed manifest at $manifestTmp"
        return
    }

    if (-not [string]::IsNullOrEmpty($Ref)) {
        $header = "# Generated by ai-config v$Version (ref: $Ref)
version: $Version
ref: $Ref
managed_paths:
"
    } else {
        $header = "# Generated by ai-config v$Version
version: $Version
managed_paths:
"
    }
    [System.IO.File]::WriteAllText($manifestTmp, $header)
    log "initialized managed manifest: $manifestTmp"
}

# Add a relative path (from repo root) to the managed manifest accumulator.
# Skips duplicates silently.
function Add-ManagedPath {
    param(
        [string]$Repo,
        [string]$Path
    )

    $manifestTmp = Join-Path $Repo '.ai-config-managed.tmp'

    if (-not (Test-Path $manifestTmp -PathType Leaf)) {
        return
    }

    if ($DRY_RUN) {
        log "DRY-RUN: would add managed path: $Path"
        return
    }

    # Normalize path separator to forward slash for cross-platform compatibility
    $normalized = $Path.Replace('\', '/')

    # Skip duplicates
    $lines = [System.IO.File]::ReadAllLines($manifestTmp)
    $match = "  - $normalized"
    if ($lines -contains $match) {
        return
    }

    [System.IO.File]::AppendAllText($manifestTmp, "  - $normalized`r`n")
}

# Finalize the managed manifest: move temp file to final location,
# remove old per-file sidecar markers and old per-directory markers
# under the listed paths.
function Finalize-ManagedManifest {
    param([string]$Repo)

    $manifestTmp = Join-Path $Repo '.ai-config-managed.tmp'
    $manifestFinal = Join-Path $Repo '.ai-config-managed'

    if (-not (Test-Path $manifestTmp -PathType Leaf)) {
        $script:_ManagedRepoRoot = $null
        return
    }

    if ($DRY_RUN) {
        log "DRY-RUN: would finalize managed manifest at $manifestFinal"
        log "DRY-RUN: would remove old per-file markers under managed paths"
        $script:_ManagedRepoRoot = $null
        return
    }

    Move-Item -Path $manifestTmp -Destination $manifestFinal -Force
    log "finalized managed manifest: $manifestFinal"
    $script:_ManagedRepoRoot = $null

    # Remove old per-file sidecar markers for paths now tracked in the manifest
    $lines = [System.IO.File]::ReadAllLines($manifestFinal)
    foreach ($line in $lines) {
        if ($line -match '^  - (.+)$') {
            $managedPath = $matches[1]
            $sidecar = Join-Path $Repo "$managedPath.ai-config-managed"
            if (Test-Path $sidecar -PathType Leaf) {
                Remove-Item -Path $sidecar -Force
                log "removed old sidecar marker: $sidecar"
            }
        }
    }

    # Remove old per-directory markers (from Sync-ManagedTree) under managed paths.
    # Walk up from each managed file's directory to repo root to catch nested trees.
    $repoDir = $Repo
    foreach ($line in $lines) {
        if ($line -match '^  - (.+)$') {
            $managedPath = $matches[1]
            $dir = Split-Path -Parent (Join-Path $Repo $managedPath)
            while ($dir -ne $repoDir) {
                $dirMarker = Join-Path $dir $MANAGED_DIR_MARKER
                if ((Test-Path $dirMarker -PathType Leaf) -and $dirMarker -ne $manifestFinal) {
                    Remove-Item -Path $dirMarker -Force
                    log "removed old directory marker: $dirMarker"
                }
                $parent = Split-Path -Parent $dir
                if ($parent -eq $dir) { break }  # stop at filesystem root
                $dir = $parent
            }
        }
    }
}

# Check whether a relative path (from repo root) is managed.
# Consults both old per-file sidecar markers and the new unified manifest.
function Is-ManagedPath {
    param(
        [string]$Repo,
        [string]$Path
    )

    # Check 1: old per-file sidecar marker
    if (Test-Path (Join-Path $Repo "$Path.ai-config-managed") -PathType Leaf) {
        return $true
    }

    # Check 2: new unified manifest
    $manifest = Join-Path $Repo '.ai-config-managed'
    if (Test-Path $manifest -PathType Leaf) {
        $lines = [System.IO.File]::ReadAllLines($manifest)
        $match = "  - $($Path.Replace('\', '/'))"
        if ($lines -contains $match) {
            return $true
        }
    }

    return $false
}

function Sync-ManagedTree {
    param(
        [string]$Src,
        [string]$Dst,
        [bool]$ForceReplaceUnmanaged = $false
    )

    if (-not (Test-Path $Src -PathType Container)) {
        log "error: source directory does not exist: $Src"
        exit 1
    }

    $null = $ForceReplaceUnmanaged
    $script:SYNC_MANAGED_TREE_LAST_ACTION = 'skipped'
    $dstTreeExisted = $false
    $dstTreeWasManaged = $false

    if (Test-Path $Dst) {
        $item = Get-Item $Dst -ErrorAction SilentlyContinue
        if ($item -and $item.Attributes -match 'ReparsePoint') {
            log "skip conflict with existing symlink (preserving local content): $Dst -> $($item.Target)"
            return
        }

        if (-not $item.PSIsContainer) {
            log "skip conflict with non-directory path (preserving local content): $Dst"
            return
        }

        $dstTreeExisted = $true
        if (Is-ManagedDir $Dst) {
            $dstTreeWasManaged = $true
        }
    }

    ensure-dir $Dst

    # Skip per-directory marker when unified manifest accumulator is active
    $_manifestActive = $script:_ManagedRepoRoot -and (Test-Path (Join-Path $script:_ManagedRepoRoot '.ai-config-managed.tmp') -PathType Leaf)

    $dstMarker = Join-Path $Dst $MANAGED_DIR_MARKER
    if ((-not $dstTreeExisted -or $dstTreeWasManaged) -and -not (Test-Path $dstMarker -PathType Leaf) -and -not $_manifestActive) {
        run-writefile $dstMarker 'generated-by=ai-config-bootstrap.sh'
        if ($DRY_RUN) {
            log "DRY-RUN: would mark managed tree: $Dst"
        } else {
            log "marked managed tree: $Dst"
        }
    }

    Get-ChildItem -Path $Src -Recurse -File | ForEach-Object {
        $srcFile = $_.FullName
        $relPath = $srcFile.Substring($Src.Length).TrimStart('\', '/')
        $dstFile = Join-Path $Dst $relPath
        $dstParent = Split-Path -Parent $dstFile

        if (Test-Path $dstParent) {
            $dstParentItem = Get-Item $dstParent -ErrorAction SilentlyContinue
            if ($dstParentItem -and ($dstParentItem.Attributes -match 'ReparsePoint' -or -not $dstParentItem.PSIsContainer)) {
                log "skip conflict with non-directory parent (preserving local content): $dstParent"
                return
            }
        }

        ensure-dir $dstParent

        if (Test-Path $dstFile) {
            $dstItem = Get-Item $dstFile -ErrorAction SilentlyContinue
            if ($dstItem -and ($dstItem.Attributes -match 'ReparsePoint')) {
                if ((-not (Is-ManagedFile $dstFile)) -and (-not $dstTreeWasManaged)) {
                    log "skip conflict with unmanaged path (preserving local content): $dstFile"
                    return
                }
                run-rm $dstFile
                run-copyfile $srcFile $dstFile
                _ManagedTrackFile $dstFile
                $script:SYNC_MANAGED_TREE_LAST_ACTION = 'copied'
                if ($DRY_RUN) {
                    log "DRY-RUN: would refresh managed file: $dstFile"
                } else {
                    log "refreshed managed file: $dstFile"
                }
                return
            }

            if ($dstItem -and $dstItem.PSIsContainer) {
                log "skip conflict with non-file path (preserving local content): $dstFile"
                return
            }

            if ((-not (Is-ManagedFile $dstFile)) -and (-not $dstTreeWasManaged)) {
                log "skip conflict with unmanaged path (preserving local content): $dstFile"
                return
            }

            run-copyfile $srcFile $dstFile
            _ManagedTrackFile $dstFile
            $script:SYNC_MANAGED_TREE_LAST_ACTION = 'copied'
            if ($DRY_RUN) {
                log "DRY-RUN: would refresh managed file: $dstFile"
            } else {
                log "refreshed managed file: $dstFile"
            }
            return
        }

        run-copyfile $srcFile $dstFile
        _ManagedTrackFile $dstFile
        $script:SYNC_MANAGED_TREE_LAST_ACTION = 'copied'
        if ($DRY_RUN) {
            log "DRY-RUN: would create managed file: $dstFile"
        } else {
            log "created managed file: $dstFile"
        }
    }

    if ($SYNC_MANAGED_TREE_LAST_ACTION -eq 'skipped') {
        log "kept managed tree (no file changes): $Dst"
    }
}

function Get-AgentPermissionBlock {
    param(
        [string]$AgentName,
        [string]$PermissionsFile
    )

    $lines = [System.IO.File]::ReadAllLines($PermissionsFile)
    $inAgents = $false
    $agentsIndent = -1
    $capturingAgent = $false
    $targetAgentIndent = -1
    $captured = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $indent = $line.Length - $line.TrimStart(' ').Length
        $trimmed = $line.TrimStart(' ')

        if (-not $inAgents) {
            if ($trimmed -eq 'agents:') {
                $inAgents = $true
                $agentsIndent = $indent
            }
            continue
        }

        if ($indent -le $agentsIndent) {
            break
        }

        if ($indent -eq ($agentsIndent + 2) -and $trimmed -match '^([^:#]+):\s*$') {
            $currentAgent = $matches[1].TrimEnd()
            if ($currentAgent -eq $AgentName) {
                $capturingAgent = $true
                $targetAgentIndent = $indent
            } elseif ($capturingAgent) {
                break
            } else {
                $capturingAgent = $false
            }
            continue
        }

        if (-not $capturingAgent) {
            continue
        }

        if ($indent -le $targetAgentIndent) {
            break
        }

        if ($trimmed.StartsWith('#')) {
            continue
        }

        $captured.Add($line.Substring($targetAgentIndent + 1))
    }

    if ($captured.Count -eq 0) {
        return $null
    }

    return @('permission:') + $captured.ToArray()
}

function Render-AgentWithCentralPermissions {
    param(
        [string]$SrcFile,
        [string]$DstFile,
        [string]$AgentName,
        [string]$PermissionsFile
    )

    $permissionBlockLines = Get-AgentPermissionBlock -AgentName $AgentName -PermissionsFile $PermissionsFile
    if (-not $permissionBlockLines) {
        log "error: missing permissions in $PermissionsFile for agent '$AgentName'"
        exit 1
    }

    if ($DRY_RUN) {
        log "DRY-RUN: would render centralized permissions: $DstFile"
        return
    }

    $srcLines = [System.IO.File]::ReadAllLines($SrcFile)
    $output = New-Object System.Collections.Generic.List[string]
    $inFrontmatter = $false
    $frontmatterDone = $false
    $skippingPermission = $false
    $permissionIndent = -1
    $inserted = $false

    foreach ($line in $srcLines) {
        if ($line -eq '---') {
            if (-not $inFrontmatter) {
                $inFrontmatter = $true
                $output.Add($line)
                continue
            }

            if ($inFrontmatter -and -not $frontmatterDone) {
                if (-not $inserted) {
                    foreach ($permLine in $permissionBlockLines) {
                        $output.Add($permLine)
                    }
                    $inserted = $true
                }
                $frontmatterDone = $true
                $inFrontmatter = $false
                $output.Add($line)
                continue
            }
        }

        if (-not $inFrontmatter -or $frontmatterDone) {
            $output.Add($line)
            continue
        }

        $indent = $line.Length - $line.TrimStart(' ').Length
        $trimmed = $line.TrimStart(' ')

        if ($skippingPermission) {
            if ([string]::IsNullOrWhiteSpace($trimmed) -or $indent -gt $permissionIndent) {
                continue
            }
            $skippingPermission = $false
        }

        if (-not $inserted -and $trimmed -match '^description:\s') {
            $prefix = ' ' * $indent
            foreach ($permLine in $permissionBlockLines) {
                $output.Add("$prefix$permLine")
            }
            $inserted = $true
        }

        if ($trimmed -eq 'permission:') {
            $skippingPermission = $true
            $permissionIndent = $indent
            continue
        }

        $output.Add($line)
    }

    [System.IO.File]::WriteAllLines($DstFile, $output)
}

function Sync-AgentsTreeWithPermissions {
    param(
        [string]$SrcDir,
        [string]$DstDir,
        [string]$PermissionsFile
    )

    Sync-ManagedTree -Src $SrcDir -Dst $DstDir -ForceReplaceUnmanaged $true
    if ($SYNC_MANAGED_TREE_LAST_ACTION -ne 'copied') {
        return
    }

    Get-ChildItem -Path $SrcDir -Filter '*.md' -File | ForEach-Object {
        $agentName = $_.BaseName
        $dstFile = Join-Path $DstDir $_.Name
        if (-not (Is-ManagedFile $dstFile)) {
            log "skip conflict with unmanaged path (preserving local content): $dstFile"
            return
        }
        Render-AgentWithCentralPermissions -SrcFile $_.FullName -DstFile $dstFile -AgentName $agentName -PermissionsFile $PermissionsFile
    }
}

function Sync-ManagedFile {
    param(
        [string]$Src,
        [string]$Dst
    )

    if (-not (Test-Path $Src -PathType Leaf)) {
        log "error: source file does not exist: $Src"
        exit 1
    }

    if (Test-Path $Dst) {
        $item = Get-Item $Dst -ErrorAction SilentlyContinue
        if ($item -and $item.Attributes -match 'ReparsePoint') {
            if (-not $FORCE) {
                if (Is-ManagedFile $Dst) {
                    _ManagedTrackFile $Dst
                    log "kept existing managed file (tracked in manifest): $Dst"
                    return
                }
                log "keep existing file (use -Force to refresh managed file): $Dst"
                return
            }
            if (-not (Is-ManagedFile $Dst)) {
                log "skip conflict with unmanaged file (preserving local content): $Dst"
                return
            }
            run-rm $Dst
        } elseif (-not $FORCE) {
            if (Is-ManagedFile $Dst) {
                _ManagedTrackFile $Dst
                log "kept existing managed file (tracked in manifest): $Dst"
                return
            }
            log "keep existing file (use -Force to refresh managed file): $Dst"
            return
        } elseif (-not (Is-ManagedFile $Dst)) {
            log "skip conflict with unmanaged file (preserving local content): $Dst"
            return
        } else {
            run-rm $Dst
        }
    }

    $parent = Split-Path -Parent $Dst
    ensure-dir $parent
    run-copyfile $Src $Dst
    _ManagedTrackFile $Dst
    if ($DRY_RUN) {
        log "DRY-RUN: would copy managed file: $Dst"
    } else {
        log "copied managed file: $Dst"
    }
}

# Read an existing finalized manifest from a previous install.
# Parses .ai-config-managed from $Repo and populates $script:_ManagedManifestPaths.
# Returns $true on success (file found and parsed), $false if file does not exist.
function Read-ManagedManifest {
    param([string]$Repo)

    $script:_ManagedManifestPaths = @()
    $manifest = Join-Path $Repo '.ai-config-managed'

    if (-not (Test-Path $manifest -PathType Leaf)) {
        return $false
    }

    $lines = [System.IO.File]::ReadAllLines($manifest)
    $readingPaths = $false
    foreach ($line in $lines) {
        if ($line -eq 'managed_paths:') {
            $readingPaths = $true
            continue
        }
        if ($readingPaths) {
            if ($line -match '^  - (.+)$') {
                $path = $matches[1]
                $script:_ManagedManifestPaths += $path
            } elseif ([string]::IsNullOrWhiteSpace($line)) {
                $readingPaths = $false
            } elseif (-not $line.StartsWith(' ')) {
                $readingPaths = $false
            }
        }
    }

    return $true
}

# Sync a single managed path from the ai-config source tree.
# Maps the $RelativePath (from the manifest) to a source file in $RootDir
# and copies it to the destination repo using Sync-ManagedFile.
#
# Parameters:
#   $Repo         - target repository root
#   $RelativePath - path from manifest (e.g. ".opencode/agents/planner.md")
#   $RootDir      - ai-config repository root
function Sync-ManagedPathFromManifest {
    param(
        [string]$Repo,
        [string]$RelativePath,
        [string]$RootDir
    )

    $srcFile = $null

    if ($RelativePath -eq 'opencode.jsonc' -or $RelativePath -eq 'kilo.jsonc') {
        # These are regenerated by bootstrap separately; skip here
        return
    }

    if ($RelativePath -eq 'AGENTS.md') {
        $srcFile = Join-Path $RootDir 'templates\AGENTS.md'
    } elseif ($RelativePath.StartsWith('.opencode/agents/')) {
        $subpath = $RelativePath.Substring('.opencode/agents/'.Length)
        $srcFile = "$RootDir\base\opencode\agents\$subpath"
    } elseif ($RelativePath.StartsWith('.opencode/commands/')) {
        $subpath = $RelativePath.Substring('.opencode/commands/'.Length)
        $srcFile = "$RootDir\base\opencode\commands\$subpath"
    } elseif ($RelativePath.StartsWith('.opencode/skills/')) {
        $subpath = $RelativePath.Substring('.opencode/skills/'.Length)
        $srcFile = "$RootDir\base\opencode\skills\$subpath"
    } else {
        log "warning: unknown managed path prefix, skipping: $RelativePath"
        return
    }

    # If source is empty (directory marker), skip gracefully
    if ([string]::IsNullOrEmpty($srcFile)) {
        return
    }

    # If source is a directory (tree marker), skip — tree sync handles this
    if (Test-Path $srcFile -PathType Container) {
        return
    }

    # If source doesn't exist, log warning and skip (path was removed from templates)
    if (-not (Test-Path $srcFile -PathType Leaf)) {
        log "warning: source not found for managed path '$RelativePath', skipping: $srcFile"
        return
    }

    Sync-ManagedFile -Src $srcFile -Dst (Join-Path $Repo $RelativePath)
}
