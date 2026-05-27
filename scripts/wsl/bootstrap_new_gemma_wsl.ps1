[CmdletBinding()]
param(
    [string]$DistroName = "GemmaCpp-Ubuntu-2404",
    [string]$ProjectWindowsPath = ""
)

$ErrorActionPreference = "Stop"

function Convert-ToWslPath {
    param([string]$WindowsPath)

    $full = [System.IO.Path]::GetFullPath($WindowsPath)
    $drive = $full.Substring(0, 1).ToLowerInvariant()
    $rest = $full.Substring(2).Replace("\", "/")
    return "/mnt/$drive$rest"
}

if ([string]::IsNullOrWhiteSpace($ProjectWindowsPath)) {
    $ProjectWindowsPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$projectWslPath = Convert-ToWslPath -WindowsPath $ProjectWindowsPath

Write-Host "[info] project path in WSL: $projectWslPath"
Write-Host "[info] bootstrapping distro: $DistroName"

$command = @"
set -e
cd '$projectWslPath'
chmod +x scripts/wsl/*.sh
./scripts/wsl/install_llamacpp.sh
"@

wsl.exe -d $DistroName -- bash -lc $command

Write-Host ""
Write-Host "[done] llama.cpp bootstrap finished"
Write-Host "[run] E4B:"
Write-Host "  wsl.exe -d $DistroName -- bash -lc `"cd '$projectWslPath' && ./scripts/wsl/run_gemma4_e4b.sh`""
Write-Host "[run] 26B:"
Write-Host "  wsl.exe -d $DistroName -- bash -lc `"cd '$projectWslPath' && ./scripts/wsl/run_gemma4_26b.sh`""
