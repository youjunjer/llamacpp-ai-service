# 202604_Ollama Local AI Service Plan

這個 repo 保存本機 AI 服務規劃、啟動腳本、WebUI 原型與 WSL/SSH 交接文件。大型模型、推論輸出、影片、瀏覽器 profile、runtime cache 與密碼不納入版本控制。

## 目前架構

- Windows 主機作為入口，透過 WSL 執行 Linux AI/runtime 元件。
- `LlamaCpp-Ubuntu-2404`：`llama.cpp` WebUI 與 Gemma 系列模型服務。
- `AMB_Model`：Caddy + oauth2-proxy，負責 `https://llm.mqttgo.io` Google OAuth 與反向代理。
- `Empty-Ubuntu-2404`：獨立 Ubuntu WSL，對外 SSH 經 Windows portproxy 轉發。
- `llm.mqttgo.io`：
  - HTTPS `443`：受 Google OAuth 保護的 llama.cpp WebUI。
  - SSH `8222`：轉發到 WSL 內部 SSH `2222`。

## 重要檔案

- `setup-wsl-ssh-2222-admin.ps1`：以系統管理員權限設定 Windows portproxy 與防火牆，預設 `8222 -> WSL:2222`。
- `llama-models.ini`：llama.cpp router model preset 範例，不含模型檔。
- `scripts/wsl/`：建立 WSL、安裝 llama.cpp、啟動 Gemma/WebUI 的輔助腳本。
- `static/`：早期 WebUI / YOLO / vision / voice 原型頁面。
- `computer_use/`：本機瀏覽器/桌面操作實驗原型。
- `HANDOFF.md`：交接與復原步驟。

## 不提交的內容

以下內容已由 `.gitignore` 排除：

- `models/`
- `runtime/`
- `.venv-*`
- `.playwright-mcp/`
- `tmp_chrome_profile/`
- `*.pt`, `*.gguf`, `*.safetensors`, `*.bin`
- runtime 影片、測試輸出、log、SQLite DB、憑證與 `.env`

## 快速檢查

```powershell
git status --short
git check-ignore -v models runtime *.pt *.safetensors
```

## SSH 入口

外部連線格式：

```bash
ssh -p 8222 <user>@llm.mqttgo.io
```

Windows 端 portproxy 重新套用：

```powershell
powershell.exe -ExecutionPolicy Bypass -File ".\setup-wsl-ssh-2222-admin.ps1"
```

## 注意

這份 repo 是「計畫與操作腳本」，不是完整可離線還原的模型倉庫。模型權重需依部署機器重新下載或由既有本機模型目錄提供。
