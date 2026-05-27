param(
    [string] $TargetDistro = "Empty-Ubuntu-2404",
    [int] $ListenPort = 8222,
    [int] $ConnectPort = 2222
)

$ErrorActionPreference = "Stop"

$ruleName = "WSL SSH $ListenPort"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    throw "Please run this script from an elevated PowerShell window."
}

$excludedRanges = netsh interface ipv4 show excludedportrange protocol=tcp
foreach ($line in $excludedRanges) {
    if ($line -match '^\s*(\d+)\s+(\d+)') {
        $start = [int] $matches[1]
        $end = [int] $matches[2]
        if ($ListenPort -ge $start -and $ListenPort -le $end) {
            throw "TCP port $ListenPort is in a Windows excluded port range ($start-$end). Choose another ListenPort, for example 2322."
        }
    }
}

$connectAddress = (
    wsl -d $TargetDistro -- bash -lc "hostname -I | tr ' ' '\n' | grep -m1 -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'"
).Trim()

if (-not $connectAddress) {
    throw "Could not resolve WSL IP for $TargetDistro."
}

wsl -d $TargetDistro -u root -- bash -lc "systemctl is-active ssh >/dev/null || systemctl start ssh"

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$ListenPort 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$ListenPort connectaddress=$connectAddress connectport=$ConnectPort | Out-Null

if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $ListenPort | Out-Null
}

Write-Host "WSL SSH portproxy configured:"
netsh interface portproxy show all
Write-Host ""
Write-Host "Local verification:"
Test-NetConnection -ComputerName 127.0.0.1 -Port $ListenPort |
    Select-Object ComputerName, RemoteAddress, RemotePort, TcpTestSucceeded |
    Format-List
