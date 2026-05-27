#!/usr/bin/env bash
set -euo pipefail

LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-$HOME/llama.cpp}"
BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build}"
LLAMA_SERVER="${LLAMA_SERVER:-$BUILD_DIR/bin/llama-server}"

HF_REPO="${HF_REPO:-ggml-org/gemma-4-26B-A4B-it-GGUF}"
HF_FILE="${HF_FILE:-gemma-4-26B-A4B-it-Q4_K_M.gguf}"
PORT="${PORT:-8081}"
CTX="${CTX:-4096}"
NGL="${NGL:-24}"

if [ ! -x "$LLAMA_SERVER" ]; then
  echo "[error] llama-server not found at $LLAMA_SERVER"
  echo "[hint] run scripts/wsl/install_llamacpp.sh first"
  exit 1
fi

echo "[info] starting Gemma 4 26B-A4B on port $PORT"
echo "[info] default NGL=$NGL is conservative for 16 GB VRAM; raise it if your WSL CUDA memory headroom allows"
exec "$LLAMA_SERVER" \
  --hf-repo "$HF_REPO" \
  --hf-file "$HF_FILE" \
  --host 0.0.0.0 \
  --port "$PORT" \
  -c "$CTX" \
  -ngl "$NGL" \
  --jinja
