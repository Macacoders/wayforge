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
    return (Test-Path (Join-Path $Path $MANAGED_DIR_MARKER) -PathType Leaf)
}

function Is-ManagedFile {
    param([string]$Path)
    return (Test-Path "${Path}.ai-config-managed" -PathType Leaf)
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

    $dstMarker = Join-Path $Dst $MANAGED_DIR_MARKER
    if ((-not $dstTreeExisted -or $dstTreeWasManaged) -and -not (Test-Path $dstMarker -PathType Leaf)) {
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
                run-writefile "${dstFile}.ai-config-managed" 'generated-by=ai-config-bootstrap.sh'
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
            run-writefile "${dstFile}.ai-config-managed" 'generated-by=ai-config-bootstrap.sh'
            $script:SYNC_MANAGED_TREE_LAST_ACTION = 'copied'
            if ($DRY_RUN) {
                log "DRY-RUN: would refresh managed file: $dstFile"
            } else {
                log "refreshed managed file: $dstFile"
            }
            return
        }

        run-copyfile $srcFile $dstFile
        run-writefile "${dstFile}.ai-config-managed" 'generated-by=ai-config-bootstrap.sh'
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
                log "keep existing file (use -Force to refresh managed file): $Dst"
                return
            }
            if (-not (Is-ManagedFile $Dst)) {
                log "skip conflict with unmanaged file (preserving local content): $Dst"
                return
            }
            run-rm $Dst
        } elseif (-not $FORCE) {
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
    run-writefile "${Dst}.ai-config-managed" 'generated-by=ai-config-bootstrap.sh'
    if ($DRY_RUN) {
        log "DRY-RUN: would copy managed file: $Dst"
    } else {
        log "copied managed file: $Dst"
    }
}
