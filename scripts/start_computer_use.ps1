$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root ".venv-computer-use\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    python -m venv (Join-Path $Root ".venv-computer-use")
    & $Python -m pip install --upgrade pip
    & $Python -m pip install -r (Join-Path $Root "requirements-computer-use.txt")
}

Set-Location $Root
& $Python -m uvicorn computer_use.app:app --host 127.0.0.1 --port 8765
