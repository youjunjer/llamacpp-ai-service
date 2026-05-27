#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/models/quant/gemma-4-26B-A4B-it-GGUF-Q4_K_M"
LOG_FILE="$ROOT_DIR/quant_26b_gguf_wget.log"

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

echo "[start] $(date -Is) downloading 26B GGUF assets" >> "$LOG_FILE"

wget -c -O README.md \
  "https://huggingface.co/bartowski/google_gemma-4-26B-A4B-it-GGUF/resolve/main/README.md" \
  >> "$LOG_FILE" 2>&1

wget -c -O mmproj-google_gemma-4-26B-A4B-it-f16.gguf \
  "https://huggingface.co/bartowski/google_gemma-4-26B-A4B-it-GGUF/resolve/main/mmproj-google_gemma-4-26B-A4B-it-f16.gguf" \
  >> "$LOG_FILE" 2>&1

wget -c -O google_gemma-4-26B-A4B-it-Q4_K_M.gguf \
  "https://huggingface.co/bartowski/google_gemma-4-26B-A4B-it-GGUF/resolve/main/google_gemma-4-26B-A4B-it-Q4_K_M.gguf" \
  >> "$LOG_FILE" 2>&1

echo "[done] $(date -Is) 26B GGUF download complete" >> "$LOG_FILE"
