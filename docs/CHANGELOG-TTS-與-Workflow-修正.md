# TTS 引擎與 Workflow 穩定性修復記錄 (2026-04-14)

## 🎯 修復目標

本次更新主要解決了語音合成 (TTS) 引擎失效、環境變數配置錯誤、工作流程 (Workflow) 重複觸發，以及播客標題偶爾未經過 LLM 美化的問題，顯著提升了系統的自動化效率與穩定性。

## 📝 主要變更

### 1. 標題美化與故障切換 (Fail-safe)

#### 標題自動補位機制 (`workflow/index.ts`)
- **問題**: 在大型劇本生成任務中，LLM 偶爾會漏掉或回傳過於簡短的標題，導致系統回退到基礎的字串拼接模式（如 `David888 Daily | 標題1 | 標題2`）。
- **修復**: 新增主動檢查點。若偵測到標題缺失，會額外發起一個極輕量的 LLM 請求專門產出 SEO 驚悚標題。
- **好處**: 確保每集都有高品質標題，同時保留最後的系統 Fallback 作為退路，不影響 Workflow 成功率。

#### Fallback 標式優化 (`lib/utils.ts`)
- **改進**: 更新了備用標題的格式，新增 `[備用標題]` 前綴，協助維護者快速辨識系統是否觸發了自動補位失敗的情況。

### 2. TTS 引擎修復與優化

#### Gemini TTS 模型代碼校正
- **修正**: 根據[官方文件](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts?hl=zh-tw)確認，正確的模型代碼應為 `gemini-2.5-flash-preview-tts`。

#### API Key 安全更新
- 更新了 `worker/wrangler.jsonc` 中的 `GEMINI_TTS_API_KEY` 與 `OPENAI_API_KEY`。

### 3. Workflow 穩定性增強

#### 防止重複觸發 Audio Workflow (`workflow/index.ts`)
- **修復**: 在觸發 Audio Workflow 之前新增 **KV 狀態鎖定 (Dedup Lock)**，防止在 Script 執行期間重複發起音訊生成實例。

#### API 路由精確化 (`worker/index.ts`)
- **修復**: 將路由條件修正為 `&&` (AND)，確保只有精確發送到 `/workflow` 的 `POST` 請求才會啟動流程。

### 4. 生產環境部署確認

- 執行了 `pnpm run deploy:worker`。
- 正確處理了部署過程中的 binding 順序差異提示。

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
