#Requires -Modules Pester

# ponytail: two Describes use BeforeEach/AfterEach while the rest use inline
# try/finally; normalizing this file is deferred.

BeforeAll {
    $script:repoRoot = Resolve-Path "$PSScriptRoot/../.." | Select-Object -ExpandProperty Path
    $script:installScript = Join-Path $script:repoRoot 'install/install.ps1'
    $script:scriptContent = Get-Content -Path $script:installScript -Raw
    # Stub Invoke-WebRequest: copies fixtures by URI leaf, never hits the
    # network. The checksum URL can fail with an HTTP status
    # (FAKE_CHECKSUM_STATUS) or as a transport timeout
    # (FAKE_CHECKSUM_TIMEOUT). Defined at file scope so multiple Describes
    # (checksum verification, PATH opt-out) reuse it.
    $script:downloadStub = @'
function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing)
    $leaf = [System.IO.Path]::GetFileName($Uri)
    if ($leaf -eq 'wayforge-checksums.txt' -and $env:FAKE_CHECKSUM_STATUS) {
        $status = [int]$env:FAKE_CHECKSUM_STATUS
        $ex = [System.Exception]::new("The remote server returned an error: (${status}).")
        $ex | Add-Member -NotePropertyName Response -NotePropertyValue ([pscustomobject]@{ StatusCode = $status }) -Force
        throw $ex
    }
    if ($leaf -eq 'wayforge-checksums.txt' -and $env:FAKE_CHECKSUM_TIMEOUT -eq '1') {
        throw [System.TimeoutException]::new('The operation has timed out.')
    }
    $src = Join-Path $env:FIXTURE_DIR $leaf
    if (-not (Test-Path $src)) { throw "404: ${Uri}" }
    Copy-Item -Path $src -Destination $OutFile -Force
}
'@
}

Describe 'install.ps1 file structure' {
    It 'exists at the expected path' {
        Test-Path $script:installScript | Should -Be $true
    }

    It 'requires PowerShell 5.1' {
        $script:scriptContent | Should -Match '#requires -Version 5.1'
    }

    It 'pins a Node version constant' {
        $script:scriptContent | Should -Match '\$NodeVersion\s*=\s*"[\d.]+"'
    }

    It 'enforces a Node minimum major version' {
        $script:scriptContent | Should -Match '\$NodeMinMajor\s*=\s*18'
    }

    It 'allows overriding the Node download base URL for tests' {
        $script:scriptContent | Should -Match 'WAYFORGE_NODE_BASE_URL'
    }
}

Describe 'Node detection and provisioning (-DryRun)' {
    It 'prints the Node provision plan when no node is on PATH' {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        try {
            $output = & pwsh -NoProfile -Command "
                `$env:PATH = '$tmp'
                & '$script:installScript' -DryRun -Version 9.9.9 -Prefix '$tmp/prefix' 2>&1
                exit 0
            "
            $combined = ($output | Out-String)
            $combined | Should -Match 'Node.js >= 18 not found on PATH'
            $combined | Should -Match '\[dry-run\] would install Node\.js'
            $combined | Should -Match '\[dry-run\] would download: .*node-v[\d.]+-win-'
            $combined | Should -Match '\[dry-run\] would extract to:'
            $combined | Should -Match '\[dry-run\] would add to User PATH:'
        }
        finally {
            Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'omits Node lines when -SkipNodeCheck is passed and node is absent' {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        try {
            $output = & pwsh -NoProfile -Command "
                `$env:PATH = '$tmp'
                & '$script:installScript' -DryRun -SkipNodeCheck -Version 9.9.9 -Prefix '$tmp/prefix' 2>&1
                exit 0
            "
            $combined = ($output | Out-String)
            $combined | Should -Not -Match 'Node\.js'
            $combined | Should -Not -Match 'would install Node'
        }
        finally {
            Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'detects Node >= 18 when a stub node reports v18.20.0' {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path (Join-Path $tmp 'stubbin') | Out-Null
        # Stub node: a shell script for Linux/macOS and a .cmd batch file for
        # Windows, both printing v18.20.0; the child pwsh resolves them via PATH.
        $stub = Join-Path $tmp 'stubbin' 'node'
        Set-Content -Path $stub -Value "#!/bin/sh`necho v18.20.0`n"
        if (Get-Command chmod -ErrorAction SilentlyContinue) {
            & chmod +x $stub
        }
        $stubCmd = Join-Path $tmp 'stubbin' 'node.cmd'
        Set-Content -Path $stubCmd -Value "@echo v18.20.0`r`n"
        try {
            $output = & pwsh -NoProfile -Command "
                `$env:PATH = '$(Join-Path $tmp 'stubbin')' + [System.IO.Path]::PathSeparator + `$env:PATH
                & '$script:installScript' -DryRun -Version 9.9.9 -Prefix '$tmp/prefix' 2>&1
                exit 0
            "
            $combined = ($output | Out-String)
            $combined | Should -Match 'Node\.js v18\.20\.0 detected'
            $combined | Should -Not -Match 'would install Node'
        }
        finally {
            Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Describe 'Release URL construction (-DryRun)' {
    It 'builds releases/download/<tag> URLs' {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        try {
            $output = & pwsh -NoProfile -Command "
                `$env:PATH = '$tmp'
                & '$script:installScript' -DryRun -SkipNodeCheck -Version 9.9.9 -Prefix '$tmp/prefix' 2>&1
                exit 0
            "
            $combined = ($output | Out-String)
            $combined | Should -Match 'releases/download/v9\.9\.9/wayforge-'
            $combined | Should -Not -Match 'releases/v9\.9\.9/download'
        }
        finally {
            Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Describe 'Latest release resolution (-DryRun, no -Version)' {
    BeforeEach {
        $script:tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:tmp | Out-Null
    }
    AfterEach {
        Remove-Item -Path $script:tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    It 'resolves the tag from the <Shape> response' -TestCases @(
        @{
            Shape = 'Windows PowerShell 5.1 (BaseResponse.ResponseUri)'
            Stub  = @'
function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]$Uri, [switch]$UseBasicParsing)
    [pscustomobject]@{
        BaseResponse = [pscustomobject]@{
            ResponseUri = [uri]'https://github.com/Macacoders/wayforge/releases/tag/v9.9.9'
        }
    }
}
'@
        }
        @{
            Shape = 'PowerShell 7 (BaseResponse.RequestMessage.RequestUri)'
            Stub  = @'
function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]$Uri, [switch]$UseBasicParsing)
    [pscustomobject]@{
        BaseResponse = [pscustomobject]@{
            ResponseUri = $null
            RequestMessage = [pscustomobject]@{ RequestUri = [uri]'https://github.com/Macacoders/wayforge/releases/tag/v9.9.9' }
        }
    }
}
'@
        }
    ) {
        param($Stub)
        $child = @"
$Stub
& '$script:installScript' -DryRun -SkipNodeCheck -Prefix '$script:tmp/prefix' 2>&1
exit 0
"@
        $combined = (& pwsh -NoProfile -Command $child | Out-String)
        $combined | Should -Match '\[dry-run\] version: 9\.9\.9'
        $combined | Should -Match 'releases/download/v9\.9\.9/wayforge-win32-x64\.exe'
        $combined | Should -Not -Match 'releases/download/latest'
    }
}

Describe 'Checksum verification (full install)' {
    BeforeAll {
        # ponytail: three Invoke-WebRequest stubs live in this file; consolidate when
        # the older Describes are next touched.
        # $script:downloadStub is defined in the file-level BeforeAll above.
        # Helper for child pwsh runs; a $script: scriptblock because Pester 6
        # does not expose file-scope functions to It blocks.
        $script:installChild = {
            param([string]$ExtraEnv = '')
            $child = @"
`$env:FIXTURE_DIR = '$script:fixtureDir'
$ExtraEnv
$script:downloadStub
try { & '$script:installScript' -SkipNodeCheck -Version 9.9.9 -Prefix '$script:tmp/prefix' *>&1 } catch { `$_; exit 1 }
exit 0
"@
            return (& pwsh -NoProfile -Command $child | Out-String)
        }
    }
    BeforeEach {
        $script:tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        $script:fixtureDir = Join-Path $script:tmp 'fixtures'
        $script:shareSrc = Join-Path $script:tmp 'share-src'
        New-Item -ItemType Directory -Path $script:fixtureDir | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $script:shareSrc 'base') | Out-Null
        # Compress-Archive drops empty directories; seed base/ so the fixture
        # zip actually contains it.
        Set-Content -Path (Join-Path $script:shareSrc 'base/README.md') -Value 'fixture'
        Set-Content -Path (Join-Path $script:shareSrc 'VERSION') -Value '9.9.9'

        $script:binaryFixture = Join-Path $script:fixtureDir 'wayforge-win32-x64.exe'
        $script:shareFixture = Join-Path $script:fixtureDir 'wayforge-share-9.9.9.zip'
        $script:checksumsFixture = Join-Path $script:fixtureDir 'wayforge-checksums.txt'
        Set-Content -Path $script:binaryFixture -Value 'fake wayforge binary'
        Compress-Archive -Path (Join-Path $script:shareSrc '*') -DestinationPath $script:shareFixture

        $script:binaryHash = (Get-FileHash -Path $script:binaryFixture -Algorithm SHA256).Hash.ToLowerInvariant()
        $script:shareHash = (Get-FileHash -Path $script:shareFixture -Algorithm SHA256).Hash.ToLowerInvariant()
        $script:originalUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    }
    AfterEach {
        [Environment]::SetEnvironmentVariable('Path', $script:originalUserPath, 'User')
        Remove-Item -Path $script:tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    It 'installs when digests match' {
        # Binary entries carry a dist/ prefix in release checksums; the
        # installer must normalize by basename.
        Set-Content -Path $script:checksumsFixture -Value "$($script:binaryHash)  dist/wayforge-win32-x64.exe`n$($script:shareHash)  wayforge-share-9.9.9.zip"
        $combined = & $script:installChild
        $LASTEXITCODE | Should -Be 0
        Test-Path (Join-Path $script:tmp 'prefix/bin/wfg.exe') | Should -Be $true
        Test-Path (Join-Path $script:tmp 'prefix/share/wayforge/base') -PathType Container | Should -Be $true
        $combined | Should -Match 'verified wayforge-win32-x64\.exe checksum'
    }

    It 'aborts without installing when the binary digest mismatches' {
        Set-Content -Path $script:checksumsFixture -Value "$(('a' * 64))  wayforge-win32-x64.exe`n$($script:shareHash)  wayforge-share-9.9.9.zip"
        $combined = & $script:installChild
        $LASTEXITCODE | Should -Not -Be 0
        $combined | Should -Match 'checksum mismatch'
        Test-Path (Join-Path $script:tmp 'prefix') | Should -Be $false
        Test-Path (Join-Path $script:tmp 'prefix/bin/wfg.exe') | Should -Be $false
    }

    It 'installs with a warning when the checksum asset is missing' {
        $combined = & $script:installChild -ExtraEnv "`$env:FAKE_CHECKSUM_STATUS = '404'"
        $LASTEXITCODE | Should -Be 0
        $combined | Should -Match 'wayforge-checksums\.txt is unavailable for 9\.9\.9; skipping checksum verification'
        Test-Path (Join-Path $script:tmp 'prefix/bin/wfg.exe') | Should -Be $true
        Test-Path (Join-Path $script:tmp 'prefix/share/wayforge/base') -PathType Container | Should -Be $true
    }

    It 'aborts without installing when the checksum download fails for a non-404 reason' {
        $combined = & $script:installChild -ExtraEnv "`$env:FAKE_CHECKSUM_STATUS = '500'"
        $LASTEXITCODE | Should -Not -Be 0
        $combined | Should -Match 'failed to download wayforge-checksums\.txt'
        Test-Path (Join-Path $script:tmp 'prefix') | Should -Be $false
    }

    It 'aborts without installing when the checksum download has no HTTP response' {
        $combined = & $script:installChild -ExtraEnv "`$env:FAKE_CHECKSUM_TIMEOUT = '1'"
        $LASTEXITCODE | Should -Not -Be 0
        $combined | Should -Match 'failed to download wayforge-checksums\.txt'
        Test-Path (Join-Path $script:tmp 'prefix') | Should -Be $false
    }

    It 'aborts when the checksum file has no entry for the binary' {
        Set-Content -Path $script:checksumsFixture -Value "$($script:shareHash)  wayforge-share-9.9.9.zip"
        $combined = & $script:installChild
        $LASTEXITCODE | Should -Not -Be 0
        $combined | Should -Match 'no entry for wayforge-win32-x64\.exe'
        Test-Path (Join-Path $script:tmp 'prefix') | Should -Be $false
        Test-Path (Join-Path $script:tmp 'prefix/bin/wfg.exe') | Should -Be $false
    }

    It 'uses Get-FileHash with SHA256 and references the checksum asset' {
        $script:scriptContent | Should -Match 'Get-FileHash'
        $script:scriptContent | Should -Match '-Algorithm SHA256'
        $script:scriptContent | Should -Match 'wayforge-checksums\.txt'
    }
}

Describe 'Uninstall removes provisioned Node' {
    It 'dry-run uninstall mentions the node directory and its PATH entry' {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        try {
            $output = & pwsh -NoProfile -Command "
                & '$script:installScript' -Uninstall -DryRun -Prefix '$tmp/prefix' 2>&1
                exit 0
            "
            $combined = ($output | Out-String)
            $combined | Should -Match '\[dry-run\] would remove: .*node'
            $combined | Should -Match '\[dry-run\] would remove from User PATH: .*node'
        }
        finally {
            Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Describe 'PATH opt-out (-NoModifyPath)' {
    BeforeEach {
        $script:tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
        $script:fixtureDir = Join-Path $script:tmp 'fixtures'
        $script:shareSrc = Join-Path $script:tmp 'share-src'
        New-Item -ItemType Directory -Path $script:fixtureDir | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $script:shareSrc 'base') | Out-Null
        Set-Content -Path (Join-Path $script:shareSrc 'base/README.md') -Value 'fixture'
        Set-Content -Path (Join-Path $script:shareSrc 'VERSION') -Value '9.9.9'

        $script:binaryFixture = Join-Path $script:fixtureDir 'wayforge-win32-x64.exe'
        $script:shareFixture = Join-Path $script:fixtureDir 'wayforge-share-9.9.9.zip'
        $script:checksumsFixture = Join-Path $script:fixtureDir 'wayforge-checksums.txt'
        Set-Content -Path $script:binaryFixture -Value 'fake wayforge binary'
        Compress-Archive -Path (Join-Path $script:shareSrc '*') -DestinationPath $script:shareFixture

        $script:binaryHash = (Get-FileHash -Path $script:binaryFixture -Algorithm SHA256).Hash.ToLowerInvariant()
        $script:shareHash = (Get-FileHash -Path $script:shareFixture -Algorithm SHA256).Hash.ToLowerInvariant()
        $script:originalUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    }
    AfterEach {
        [Environment]::SetEnvironmentVariable('Path', $script:originalUserPath, 'User')
        Remove-Item -Path $script:tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    It 'dry-run install prints the User PATH skip line' {
        $output = & pwsh -NoProfile -Command "
            `$env:PATH = '$script:tmp'
            & '$script:installScript' -DryRun -SkipNodeCheck -NoModifyPath -Version 9.9.9 -Prefix '$script:tmp/prefix' 2>&1
            exit 0
        "
        $combined = ($output | Out-String)
        $combined | Should -Match '\[dry-run\] would skip User PATH update \(-NoModifyPath\)'
        $combined | Should -Not -Match 'would add to User PATH'
    }

    It 'full install leaves the User PATH unchanged' {
        Set-Content -Path $script:checksumsFixture -Value "$($script:binaryHash)  dist/wayforge-win32-x64.exe`n$($script:shareHash)  wayforge-share-9.9.9.zip"
        $before = [Environment]::GetEnvironmentVariable('Path', 'User')
        $child = @"
`$env:FIXTURE_DIR = '$script:fixtureDir'
$script:downloadStub
try { & '$script:installScript' -SkipNodeCheck -NoModifyPath -Version 9.9.9 -Prefix '$script:tmp/prefix' *>&1 } catch { `$_; exit 1 }
exit 0
"@
        $combined = (& pwsh -NoProfile -Command $child | Out-String)
        $LASTEXITCODE | Should -Be 0
        Test-Path (Join-Path $script:tmp 'prefix/bin/wfg.exe') | Should -Be $true
        Test-Path (Join-Path $script:tmp 'prefix/share/wayforge/base') -PathType Container | Should -Be $true
        $combined | Should -Match 'User PATH update skipped \(-NoModifyPath\)'
        [Environment]::GetEnvironmentVariable('Path', 'User') | Should -Be $before
    }

    It 'dry-run uninstall prints the User PATH skip line' {
        $output = & pwsh -NoProfile -Command "
            & '$script:installScript' -Uninstall -DryRun -NoModifyPath -Prefix '$script:tmp/prefix' 2>&1
            exit 0
        "
        $combined = ($output | Out-String)
        $combined | Should -Match '\[dry-run\] would skip User PATH update \(-NoModifyPath\)'
        $combined | Should -Not -Match 'would remove from User PATH'
    }
}
