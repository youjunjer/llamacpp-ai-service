#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/mnt/f/GoogleDrv/P_程式開發/202604_Ollama}"
VENV_PYTHON="${VENV_PYTHON:-/root/yolo26/.venv/bin/python}"
export WEBUI_HOST="${WEBUI_HOST:-0.0.0.0}"
export WEBUI_PORT="${WEBUI_PORT:-8000}"
export DEFAULT_CHAT_MODEL="${DEFAULT_CHAT_MODEL:-e4b-gguf-q4km}"
export DEFAULT_VISION_MODEL="${DEFAULT_VISION_MODEL:-e4b-gguf-q4km}"
export LLAMA_API_E4B_BASE_URL="${LLAMA_API_E4B_BASE_URL:-http://127.0.0.1:8080}"
export LLAMA_API_26B_BASE_URL="${LLAMA_API_26B_BASE_URL:-http://127.0.0.1:8081}"

WSL_HOST_IP="$(sed -n 's/^nameserver[[:space:]]\+\([^[:space:]]\+\)$/\1/p' /etc/resolv.conf 2>/dev/null | head -n 1)"
if [[ -z "${WSL_HOST_IP}" ]]; then
  WSL_HOST_IP="$(ip route show default 2>/dev/null | sed -n 's/^default via \([^ ]*\).*/\1/p' | head -n 1)"
fi
if [[ -n "${WSL_HOST_IP}" ]]; then
  if [[ "${LLAMA_API_E4B_BASE_URL}" == "http://127.0.0.1:8080" ]]; then
    export LLAMA_API_E4B_BASE_URL="http://${WSL_HOST_IP}:8080"
  fi
  if [[ "${LLAMA_API_26B_BASE_URL}" == "http://127.0.0.1:8081" ]]; then
    export LLAMA_API_26B_BASE_URL="http://${WSL_HOST_IP}:8081"
  fi
fi

cd "$PROJECT_DIR"
exec "$VENV_PYTHON" run_webui.py
