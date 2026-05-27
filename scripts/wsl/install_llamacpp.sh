#!/usr/bin/env bash
set -euo pipefail

LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-$HOME/llama.cpp}"
BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build}"
ENABLE_CUDA="${ENABLE_CUDA:-auto}"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

echo "[info] installing dependencies for llama.cpp under WSL"
$SUDO apt-get update
$SUDO apt-get install -y \
  build-essential \
  cmake \
  curl \
  git \
  libcurl4-openssl-dev \
  pkg-config \
  python3 \
  python3-pip

if [ ! -d "$LLAMA_CPP_DIR/.git" ]; then
  echo "[info] cloning llama.cpp into $LLAMA_CPP_DIR"
  git clone https://github.com/ggml-org/llama.cpp.git "$LLAMA_CPP_DIR"
else
  echo "[info] updating existing llama.cpp checkout in $LLAMA_CPP_DIR"
  git -C "$LLAMA_CPP_DIR" pull --ff-only
fi

mkdir -p "$BUILD_DIR"

CUDA_FLAG=OFF
if [ "$ENABLE_CUDA" = "on" ]; then
  CUDA_FLAG=ON
elif [ "$ENABLE_CUDA" = "auto" ]; then
  if command -v nvidia-smi >/dev/null 2>&1 || [ -e /usr/lib/wsl/lib/libcuda.so ]; then
    CUDA_FLAG=ON
  fi
fi

echo "[info] configuring llama.cpp (GGML_CUDA=$CUDA_FLAG)"
cmake -S "$LLAMA_CPP_DIR" -B "$BUILD_DIR" \
  -DGGML_CUDA="$CUDA_FLAG" \
  -DLLAMA_CURL=ON \
  -DCMAKE_BUILD_TYPE=Release

echo "[info] building llama.cpp"
cmake --build "$BUILD_DIR" --config Release -j"$(nproc)"

echo
echo "[done] llama.cpp is ready"
echo "[path] binaries: $BUILD_DIR/bin"
echo "[next] run one of:"
echo "  $BUILD_DIR/bin/llama-server -hf ggml-org/gemma-4-E4B-it-GGUF:Q4_K_M --jinja"
echo "  $BUILD_DIR/bin/llama-server -hf ggml-org/gemma-4-26B-A4B-it-GGUF:Q4_K_M --jinja"
