# 202604 Ollama / llama.cpp Local AI Service

這個私有 repo 是 `llm.mqttgo.io` 本機 AI 服務的復原與交接文件。目標是在 Windows + WSL 環境中，最快重建：

- 對外 HTTPS 服務：`https://llm.mqttgo.io`
- Google OAuth 登入保護
- 每個 Google 帳號獨立對話紀錄
- llama.cpp WebUI 與 Gemma E2B / E4B 模型
- WSL SSH 管理入口：`llm.mqttgo.io:8222`

## 目前架構

| 層級 | 名稱 / 位置 | 用途 |
| --- | --- | --- |
| Windows project | `F:\GoogleDrv\AI_codex\202604_Ollama` | 本 repo、啟動腳本、WebUI/YOLO/vision/voice 測試程式 |
| WSL | `LlamaCpp-Ubuntu-2404` | llama.cpp server、Gemma GGUF 模型、WebUI binary |
| WSL | `AMB_Model` | Caddy、oauth2-proxy、history API 反向代理 |
| WSL | `Empty-Ubuntu-2404` | 對外 SSH 管理環境 |
| DNS | `llm.mqttgo.io -> 61.70.174.73` | 對外服務名稱 |
| HTTPS | `443` | Caddy 對外入口 |
| SSH | `8222 -> WSL:2222` | Windows portproxy 對外 SSH |

## 重要檔案

- `HANDOFF.md`：完整交接與復原步驟。
- `setup-wsl-ssh-2222-admin.ps1`：設定 Windows portproxy 與防火牆，預設 `8222 -> Empty-Ubuntu-2404:2222`。
- `llama-models.ini`：llama.cpp model preset，包含 E2B / E4B 的模型路徑、context 與輸出 token 設定。
- `scripts/wsl/`：建立 WSL、安裝 llama.cpp、啟動 Gemma server 的腳本。
- `scripts/start_webui_llama_wsl.ps1`：從 Windows 啟動 WSL WebUI。
- `static/`：WebUI / vision / voice / YOLO 前端測試頁。
- `computer_use/`：本機瀏覽器/桌面操作測試服務。

## 模型與大型檔案

模型本體不提交到 GitHub，復原時依照 `HANDOFF.md` 的模型清單重新下載或從備份搬回：

- `/home/youadmin/llama-models/gemma-4-E2B-it.Q4_K_M.gguf`
- `/home/youadmin/llama-models/gemma-4-E4B-it-Q4_K_M.gguf`
- `/home/youadmin/llama-models/mmproj-gemma-4-E2B-it-Q8_0.gguf`
- `/home/youadmin/llama-models/mmproj-gemma-4-E4B-it-Q8_0.gguf`

`.gitignore` 已排除 `models/`、`runtime/`、`*.gguf`、`*.safetensors`、`*.pt`、`*.bin`、影片檔與本機 cache。

## 快速檢查

```powershell
git status --short
git ls-files | Select-String -Pattern '(^|/)(models|runtime)/|\.pt$|\.gguf$|\.safetensors$|\.bin$|\.mp4$'
wsl --list --verbose
netsh interface portproxy show all
Test-NetConnection llm.mqttgo.io -Port 8222
```

## 快速啟動 / 修復

重新設定 SSH portproxy：

```powershell
powershell.exe -ExecutionPolicy Bypass -File ".\setup-wsl-ssh-2222-admin.ps1"
```

啟動 WSL WebUI 測試服務：

```powershell
powershell.exe -ExecutionPolicy Bypass -File ".\scripts\start_webui_llama_wsl.ps1"
```

外部 SSH：

```bash
ssh -p 8222 youbowei@llm.mqttgo.io
```

## 密鑰處理原則

這是 private repo，所以固定參數、網域、port、服務路徑、client id、系統設定都可記錄在文件中。

OAuth client secret、cookie secret、Linux 密碼、SSH private key 這類可直接取得系統權限的密鑰，不以明文提交；交接文件會記錄實際檔案位置、備份方式與還原命令。若要做「全密鑰離線封存」，建議另建加密壓縮檔或密碼管理器項目，再把索引寫回 `HANDOFF.md`。
