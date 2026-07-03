#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

# Inline copy of Test-TempPath from install/bootstrap.ps1
# ponytail: deprecated 2026-07 — PowerShell scripts being migrated to TypeScript; debt will vanish with migration
# ponytail:rung2 Duplicates bootstrap.ps1; extract to shared helper if a third consumer appears
function Test-TempPath {
    param([string]$Path)
    if ($Path -like '/tmp*' -or $Path -like '/var/tmp*') { return $true }
    $tmpdir = [Environment]::GetEnvironmentVariable('TMPDIR')
    if ($tmpdir -and ($Path -eq $tmpdir -or $Path -like "$tmpdir/*")) { return $true }
    $winTemp = [Environment]::GetEnvironmentVariable('TEMP')
    if (-not $winTemp) { $winTemp = [Environment]::GetEnvironmentVariable('TMP') }
    if ($winTemp) {
        $winTemp = $winTemp.TrimEnd('\')
        if ($Path -eq $winTemp -or $Path -like "$winTemp\*" -or $Path -like "$winTemp/*") { return $true }
    }
    return $false
}

BeforeAll {
    $script:repoRoot = Resolve-Path "$PSScriptRoot/../.." | Select-Object -ExpandProperty Path
    $script:bootstrapScript = Join-Path $script:repoRoot 'install/bootstrap.ps1'
}

Describe 'Test-TempPath function' {
    It 'detects <Path> as <Expected>' -TestCases @(
        @{ Path = '/tmp/foo';                 Expected = $true  }
        @{ Path = '/tmp';                     Expected = $true  }
        @{ Path = '/tmp/test-repo';           Expected = $true  }
        @{ Path = '/var/tmp/bar';             Expected = $true  }
        @{ Path = '/var/tmp/';                Expected = $true  }
        @{ Path = 'C:\DEV\my-real-project';   Expected = $false }
        @{ Path = '/home/user/projects/alpha';Expected = $false }
        @{ Path = '/opt/app';                 Expected = $false }
    ) {
        Test-TempPath -Path $Path | Should -Be $Expected
    }

    It 'detects paths under TMPDIR as temporary' {
        $original = [Environment]::GetEnvironmentVariable('TMPDIR')
        try {
            [Environment]::SetEnvironmentVariable('TMPDIR', '/custom/tmp')
            Test-TempPath -Path '/custom/tmp/my-repo' | Should -Be $true
            Test-TempPath -Path '/custom/tmp' | Should -Be $true
        } finally {
            [Environment]::SetEnvironmentVariable('TMPDIR', $original)
        }
    }

    It 'detects paths under Windows %TEMP% as temporary' {
        $tempPath = [Environment]::GetEnvironmentVariable('TEMP')
        if (-not $tempPath) { Set-ItResult -Skipped -Because '$env:TEMP is not set' }
        Test-TempPath -Path (Join-Path $tempPath 'some-project') | Should -Be $true
        Test-TempPath -Path $tempPath | Should -Be $true
    }

    It 'detects paths under Windows %TMP% as temporary' {
        $tmpPath = [Environment]::GetEnvironmentVariable('TMP')
        if (-not $tmpPath -or $tmpPath -eq [Environment]::GetEnvironmentVariable('TEMP')) {
            Set-ItResult -Skipped -Because '$env:TMP is not set or same as TEMP, test redundant'
        }
        Test-TempPath -Path (Join-Path $tmpPath 'another-project') | Should -Be $true
    }
}

Describe 'bootstrap.ps1 CLI --help' {
    It 'shows -NoTrack in help output' {
        $output = & $script:bootstrapScript -Help 2>&1
        ($output | Out-String) | Should -Match '-NoTrack'
    }

    It 'exits 0 with -Help' {
        $null = & $script:bootstrapScript -Help 2>&1
        $LASTEXITCODE | Should -Be 0
    }
}

Describe 'bootstrap.ps1 tracking integration' {
    BeforeAll {
        # ponytail: deprecated 2026-07 — PowerShell scripts being migrated to TypeScript; debt will vanish with migration
        # ponytail:rung7 Full install copy is heavy for testing only tracking behavior.
        # Simplify by dot-sourcing bootstrap.ps1 with REPO_PATH preset if a refactor opportunity arises.
        $script:testTempRoot = Join-Path $env:TEMP "ai-config-test-$(Get-Random)"
        $script:testAiConfig = Join-Path $script:testTempRoot 'ai-config-source'
        $script:testRepo = Join-Path $script:testTempRoot 'target-repo'
        $null = New-Item -ItemType Directory -Path $script:testRepo -Force
        Copy-Item -Recurse (Join-Path $script:repoRoot 'install') $script:testAiConfig
        Copy-Item -Recurse (Join-Path $script:repoRoot 'base') $script:testAiConfig
        Copy-Item (Join-Path $script:repoRoot 'VERSION') $script:testAiConfig
        $script:testBootstrap = Join-Path $script:testAiConfig 'install/bootstrap.ps1'
        $script:trackingFile = Join-Path $script:testAiConfig 'installed-projects.json'
    }

    AfterAll {
        if (Test-Path $script:testTempRoot) {
            Remove-Item -Recurse -Force $script:testTempRoot -ErrorAction SilentlyContinue
        }
    }

    It 'auto-detects temp path and skips tracking' {
        $output = & $script:testBootstrap -Repo $script:testRepo 2>&1
        $combined = ($output | Out-String)
        $combined | Should -Match 'skip tracking temporary/debug path'
        if (Test-Path $script:trackingFile) {
            Get-Content $script:trackingFile -Raw | Should -Not -Match ([regex]::Escape($script:testRepo))
        }
    }

    It '-NoTrack prevents tracking entry' {
        $testRepoNoTrack = Join-Path $script:testTempRoot 'target-repo-notrack'
        $null = New-Item -ItemType Directory -Path $testRepoNoTrack -Force
        $output = & $script:testBootstrap -Repo $testRepoNoTrack -NoTrack 2>&1
        $combined = ($output | Out-String)
        $combined | Should -Not -Match 'skip tracking temporary/debug path'
        $combined | Should -Not -Match 'tracked installed project'
        if (Test-Path $script:trackingFile) {
            Get-Content $script:trackingFile -Raw | Should -Not -Match ([regex]::Escape($testRepoNoTrack))
        }
    }

    It 'tracks normal paths normally' {
        # This test requires a path outside $env:TEMP to verify tracking.
        # All test paths here are under $env:TEMP and trigger auto-detection.
        # Normal tracking is inherited unchanged from the existing codebase
        # and verified by Bash Bats tests (bootstrap_cli.bats).
        Set-ItResult -Skipped -Because 'Normal tracking requires a non-TEMP path; covered by Bash Bats tests'
    }
}
