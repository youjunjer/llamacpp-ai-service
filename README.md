# 本機 Gemma / llama.cpp 多模態 AI 服務

這個專案提供一套以 `llama.cpp` 為核心的本機 AI 服務，用來執行 Gemma 系列 GGUF 模型，並透過 WebUI 提供文字、圖片與音訊等多模態互動能力。目標是讓使用者能在自有硬體上使用大型語言模型，降低對外部雲端 API 的依賴，並保留資料在本機或私有環境中處理。

## 專案特色

- **本機推論**：使用 `llama.cpp` 執行 GGUF 模型，適合部署在具備 NVIDIA GPU 的 Windows / WSL 環境。
- **WebUI 操作介面**：提供瀏覽器介面，使用者可以直接選擇模型、輸入提示詞並查看回覆。
- **多模型候選清單**：透過 `llama-models.ini` 管理模型 preset，支援在 WebUI 中切換不同 Gemma 模型。
- **多模態能力**：搭配 `mmproj` projector 後，可使用 Gemma 模型處理圖片輸入；部分 projector 也包含音訊 encoder。
- **長上下文支援**：已驗證 Gemma 4 12B GGUF 版本可使用 `262144` tokens context，適合長文件、程式碼庫、會議逐字稿、財報與大型資料整理。
- **可復原部署**：保留模型清單、下載來源、啟動方式與復原紀錄，方便未來在新電腦或新 WSL 環境重新建置。
- **不綁定雲端 API**：模型在本機執行，適合重視成本控制、資料隱私與離線/內網環境的使用情境。

## 目前支援的模型

此 repo 不直接包含大型 GGUF 模型檔；模型需依照 `llama-models.ini` 的路徑與來源自行下載。

| 模型 | 類型 | 說明 |
| --- | --- | --- |
| `gemma-4-E2B-it.Q4_K_M` | 文字 + 多模態 projector | 較輕量，適合快速測試與低資源環境 |
| `gemma-4-E4B-it-Q4_K_M` | 文字 + 多模態 projector | 平衡速度與品質 |
| `gemma-4-12B-it-Q4_K_M` | 文字 + 多模態 projector | 已驗證 256K context，適合長文件與圖片理解 |
| `gemma-4-12B-coder-fable5-Q4_K_M` | 文字 / coding | 12B coding / reasoning 候選模型，適合程式碼補全、除錯與演算法任務 |
| `gemma-4-26B-A4B-it-Q4_K_M` | 文字 + 多模態 projector | 較大型候選模型，適合需要更高推理品質的任務 |

## 硬體需求

實際需求會依模型大小、量化格式、context 長度與是否啟用圖片輸入而變動。以下是建議值：

| 使用目標 | 建議硬體 |
| --- | --- |
| E2B / E4B 測試 | NVIDIA GPU 8GB VRAM 以上，系統記憶體 16GB 以上 |
| 12B Q4_K_M 一般使用 | NVIDIA GPU 16GB VRAM 以上，系統記憶體 32GB 以上 |
| 12B Coder Q4_K_M | NVIDIA GPU 16GB VRAM 以上；建議先用 64K context，約需 11GB VRAM |
| 12B Q4_K_M + 256K context | NVIDIA GPU 16GB VRAM 可載入但餘裕很小，建議 24GB VRAM 以上 |
| 26B Q4_K_M 候選模型 | 建議 24GB VRAM 以上，或接受較慢的 CPU / 部分 offload |
| 模型儲存空間 | 至少 40GB；若保留多個模型版本，建議 100GB 以上 |

建議環境：

- Windows 11 + WSL2 Ubuntu 24.04，或原生 Ubuntu 24.04
- NVIDIA Driver 與 CUDA toolkit 已安裝
- `git`、`cmake`、`ninja-build`、`build-essential`、`curl`、`wget`
- 瀏覽器，用於開啟 llama.cpp WebUI

如果你是請 AI 助手協助安裝，請把本 README 交給 AI，並要求它依序執行「安裝步驟」與「驗證方式」，不要直接跳到修改 production 設定。

## 安裝步驟

以下流程適合從零建立一台新的本機或 WSL 服務。路徑可以依你的環境調整；範例使用 `/home/youadmin`。

### 1. 安裝系統套件

Ubuntu / WSL 內執行：

```bash
sudo apt update
sudo apt install -y git cmake ninja-build build-essential curl wget python3 python3-pip
```

確認 NVIDIA GPU 可見：

```bash
nvidia-smi
```

若 `nvidia-smi` 無法執行，請先處理 Windows NVIDIA Driver、WSL GPU passthrough 或 Linux CUDA 環境。

### 2. 下載本專案

```bash
cd /home/youadmin
git clone https://github.com/youjunjer/202604-ollama-ai-service.git
cd 202604-ollama-ai-service
```

### 3. 取得 llama.cpp

```bash
cd /home/youadmin
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
```

Gemma 4 12B 的多模態 projector 需要 llama.cpp 支援 `gemma4uv`。若你使用的版本無法載入 `mmproj-gemma-4-12B-it-Q8_0.gguf`，請更新 llama.cpp 到較新的 upstream 版本後再編譯。

### 4. 編譯 llama.cpp

如果要套用本專案的 WebUI 客製化，例如 favicon、側欄使用者 email / 登出按鈕，以及預設以台灣繁體中文回答，請在編譯前於 `llama.cpp` 目錄執行：

```bash
cd /home/youadmin/llama.cpp
git apply /home/youadmin/202604-ollama-ai-service/patches/llama-cpp-webui-public-branding-zh.patch
git apply /home/youadmin/202604-ollama-ai-service/patches/llama-cpp-webui-mmproj-modality-fallback.patch
git apply /home/youadmin/202604-ollama-ai-service/patches/llama-cpp-webui-dynamic-context-meter.patch
```

這個 patch 只包含公開安全的 WebUI 調整，不包含 production 帳號白名單、私有連線資訊或機器專用設定。若你已經套用過，請不要重複套用；可用 `git diff` 檢查目前 llama.cpp 工作區是否已包含變更。

CUDA GPU 版本：

```bash
cd /home/youadmin/llama.cpp
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON
cmake --build build -j --target llama-server
```

如果 CMake 找不到 CUDA compiler，可以明確指定：

```bash
cmake -B build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=ON \
  -DCMAKE_CUDA_COMPILER=/usr/local/cuda/bin/nvcc
cmake --build build -j --target llama-server
```

CPU-only 測試版本：

```bash
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build -j --target llama-server
```

### 5. 建立模型目錄

```bash
mkdir -p /home/youadmin/llama-models
cp /home/youadmin/202604-ollama-ai-service/llama-models.ini /home/youadmin/llama-models/models.ini
```

如果你的模型目錄不是 `/home/youadmin/llama-models`，請同步修改 `models.ini` 裡的 `model` 與 `mmproj` 路徑。

### 6. 下載模型

本專案使用 **GGUF** 格式，這是 `llama.cpp` 原生支援的模型格式。建議一般使用者直接下載已轉好的 GGUF，不需要自己從原始 Hugging Face 權重轉換。

常見檔名含義：

| 名稱 | 意義 |
| --- | --- |
| `GGUF` | llama.cpp 使用的模型檔格式 |
| `Q4_K_M` | 4-bit 量化格式，品質與速度/容量的平衡點 |
| `bf16` / `f16` / `Q8_0` | 較高精度或 projector 常見格式，檔案較大但資訊保留較多 |
| `mmproj` | multimodal projector，讓文字模型能接收圖片或音訊 embedding |
| `ctx262144` | 本專案用來標示此 12B GGUF metadata 已驗證為 262144 context |

12B 256K context 版本：

```bash
cd /home/youadmin/llama-models

wget -c \
  https://huggingface.co/ggml-org/gemma-4-12B-it-GGUF/resolve/main/gemma-4-12B-it-Q4_K_M.gguf \
  -O gemma-4-12B-it-Q4_K_M.ctx262144.gguf

wget -c \
  https://huggingface.co/ggml-org/gemma-4-12B-it-GGUF/resolve/main/mmproj-gemma-4-12B-it-Q8_0.gguf \
  -O mmproj-gemma-4-12B-it-Q8_0.gguf
```

26B 候選模型：

```bash
cd /home/youadmin/llama-models

wget -c \
  https://huggingface.co/bartowski/google_gemma-4-26B-A4B-it-GGUF/resolve/main/google_gemma-4-26B-A4B-it-Q4_K_M.gguf \
  -O google_gemma-4-26B-A4B-it-Q4_K_M.gguf

wget -c \
  https://huggingface.co/bartowski/google_gemma-4-26B-A4B-it-GGUF/resolve/main/mmproj-google_gemma-4-26B-A4B-it-f16.gguf \
  -O mmproj-google_gemma-4-26B-A4B-it-f16.gguf
```

12B Coder / reasoning 候選模型：

```bash
cd /home/youadmin/llama-models

wget -c \
  'https://huggingface.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF/resolve/main/gemma4-coding-Q4_K_M.gguf?download=true' \
  -O gemma-4-12B-coder-fable5-Q4_K_M.gguf
```

這個模型主要定位為 coding / reasoning 模型，但可搭配 Gemma 4 12B 的
`mmproj-gemma-4-12B-it-Q8_0.gguf` 啟用圖片輸入。production 已驗證
llama.cpp 能載入 vision/audio encoder，並可用圖片 API 回答影像內容。
GGUF metadata 已驗證：

```text
general.architecture = gemma4
general.name = Gemma4 Coding Merged Fp16
gemma4.context_length = 262144
```

實務上 16GB VRAM 建議先用 `ctx-size = 65536`，避免與 12B 256K 多模態模型一樣把 VRAM 餘裕吃滿。

E2B / E4B 模型請依 `llama-models.ini` 中的檔名補齊。若只想先測 12B，可以先保留其他 preset，但不要選未下載的模型。

### 7. 驗證 GGUF metadata

下載 12B 後，建議先確認它真的是 256K context。最可靠的方法是讀 GGUF metadata，而不是只看網頁介紹。

可以用 llama.cpp log 驗證。啟動並載入模型後，log 應出現：

```text
gemma4.context_length u32 = 262144
n_ctx_train = 262144
n_ctx = 262144
```

如果看到 `gemma4.context_length = 131072`，代表你下載到的是舊版或不同來源的 GGUF。請重新下載 `ggml-org/gemma-4-12B-it-GGUF` 的新版檔案。

### 8. 何時需要自己轉換模型格式

一般不建議自行轉換，因為 Gemma 4 多模態模型需要正確的 GGUF metadata、chat template 與 projector。優先順序建議如下：

1. **優先下載官方或社群已轉好的 GGUF**
   - 12B：`ggml-org/gemma-4-12B-it-GGUF`
   - 26B：`bartowski/google_gemma-4-26B-A4B-it-GGUF`
2. **確認 GGUF metadata 與 projector 可用**
   - 主模型需能被 llama.cpp 載入
   - `mmproj` 需能出現 `loaded multimodal model`
3. **只有在找不到合適 GGUF 時才自行轉換**

如果你真的要自行轉換，概念流程如下：

```bash
cd /home/youadmin/llama.cpp
python3 -m pip install -r requirements/requirements-convert_hf_to_gguf.txt
python3 convert_hf_to_gguf.py /path/to/hf-model --outfile /home/youadmin/llama-models/model-f16.gguf
./build/bin/llama-quantize /home/youadmin/llama-models/model-f16.gguf /home/youadmin/llama-models/model-Q4_K_M.gguf Q4_K_M
```

多模態 projector 的轉換流程會依模型架構而不同；Gemma 4 unified projector 需要 llama.cpp 已支援對應 projector type。若不確定，請直接使用已發布的 `mmproj-*.gguf`。

### 9. 設定 models.ini

`models.ini` 會告訴 llama.cpp WebUI 每個模型的主模型檔、projector、context 與推論參數。12B 256K 範例：

```ini
[gemma-4-12B-it-Q4_K_M]
model = /home/youadmin/llama-models/gemma-4-12B-it-Q4_K_M.ctx262144.gguf
mmproj = /home/youadmin/llama-models/mmproj-gemma-4-12B-it-Q8_0.gguf
ctx-size = 262144
cache-ram = 0
n-predict = 4096
parallel = 1
cache-idle-slots = 0
```

12B Coder 256K 範例：

```ini
[gemma-4-12B-coder-fable5-Q4_K_M]
model = /home/youadmin/llama-models/gemma-4-12B-coder-fable5-Q4_K_M.gguf
mmproj = /home/youadmin/llama-models/mmproj-gemma-4-12B-it-Q8_0.gguf
ctx-size = 262144
cache-ram = 0
n-predict = 4096
parallel = 1
cache-idle-slots = 0
```

重點：

- `model` 必須指向主模型 GGUF
- `mmproj` 必須指向對應的 projector GGUF
- `ctx-size` 不應大於該 GGUF metadata 的 context length
- VRAM 不足時，可以先把 `ctx-size` 降低測試

### 10. 啟動 server

```bash
cd /home/youadmin/llama.cpp
./build/bin/llama-server \
  --models-preset /home/youadmin/llama-models/models.ini \
  --models-max 1 \
  --no-models-autoload \
  --host 0.0.0.0 \
  --port 8080
```

啟動後用瀏覽器開啟：

```text
http://127.0.0.1:8080/
```

若是在其他電腦連線，請依你的網路與防火牆設定使用主機 IP。

## 驗證方式

列出模型：

```bash
curl http://127.0.0.1:8080/v1/models
```

載入 12B：

```bash
curl -X POST http://127.0.0.1:8080/models/load \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma-4-12B-it-Q4_K_M"}'
```

確認 12B 已載入且使用 256K context：

```bash
curl http://127.0.0.1:8080/v1/models
```

你應該看到類似：

```text
--ctx-size 262144
--model /home/youadmin/llama-models/gemma-4-12B-it-Q4_K_M.ctx262144.gguf
--mmproj /home/youadmin/llama-models/mmproj-gemma-4-12B-it-Q8_0.gguf
```

圖片測試可使用 OpenAI-compatible `/v1/chat/completions`，傳入 `image_url` content part。若模型能描述圖片，代表主模型與 projector 都已正確載入。

## 使用情境

- 長篇文件摘要與問答
- 財報、規格書、合約草稿或會議逐字稿分析
- 程式碼庫閱讀、重構建議與技術文件整理
- 圖片內容描述與視覺問答
- 私有環境中的 AI 助理與內部工具整合
- 本機模型效能測試與 WebUI 操作體驗驗證

## 重要檔案

| 路徑 | 用途 |
| --- | --- |
| `llama-models.ini` | llama.cpp router / WebUI 的模型 preset 清單 |
| `scripts/download_gemma_models.py` | Gemma 模型下載輔助腳本 |
| `scripts/download_26b_gguf_wget.sh` | 26B GGUF 下載範例 |
| `scripts/smoke_test_gemma_assets.py` | 模型與資源檢查腳本 |
| `static/` | 早期示範頁面與前端資源 |
| `computer_use/` | 電腦操作相關實驗工具 |
| `patches/` | llama.cpp WebUI 調整 patch |
| `patches/llama-cpp-webui-public-branding-zh.patch` | WebUI favicon、使用者 email / 登出按鈕、預設繁體中文回覆規則 |
| `patches/llama-cpp-webui-mmproj-modality-fallback.patch` | WebUI 在 router 模式下可從 `--mmproj` 推斷圖片/音訊附件能力 |
| `patches/llama-cpp-webui-dynamic-context-meter.patch` | WebUI 統計列使用目前模型 context，不再固定顯示 131072 |

維運交接文件、主機清單、私有連線方式與復原紀錄不包含在公開 repo 中。

## 模型來源

主要模型來源：

- [ggml-org/gemma-4-12B-it-GGUF](https://huggingface.co/ggml-org/gemma-4-12B-it-GGUF)
- [bartowski/google_gemma-4-26B-A4B-it-GGUF](https://huggingface.co/bartowski/google_gemma-4-26B-A4B-it-GGUF)

大型模型檔、runtime output、快取與私有設定不會提交到 Git。公開部署或 fork 本專案時，請自行確認模型授權、硬體需求與下載來源。

## 執行概念

典型執行方式是使用 llama.cpp router 模式啟動 server，並指定模型 preset：

```bash
./build/bin/llama-server \
  --models-preset /path/to/llama-models.ini \
  --models-max 1 \
  --no-models-autoload \
  --host 0.0.0.0 \
  --port 8080
```

實際 production 環境可能使用客製化 build，例如支援 `gemma4uv` projector 的 llama.cpp build。若要啟用 Gemma 4 12B 的圖片能力，請確認使用的 llama.cpp 版本已支援對應 projector type，並在 preset 中設定正確的 `mmproj` 路徑。

## 常見問題

### WebUI 的圖片按鈕不能用

通常代表目前選到的模型沒有正確載入 multimodal projector。請檢查：

- `models.ini` 的該模型是否有 `mmproj = ...`
- `mmproj` 檔案是否存在
- llama.cpp 是否支援該 projector type
- server log 是否出現 `loaded multimodal model`
- 若後端 `/props?model=...` 已回報 `vision/audio=true`，但 WebUI 按鈕仍停在不可用狀態，可套用 `patches/llama-cpp-webui-mmproj-modality-fallback.patch`，讓 WebUI 在 router 模式下先依 loaded child process 的 `--mmproj` 啟用附件功能。

### 12B 256K 可以載入，但速度很慢

這是正常現象。256K context 會使用大量 KV cache。16GB VRAM 雖可載入，但餘裕很小；建議使用 24GB VRAM 以上，或把 `ctx-size` 降到較小值，例如 `65536` 或 `131072`。

### 出現 `unknown projector type: gemma4uv`

代表 llama.cpp 版本太舊。請更新 llama.cpp 到支援 Gemma 4 unified projector 的版本，重新編譯 `llama-server`。

### 模型清單有模型，但載入失敗

請確認 `models.ini` 內的模型檔案路徑存在，並檢查 GPU 記憶體是否足夠：

```bash
nvidia-smi
```

## 注意事項

- 256K context 會大量使用 VRAM；在 16GB GPU 上可載入但記憶體餘裕很小，生成速度也會明顯下降。
- 多模態模型需要同時具備主模型 GGUF 與對應的 `mmproj` 檔案。
- 本 repo 偏向本機/私有部署範例，不是託管式雲端服務。
- 維運交接文件與私有連線資料請保存在非公開位置，不要提交到公開 repo。
