#Requires -Modules Pester

BeforeAll {
    $script:repoRoot = Resolve-Path "$PSScriptRoot/../.." | Select-Object -ExpandProperty Path
    $script:installScript = Join-Path $script:repoRoot 'install/install.ps1'
    $script:scriptContent = Get-Content -Path $script:installScript -Raw
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
    # ponytail: this Describe uses BeforeEach/AfterEach while sibling blocks use
    # inline try/finally; normalizing the whole file is deferred.
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
