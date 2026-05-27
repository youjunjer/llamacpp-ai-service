[CmdletBinding()]
param(
    [string]$DistroName = "GemmaCpp-Ubuntu-2404"
)

$command = @'
/home/youadmin/llama.cpp/build/bin/llama-server \
  --hf-repo ggml-org/gemma-4-E4B-it-GGUF \
  --hf-file gemma-4-E4B-it-Q4_K_M.gguf \
  --jinja \
  --host 0.0.0.0 \
  --port 8080 \
  -ngl 999 \
  -c 4096
'@

wsl.exe -d $DistroName -- bash -lc $command
