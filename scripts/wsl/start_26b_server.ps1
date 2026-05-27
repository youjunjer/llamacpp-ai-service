[CmdletBinding()]
param(
    [string]$DistroName = "GemmaCpp-Ubuntu-2404",
    [int]$GpuLayers = 16,
    [int]$ContextSize = 2048
)

$command = @"
/home/youadmin/llama.cpp/build/bin/llama-server \
  --hf-repo ggml-org/gemma-4-26B-A4B-it-GGUF \
  --hf-file gemma-4-26B-A4B-it-Q4_K_M.gguf \
  --jinja \
  --host 0.0.0.0 \
  --port 8081 \
  -ngl $GpuLayers \
  -c $ContextSize
"@

wsl.exe -d $DistroName -- bash -lc $command
