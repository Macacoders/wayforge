#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

BeforeAll {
    $repoRoot = Resolve-Path "$PSScriptRoot/../.." | Select-Object -ExpandProperty Path
    $bootstrapScript = Join-Path $repoRoot 'install/bootstrap.ps1'

    # --- Extract Test-TempPath function for isolated unit testing ---
    $script:testTempPathFn = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($bootstrapScript, [ref]$null, [ref]$null)
    $functions = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
    $testTempPathAst = $functions | Where-Object { $_.Name -eq 'Test-TempPath' } | Select-Object -First 1
    if ($testTempPathAst) {
        $startLine = $testTempPathAst.Extent.StartLineNumber
        $endLine = $testTempPathAst.Extent.EndLineNumber
        $lines = (Get-Content $bootstrapScript)[($startLine -1)..($endLine -1)]
        $script:testTempPathFn = $lines -join "`n"
    }

    # --- Temp directories for integration tests ---
    $script:testTempRoot = Join-Path $env:TEMP "ai-config-test-$(Get-Random)"
    $script:testRepo = Join-Path $script:testTempRoot 'target-repo'
    $script:testAiConfig = Join-Path $script:testTempRoot 'ai-config-source'
    $null = New-Item -ItemType Directory -Path $script:testRepo -Force
}

AfterAll {
    if (Test-Path $script:testTempRoot) {
        Remove-Item -Recurse -Force $script:testTempRoot -ErrorAction SilentlyContinue
    }
}

Describe 'Test-TempPath function' {
    BeforeAll {
        if (-not $script:testTempPathFn) {
            throw 'Could not extract Test-TempPath from bootstrap.ps1'
        }
        # Define the function in this scope for testing
        Invoke-Expression $script:testTempPathFn
    }

    It 'detects /tmp/ paths as temporary' {
        Test-TempPath -Path '/tmp/foo' | Should -Be $true
        Test-TempPath -Path '/tmp/test-repo' | Should -Be $true
    }

    It 'detects /tmp as temporary (root level)' {
        Test-TempPath -Path '/tmp' | Should -Be $true
    }

    It 'detects /var/tmp/ paths as temporary' {
        Test-TempPath -Path '/var/tmp/bar' | Should -Be $true
        Test-TempPath -Path '/var/tmp/' | Should -Be $true
    }

    It 'detects paths under TMPDIR as temporary' {
        $originalTmpdir = [Environment]::GetEnvironmentVariable('TMPDIR')
        try {
            [Environment]::SetEnvironmentVariable('TMPDIR', '/custom/tmp')
            Test-TempPath -Path '/custom/tmp/my-repo' | Should -Be $true
            Test-TempPath -Path '/custom/tmp' | Should -Be $true
        } finally {
            [Environment]::SetEnvironmentVariable('TMPDIR', $originalTmpdir)
        }
    }

    It 'detects paths under Windows %TEMP% as temporary' {
        $tempPath = [Environment]::GetEnvironmentVariable('TEMP')
        if (-not $tempPath) { Set-ItResult -Skipped -Because '$env:TEMP is not set' }
        $testPath = Join-Path $tempPath 'some-project'
        Test-TempPath -Path $testPath | Should -Be $true
        Test-TempPath -Path $tempPath | Should -Be $true
    }

    It 'detects paths under Windows %TMP% as temporary' {
        $tmpPath = [Environment]::GetEnvironmentVariable('TMP')
        if (-not $tmpPath -or $tmpPath -eq [Environment]::GetEnvironmentVariable('TEMP')) {
            Set-ItResult -Skipped -Because '$env:TMP is not set or same as TEMP, test redundant'
        }
        $testPath = Join-Path $tmpPath 'another-project'
        Test-TempPath -Path $testPath | Should -Be $true
    }

    It 'rejects normal project paths as non-temporary' {
        Test-TempPath -Path 'C:\DEV\my-real-project' | Should -Be $false
        Test-TempPath -Path '/home/user/projects/alpha' | Should -Be $false
        Test-TempPath -Path '/opt/app' | Should -Be $false
    }
}

Describe 'bootstrap.ps1 CLI --help' {
    It 'shows -NoTrack in help output' {
        $output = & $bootstrapScript -Help 2>&1
        $combined = ($output | Out-String)
        $combined | Should -Match '-NoTrack'
    }

    It 'exits 0 with -Help' {
        $output = & $bootstrapScript -Help 2>&1
        $LASTEXITCODE | Should -Be 0
    }
}

Describe 'bootstrap.ps1 tracking integration' {
    BeforeAll {
        # Replicate Bash test pattern: copy install + base to temp location
        $script:testInstallDir = Join-Path $script:testAiConfig 'install'
        $script:testBaseDir = Join-Path $script:testAiConfig 'base'
        Copy-Item -Recurse (Join-Path $repoRoot 'install') $script:testAiConfig
        Copy-Item -Recurse (Join-Path $repoRoot 'base') $script:testAiConfig
        Copy-Item (Join-Path $repoRoot 'VERSION') $script:testAiConfig

        $script:testBootstrap = Join-Path $script:testInstallDir 'bootstrap.ps1'
        $script:trackingFile = Join-Path $script:testAiConfig 'installed-projects.json'
    }

    It 'auto-detects temp path and skips tracking' {
        # testRepo is under $env:TEMP, so Test-TempPath should fire
        $output = & $script:testBootstrap -Repo $script:testRepo 2>&1
        $combined = ($output | Out-String)

        $combined | Should -Match 'skip tracking temporary/debug path'

        # Verify no entry was created
        if (Test-Path $script:trackingFile) {
            $trackingContent = Get-Content $script:trackingFile -Raw
            $trackingContent | Should -Not -Match ([regex]::Escape($script:testRepo))
        }
    }

    It '-NoTrack prevents tracking entry' {
        $testRepoNoTrack = Join-Path $script:testTempRoot 'target-repo-notrack'
        $null = New-Item -ItemType Directory -Path $testRepoNoTrack -Force

        $output = & $script:testBootstrap -Repo $testRepoNoTrack -NoTrack 2>&1
        $combined = ($output | Out-String)

        # NO_TRACK guard fires silently before canonicalization/temp check
        $combined | Should -Not -Match 'skip tracking temporary/debug path'
        $combined | Should -Not -Match 'tracked installed project'

        # Verify no entry in tracking file
        if (Test-Path $script:trackingFile) {
            $trackingContent = Get-Content $script:trackingFile -Raw
            $trackingContent | Should -Not -Match ([regex]::Escape($testRepoNoTrack))
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
