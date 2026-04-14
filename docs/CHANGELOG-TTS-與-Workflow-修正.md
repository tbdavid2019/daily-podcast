# TTS 引擎與 Workflow 穩定性修復記錄 (2026-04-14)

## 🎯 修復目標

本次更新主要解決了語音合成 (TTS) 引擎失效、環境變數配置錯誤以及工作流程 (Workflow) 重複觸發的問題，顯著提升了系統的自動化效率與穩定性。

## 📝 主要變更

### 1. TTS 引擎修復與優化

#### Gemini TTS 模型代碼校正
- **原問題**: 之前誤以為 Google 更換了模型名稱順序，導致手動修改為錯誤的 `gemini-2.5-flash-tts-preview`。
- **修正**: 根據[官方文件](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts?hl=zh-tw)確認，正確的模型代碼應為 `gemini-2.5-flash-preview-tts`，已還原配置。

#### API Key 安全更新
- 更新了 `worker/wrangler.jsonc` 中的 `GEMINI_TTS_API_KEY` 與 `OPENAI_API_KEY`，確保使用最新且有效的 API 金鑰進行連線。

### 2. Workflow 穩定性增強

#### 防止重複觸發 Audio Workflow (`workflow/index.ts`)
- **問題**: `PodcastScriptWorkflow` 在執行結束時會自動觸發 `PodcastAudioWorkflow`。如果此時又發起新的請求，會導致兩個 Audio Workflow 重複執行。
- **修復**: 在 Script Workflow 內部觸發 Audio Workflow 之前，新增了 **KV 狀態鎖定 (Dedup Lock)** 檢查。
  - 觸發前會檢查 `workflow:running` 狀態。
  - 若已存在執行實例，則跳過觸發，避免資源浪費與重複生成。

#### API 路由精確化 (`worker/index.ts`)
- **問題**: 原本的路由判斷使用 `||` (OR) 邏輯：`if (url.pathname === '/workflow' || request.method === 'POST')`。這導致任何路徑的 `POST` 請求都會意外觸發 Workflow。
- **修復**: 將條件修正為 `&&` (AND)：`if (url.pathname === '/workflow' && request.method === 'POST')`。確保只有精確發送到 `/workflow` 的 `POST` 請求才會啟動流程。

### 3. 生產環境部署確認

- 執行了 `pnpm run deploy:worker`。
- 完成了本地 `wrangler.jsonc` 與 Cloudflare 遠端 (Remote) 配置的比對。
- 正確處理了部署過程中的 binding 順序差異提示，確保生產環境穩定運算。

## 🚀 驗證結果

### TTS 合成測試
- 使用正確的模型代碼後，`AI_APICallError: Bad Request` 問題已解決。

### Workflow 觸發測試
- 修正後的路由不再對非標的路徑產生反應。
- 重複觸發保護機制已生效，KV 鎖定能有效攔截 5 分鐘內的重複實例。

## 🔧 操作指令

如需再次部署或檢查配置：

```bash
# 部署 Worker 到 Cloudflare
pnpm run deploy:worker

# 檢查當前 Worker 設定與 Secrets
pnpm wrangler secret list --cwd worker
pnpm wrangler deployments list --cwd worker
```

---
**📖 相關文件**: [文檔索引](./DOCS-INDEX.md) | [配置指南](./CONFIG-GUIDE.md)
