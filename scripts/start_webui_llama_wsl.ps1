[CmdletBinding()]
param(
    [string]$Distro = "YOLO",
    [string]$ModelDistro = "GemmaCpp-Ubuntu-2404",
    [string]$E4bUrl = "",
    [string]$B26Url = "",
    [int]$Port = 8010,
    [string]$VenvPython = "/root/yolo26/.venv/bin/python",
    [switch]$Stop
)

$projectWin = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$driveLetter = $projectWin.Substring(0, 1).ToLower()
$projectSuffix = $projectWin.Substring(2).Replace("\", "/")
$projectWsl = "/mnt/$driveLetter$projectSuffix"
$healthUrl = "http://127.0.0.1:$Port/api/health"

if (-not $E4bUrl -or -not $B26Url) {
    if ($Distro -eq $ModelDistro) {
        if (-not $E4bUrl) { $E4bUrl = "http://127.0.0.1:8080" }
        if (-not $B26Url) { $B26Url = "http://127.0.0.1:8081" }
    } else {
        $modelIpRaw = wsl -d $ModelDistro -- bash -lc "hostname -I"
        $modelIp = ($modelIpRaw | Out-String).Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0]
        if (-not $modelIp) {
            Write-Error "Unable to resolve model distro IP from '$ModelDistro'."
            exit 1
        }
        if (-not $E4bUrl) { $E4bUrl = "http://$modelIp`:8080" }
        if (-not $B26Url) { $B26Url = "http://$modelIp`:8081" }
    }
}

$stopCmd = "pkill -f 'python run_webui.py' || true"
wsl -d $Distro -u root -- bash -lc $stopCmd | Out-Null

if (-not $Stop) {
    $startCmd = "cd '$projectWsl' && mkdir -p runtime && export VENV_PYTHON='$VenvPython' && export LLAMA_API_E4B_BASE_URL='$E4bUrl' && export LLAMA_API_26B_BASE_URL='$B26Url' && export DEFAULT_CHAT_MODEL='e4b-gguf-q4km' && export DEFAULT_VISION_MODEL='e4b-gguf-q4km' && export WEBUI_HOST='0.0.0.0' && export WEBUI_PORT='$Port' && exec bash scripts/wsl/run_webui.sh '$projectWsl'"
    Start-Process -FilePath "wsl.exe" -ArgumentList @("-d", $Distro, "-u", "root", "--", "bash", "-lc", $startCmd) -WindowStyle Hidden | Out-Null
}

if ($Stop) {
    Write-Host "Stopped WSL WebUI on distro '$Distro'."
    exit 0
}

$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
    }
}

if (-not $ready) {
    Write-Error "WSL WebUI did not become ready at $healthUrl"
    exit 1
}

Write-Host "WSL WebUI ready at http://127.0.0.1:$Port/yolo"
