#Requires -Version 5.1
<#
    Auditor's Ledger — build orchestrator.

    1. Generate random keys (AES-256, ChaCha20)
    2. Encrypt assets (flag JSON → ChaCha20 → Base85 → AES-256-CBC)
    3. Emit generated_assets.h consumed by the C++ build
    4. CMake configure + build (MSVC)
    5. Run once to produce ledger.dmp
    6. Copy release artifacts to ./release/
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "[1/6] Generating keys..." -ForegroundColor Cyan
python scripts/generate_keys.py

Write-Host "[2/6] Encrypting assets..." -ForegroundColor Cyan
python scripts/encrypt_assets.py

Write-Host "[3/6] Configuring CMake..." -ForegroundColor Cyan
if (Test-Path build) { Remove-Item -Recurse -Force build }
cmake -S . -B build -G "Visual Studio 17 2022" -A x64

Write-Host "[4/6] Building (Release)..." -ForegroundColor Cyan
cmake --build build --config Release --parallel

$exe = Join-Path $root 'build/bin/Release/ledger.exe'
if (-not (Test-Path $exe)) {
    throw "Build did not produce $exe"
}

Write-Host "[5/6] Running ledger.exe to capture memory dump..." -ForegroundColor Cyan
# LEDGER_DUMP=1 makes the binary write ledger.dmp via MiniDumpWriteDump before exit
$env:LEDGER_DUMP = '1'
Push-Location (Split-Path $exe -Parent)
& $exe "auditor" | Out-Host
Pop-Location
Remove-Item Env:LEDGER_DUMP

$dmp = Join-Path (Split-Path $exe -Parent) 'ledger.dmp'
if (-not (Test-Path $dmp)) {
    throw "ledger.dmp was not produced next to $exe"
}

Write-Host "[6/6] Packaging release/..." -ForegroundColor Cyan
$release = Join-Path $root 'release'
if (Test-Path $release) { Remove-Item -Recurse -Force $release }
New-Item -ItemType Directory -Path $release | Out-Null
Copy-Item $exe (Join-Path $release 'ledger.exe')
Copy-Item $dmp (Join-Path $release 'ledger.dmp')
Copy-Item (Join-Path $root 'README.md') (Join-Path $release 'README.md')

Write-Host "`nDone. Release artifacts:" -ForegroundColor Green
Get-ChildItem $release | Format-Table Name, Length
