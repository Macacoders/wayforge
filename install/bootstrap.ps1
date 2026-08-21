#!/usr/bin/env pwsh
#Requires -Version 5.1

# Thin entrypoint for ai-config on Windows.
# Replicates bootstrap.sh behavior: local binary, cached binary, GitHub release
# download, npx tsx fallback, and Node.js auto-download as last resort.
# Passes all arguments through to the target runtime unchanged.

function _run_tsx {
    & npx.cmd tsx ([System.IO.Path]::Combine($ROOT_DIR, 'cli', 'src', 'index.ts')) $args
    exit $LASTEXITCODE
}

function _refresh_path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT_DIR = Resolve-Path (Join-Path $SCRIPT_DIR '..') | Select-Object -ExpandProperty Path
$VERSION = if (Test-Path (Join-Path $ROOT_DIR 'VERSION')) { (Get-Content (Join-Path $ROOT_DIR 'VERSION') -Raw).Trim() } else { '0.0.0' }
if (-not $env:AI_CONFIG_HOME) {
    $env:AI_CONFIG_HOME = $ROOT_DIR
}
$REPO = 'Macacoders/ai-config'

# Architecture detection
$ARCH = switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { 'x64' }
    'ARM64' { 'arm64' }
    'x86'   { 'x86' }
    default { 'x64' }
}
if ($ARCH -eq 'x86') {
    Write-Host "[ai-config] error: unsupported architecture: x86 (32-bit)" -ForegroundColor Red
    exit 1
}

$OS = 'win32'
$BINARY_NAME = "ai-config-${OS}-${ARCH}"
$CACHE_DIR = Join-Path (Join-Path $HOME '.ai-config') 'bin'
$CACHED_BINARY = Join-Path $CACHE_DIR "ai-config-$VERSION-$OS-$ARCH"
$RELEASE_URL = "https://github.com/$REPO/releases/download/v$VERSION/$BINARY_NAME"
$LOCAL_BINARY = Join-Path (Join-Path $ROOT_DIR 'dist') $BINARY_NAME

# 0. Local development binary
if (Test-Path -LiteralPath $LOCAL_BINARY -PathType Leaf) {
    & $LOCAL_BINARY $args
    exit $LASTEXITCODE
}

# 1. Cached release binary
if (Test-Path -LiteralPath $CACHED_BINARY -PathType Leaf) {
    & $CACHED_BINARY $args
    exit $LASTEXITCODE
}

# 2. Download from GitHub release
$null = New-Item -ItemType Directory -Path $CACHE_DIR -Force
$tmpFile = "$CACHED_BINARY.tmp.$$"
try {
    Write-Host "[ai-config] downloading binary from $RELEASE_URL"
    Invoke-WebRequest -Uri $RELEASE_URL -OutFile $tmpFile -TimeoutSec 300 -ErrorAction Stop
    Move-Item -Path $tmpFile -Destination $CACHED_BINARY -Force
    & $CACHED_BINARY $args
    exit $LASTEXITCODE
} catch {
    Remove-Item -Path $tmpFile -ErrorAction SilentlyContinue
    Write-Host "[ai-config] binary download failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3. Fallback to npx tsx if Node.js is available
$nodePath = Get-Command 'node' -ErrorAction SilentlyContinue
if (-not $nodePath) {
    $nodePath = Get-Command (Join-Path $env:ProgramFiles 'nodejs\node.exe') -ErrorAction SilentlyContinue
}
if (-not $nodePath) {
    $nodePath = Get-Command (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe') -ErrorAction SilentlyContinue
}

if ($nodePath) {
    Write-Host "[ai-config] falling back to npx tsx"
    _run_tsx $args
}

# 4. Node.js not found — attempt to download and install
Write-Host "[ai-config] Node.js not found, attempting to download and install..." -ForegroundColor Yellow

# 4a. Try winget first (simplest, handles arch and PATH automatically)
$wingetPath = Get-Command 'winget' -ErrorAction SilentlyContinue
if ($wingetPath) {
    Write-Host "[ai-config] installing Node.js via winget..."
    $wingetResult = & winget install 'OpenJS.NodeJS.LTS' --accept-package-agreements --silent 2>&1
    if ($LASTEXITCODE -eq 0) {
        _refresh_path
        Write-Host "[ai-config] Node.js installed, retrying npx tsx"
        Start-Sleep -Seconds 2
        _run_tsx $args
    }
    Write-Host "[ai-config] winget install failed, trying direct download" -ForegroundColor Yellow
}

# 4b. Direct MSI download
$nodeArch = if ($ARCH -eq 'arm64') { 'arm64' } else { 'x64' }
$nodeVersion = '22.14.0'
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-$nodeArch.msi"
$nodeInstaller = Join-Path $env:TEMP "node-v$nodeVersion-$nodeArch.msi"

try {
    Write-Host "[ai-config] downloading Node.js $nodeVersion ($nodeArch) from nodejs.org..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -TimeoutSec 120 -ErrorAction Stop

    Write-Host "[ai-config] installing Node.js (this may require administrator privileges)..."
    $installResult = Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait -PassThru
    if ($installResult.ExitCode -eq 0) {
        _refresh_path
        Write-Host "[ai-config] Node.js installed, retrying npx tsx"
        Start-Sleep -Seconds 2
        _run_tsx $args
    } else {
        Write-Host "[ai-config] Node.js install failed (msiexec exit: $($installResult.ExitCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "[ai-config] Node.js download/install failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Remove-Item -Path $nodeInstaller -ErrorAction SilentlyContinue
}

# 5. No supported runtime
Write-Host "[ai-config] error: no supported runtime found" -ForegroundColor Red
Write-Host "  Install Node.js from https://nodejs.org (LTS recommended)" -ForegroundColor Yellow
Write-Host "  Or run as Administrator for automatic Node.js installation." -ForegroundColor Yellow
exit 1
