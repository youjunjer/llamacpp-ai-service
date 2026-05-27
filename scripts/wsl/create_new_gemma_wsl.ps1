[CmdletBinding()]
param(
    [string]$DistroName = "GemmaCpp-Ubuntu-2404",
    [string]$BaseDistro = "Ubuntu-24.04",
    [string]$InstallPath = "D:\WSL\$DistroName"
)

$ErrorActionPreference = "Stop"

Write-Host "[info] checking current WSL distros"
$existing = wsl.exe -l -q | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($existing -contains $DistroName) {
    Write-Host "[skip] distro '$DistroName' already exists"
    Write-Host "[hint] bootstrap with:"
    Write-Host "  .\scripts\wsl\bootstrap_new_gemma_wsl.ps1 -DistroName $DistroName"
    exit 0
}

New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null

Write-Host "[info] installing new WSL distro"
Write-Host "       name     : $DistroName"
Write-Host "       base     : $BaseDistro"
Write-Host "       location : $InstallPath"
wsl.exe --install $BaseDistro --name $DistroName --location $InstallPath --no-launch

Write-Host ""
Write-Host "[next] first-launch the distro once to create your Linux user:"
Write-Host "  wsl.exe -d $DistroName"
Write-Host ""
Write-Host "[next] after the Linux user is created, bootstrap llama.cpp with:"
Write-Host "  .\scripts\wsl\bootstrap_new_gemma_wsl.ps1 -DistroName $DistroName"
