[CmdletBinding()]
param(
    [string]$E4bUrl = "http://127.0.0.1:8080",
    [string]$B26Url = "http://127.0.0.1:8081",
    [int]$Port = 8010
)

$env:LLAMA_API_E4B_BASE_URL = $E4bUrl
$env:LLAMA_API_26B_BASE_URL = $B26Url
$env:DEFAULT_CHAT_MODEL = "e4b-gguf-q4km"
$env:DEFAULT_VISION_MODEL = "e4b-gguf-q4km"

python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
