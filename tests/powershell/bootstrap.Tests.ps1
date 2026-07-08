#Requires -Modules Pester

BeforeAll {
    $script:repoRoot = Resolve-Path "$PSScriptRoot/../.." | Select-Object -ExpandProperty Path
    $script:bootstrapScript = Join-Path $script:repoRoot 'install/bootstrap.ps1'
    $script:scriptContent = Get-Content -Path $script:bootstrapScript -Raw
}

Describe 'bootstrap.ps1 file structure' {
    It 'exists at the expected path' {
        Test-Path $script:bootstrapScript | Should -Be $true
    }

    It 'requires PowerShell 5.1' {
        $script:scriptContent | Should -Match '#Requires -Version 5.1'
    }

    It 'is a thin entrypoint (under 150 lines)' {
        ($script:scriptContent -split "`r`n" | Measure-Object).Count | Should -BeLessThan 150
    }
}

Describe 'Architecture detection' {
    It 'rejects x86 architecture with error' {
        $output = powershell -NoProfile -Command "
            `$env:PROCESSOR_ARCHITECTURE = 'x86'
            & '$script:bootstrapScript' 2>&1
            exit `$LASTEXITCODE
        "
        $LASTEXITCODE | Should -Be 1
    }
}

Describe 'Binary path construction' {
    It 'uses win32 as OS identifier' {
        $script:scriptContent | Should -Match '\$OS = .win32.'
    }

    It 'references the correct GitHub repo' {
        $script:scriptContent | Should -Match 'Macacoders/ai-config'
    }

    It 'constructs a cache dir under user home' {
        $script:scriptContent | Should -Match "Join-Path.*HOME.*.ai-config"
    }
}

Describe 'Runtime fallback chain' {
    It 'tries local binary first' {
        $script:scriptContent | Should -Match 'LOCAL_BINARY'
    }

    It 'tries cached binary second' {
        $script:scriptContent | Should -Match 'CACHED_BINARY'
    }

    It 'downloads from GitHub release third' {
        $script:scriptContent | Should -Match 'Invoke-WebRequest'
        $script:scriptContent | Should -Match 'releases/download'
    }

    It 'falls back to npx tsx when Node.js is available' {
        $script:scriptContent | Should -Match 'npx tsx'
        $script:scriptContent | Should -Match 'Combine.*cli.*src.*index'
    }

    It 'attempts Node.js download via winget or MSI as last resort' {
        $script:scriptContent | Should -Match 'nodejs.org'
        $script:scriptContent | Should -Match 'OpenJS.NodeJS.LTS'
    }

    It 'exits with error message when nothing works' {
        $script:scriptContent | Should -Match 'no supported runtime found'
    }
}

Describe 'Argument passthrough' {
    It 'passes arguments through to execution targets' {
        ($script:scriptContent | Select-String -Pattern '\$args' -AllMatches).Matches.Count | Should -BeGreaterOrEqual 3
    }

    It 'does not parse TS CLI flags of its own' {
        $hasOwnFlags = $false
        foreach ($flag in @('--repo', '--providers', '--runtime', '--model', '--dry-run', '--force')) {
            if ($script:scriptContent -match "`"$flag`"") {
                $hasOwnFlags = $true
            }
        }
        $hasOwnFlags | Should -Be $false
    }
}

Describe 'bootstrap.ps1 exit behavior' {
    It 'exits 0 when run with --help (falls through to TS CLI npx tsx)' {
        $output = & $script:bootstrapScript '--help' 2>&1
        $LASTEXITCODE | Should -Be 0
    }

    It 'shows help text in output' {
        $output = & $script:bootstrapScript '--help' 2>&1
        $combined = ($output | Out-String)
        $combined | Should -Match 'ai-config'
    }
}
