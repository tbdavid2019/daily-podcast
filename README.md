# DAVID888 Daily Report 每日報告

基於原始專案 [Hacker News 每日播報](https://github.com/ccbikai/hacker-news) 擴展開發

**專案倉庫**: https://github.com/tbdavid2019/daily-podcast

## ✨ 專案簡介

基於 AI 技術的多元科技新聞播客，每日彙整 Hacker News、GitHub Trending、Product Hunt、Dev.to 等優質內容，自動生成繁體中文摘要並轉換為播客節目。

**預覽地址**: https://podcast.david888.com

**RSS 訂閱**: https://podcast.david888.com/rss.xml

## 🌟 新聞來源

- 🔥 **Hacker News** - 程式設計師最愛的科技新聞社群
- 🚀 **GitHub Trending** - 最熱門的開源專案 (使用 DeepWiki 增強)
- 🏆 **Product Hunt** - 創新產品發現平台
- 💻 **Dev.to** - 開發者技術文章精選

![daily-podcast](https://socialify.git.ci/tbdavid2019/daily-podcast/image?description=1&forks=1&name=1&owner=1&pattern=Circuit+Board&stargazers=1&theme=Auto)

---

## 🎯 主要特性

- 🤖 **多平台內容自動抓取**：
  - **Hacker News**: 熱門文章與社群討論
  - **GitHub Trending**: 開源專案 (使用 DeepWiki 增強)
  - **Product Hunt**: 新產品發表
  - **Dev.to**: 技術文章精選
- 🎯 **AI 智慧摘要**：支援 OpenAI / Gemini 模型智慧總結文章內容和評論
- 🎙️ **語音合成彈性**：預設 Edge TTS，亦可切換 OpenAI GPT-4o mini TTS 或 Minimax
- 📱 **多端支援**：支援網頁和播客 App 收聽
- 🔄 **自動化更新**：每日定時自動更新內容
- ☁️ **雲端部署**：完全運行在 Cloudflare Workers 上
- 📝 提供文章摘要和完整播报文本
- 🌐 智能容錯機制，确保服务稳定性

## 🚀 快速開始

### 📋 前置需求檢查清單

- [ ] Node.js 18+ 已安裝
- [ ] pnpm 套件管理器已安裝
- [ ] OpenAI API Key (必需)
- [ ] Jina AI API Key (可選，提高成功率)
- [ ] Cloudflare 帳號 (部署時需要)

### ⚡ 30 秒快速設定

```bash
# 1. 克隆專案
git clone https://github.com/tbdavid2019/daily-podcast.git
cd daily-podcast

# 2. 安裝相依套件
pnpm install

# 3. 設定生產環境變數 (明文版本，方便維護)
./setup-env-vars.sh

# 4. 部署應用
pnpm deploy:worker  # 部署 Worker
pnpm deploy         # 部署 Web 應用
```

### 🔧 詳細安裝步驟

#### 1. 環境準備
```bash
# 安裝 Node.js 18+ (如果還沒安裝)
# 前往 https://nodejs.org/ 下載並安裝

# 安裝 pnpm (如果還沒安裝)
npm install -g pnpm

# 驗證安裝
node --version  # 應為 18+
pnpm --version  # 應有版本號
```

#### 2. 專案設置
```bash
# 克隆專案
git clone https://github.com/tbdavid2019/daily-podcast.git
cd daily-podcast

# 安裝依賴
pnpm install

# 驗證安裝
pnpm --version
```

#### 3. API Key 準備
```bash
# OpenAI API Key (必需)
# 前往 https://platform.openai.com/api-keys 獲取

# Jina AI API Key (可選，但推薦)
# 前往 https://jina.ai/ 獲取

# Firecrawl API Key (可選)
# 前往 https://firecrawl.dev/ 獲取
```

#### 4. 環境變數設定
```bash
# 執行互動式設定腳本
./setup-env-vars.sh

# 腳本會提示輸入：
# - OpenAI API Key
# - OpenAI Base URL
# - OpenAI Model
# - Worker URL
# - R2 Bucket URL
# - 可選的 Jina/Firecrawl Keys
```

#### 5. 測試安裝
```bash
# 測試新聞來源可用性
pnpm test:sources

# 本地開發測試 (可選)
pnpm dev:worker  # 終端 1
pnpm dev         # 終端 2
```

### 🔧 環境變數設定

使用改進版的設定腳本，環境變數會以明文儲存在本地檔案中，方便維護：

```bash
# 互動式設定所有環境變數
./setup-env-vars.sh

# 重新載入現有的環境變數檔案
./setup-env-vars-reload.sh
```

環境變數會儲存在：
- `.env.production` - Web 應用環境變數
- `worker/.env.production` - Worker 應用環境變數

這些檔案不會被提交到 Git，確保安全性。

> ⚠️ **重要區別**：
> - **Secrets (環境變數)**：通過 `./setup-env-vars.sh` 設定，立即生效
> - **Binding (資源綁定)**：在 `wrangler.jsonc` 中配置，需要重新部署才生效
>
> 設定完環境變數後，**務必重新部署** Worker 和 Web 應用以讓 binding 生效！

### 🧪 本地開發

```bash
# 啟動開發服務 (需要兩個終端)
pnpm dev:worker  # 終端 1: 啟動 Worker
pnpm dev         # 終端 2: 啟動 Web 應用
```

### 📱 測試功能

測試新聞來源的可用性和應用功能：

```bash
# 測試所有新聞來源網站可用性
pnpm test:sources

# 或者直接運行測試腳本
node tests/test-new-sources.mjs

# 測試 Worker 應用 (本地開發時)
pnpm dev:worker

# 測試 Web 應用 (本地開發時)
pnpm dev

# 查看 Worker 日誌 (生產環境)
pnpm logs:worker
```


## ☁️ Cloudflare Workers 部署

### 第一步：Cloudflare 資源準備

#### 1. 登入 Cloudflare Dashboard
前往 [Cloudflare Dashboard](https://dash.cloudflare.com/) 並登入您的帳號。

#### 2. 創建 R2 存儲桶
R2 用於存儲生成的音頻文件。

```bash
# 使用 wrangler CLI 創建 (推薦)
pnpx wrangler r2 bucket create hacker-news

# 或者在 Dashboard 中創建：
# 1. 進入 R2 Object Storage
# 2. 點擊 "Create bucket"
# 3. 輸入名稱：hacker-news
# 4. 選擇區域 (建議 APAC)
```

#### 3. 創建 KV 存儲空間
KV 用於存儲播客元數據。

```bash
# 使用 wrangler CLI 創建
pnpx wrangler kv namespace create HACKER_NEWS_KV

# 記錄輸出的 ID，例如：
# 🌀 Creating namespace with title "HACKER_NEWS_KV"
# ✨ Success!
# To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
# {
#   "kv_namespaces": [
#     {
#       "binding": "HACKER_NEWS_KV",
#       "id": "eb092f9e71ec4c09afa31ffacf9beb40"
#     }
#   ]
# }
```

#### 4. 獲取資源 ID
記錄以下信息，稍後配置時需要：
- R2 存儲桶名稱：`hacker-news`
- KV 命名空間 ID：`從上一步獲取`
- 您的 Cloudflare 帳號 ID：在 Dashboard 右側邊欄可找到

### 第二步：配置 Wrangler 文件

#### 1. 更新根目錄 `wrangler.jsonc`

```jsonc
{
  "name": "daily-podcast",
  "kv_namespaces": [
    {
      "binding": "HACKER_NEWS_KV",
      "id": "YOUR_KV_NAMESPACE_ID_HERE"  // 替換為實際 ID
    }
  ],
  "r2_buckets": [
    {
      "binding": "HACKER_NEWS_R2",
      "bucket_name": "hacker-news"
    }
  ]
}
```

#### 2. 更新 Worker 目錄 `worker/wrangler.jsonc`

```jsonc
{
  "name": "daily-podcast-worker",
  "kv_namespaces": [
    {
      "binding": "HACKER_NEWS_KV",
      "id": "YOUR_KV_NAMESPACE_ID_HERE"  // 使用相同的 KV ID
    }
  ],
  "r2_buckets": [
    {
      "binding": "HACKER_NEWS_R2",
      "bucket_name": "hacker-news"
    }
  ]
}
```

### 第三步：環境變數設定

#### 自動化設定 (推薦)

使用提供的腳本快速設定：

```bash
# 給腳本執行權限
chmod +x setup-env-vars.sh

# 執行腳本並按提示輸入值
./setup-env-vars.sh
```

#### 手動設定

如果腳本無法使用，請手動執行以下命令：

##### Worker 應用環境變數

```bash
# 基本配置
pnpx wrangler secret put --cwd worker WORKER_ENV
# 輸入: production

pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
# 輸入: https://your-worker-domain.com

pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL
# 輸入: https://your-r2-domain.com (從 R2 設定中獲取)

# OpenAI 配置 (必需)
pnpx wrangler secret put --cwd worker OPENAI_API_KEY
# 輸入: 你的 OpenAI API Key

pnpx wrangler secret put --cwd worker OPENAI_BASE_URL
# 輸入: https://api.openai.com/v1

pnpx wrangler secret put --cwd worker OPENAI_MODEL
# 輸入: gpt-4o-mini

# OpenAI Token 參數 (可選)
pnpx wrangler secret put --cwd worker OPENAI_MAX_TOKENS
# 輸入: 4096 (或符合模型規格)

pnpx wrangler secret put --cwd worker OPENAI_MAX_COMPLETION_TOKENS
# 輸入: 16384 (或符合模型規格)

# 爬蟲服務 (可選)
pnpx wrangler secret put --cwd worker JINA_KEY
# 輸入: 你的 Jina AI API Key

pnpx wrangler secret put --cwd worker FIRECRAWL_KEY
# 輸入: 你的 Firecrawl API Key

# 語音合成 (可選)
pnpx wrangler secret put --cwd worker TTS_PROVIDER
# 輸入: edge / minimax / openai

pnpx wrangler secret put --cwd worker TTS_API_URL
# 僅在 TTS_PROVIDER=minimax 時需要: Minimax API URL (預設 https://api.minimax.chat/v1/t2a_v2)

pnpx wrangler secret put --cwd worker TTS_API_ID
# 僅在 TTS_PROVIDER=minimax 時需要: Minimax GroupId

pnpx wrangler secret put --cwd worker TTS_API_KEY
# 僅在 TTS_PROVIDER=minimax 時需要: Minimax API Key

pnpx wrangler secret put --cwd worker TTS_MODEL
# 選填: Minimax 語音模型 (預設 speech-2.5-turbo-preview)

pnpx wrangler secret put --cwd worker OPENAI_TTS_API_KEY
# 僅在 TTS_PROVIDER=openai 時需要: 你的 OpenAI TTS 金鑰

pnpx wrangler secret put --cwd worker OPENAI_TTS_BASE_URL
# 僅在 TTS_PROVIDER=openai 時需要: https://api.openai.com/v1

pnpx wrangler secret put --cwd worker OPENAI_TTS_MODEL
# 選填: gpt-4o-mini-tts (或其他 OpenAI TTS 型號)

pnpx wrangler secret put --cwd worker OPENAI_TTS_INSTRUCTIONS
# 選填: 固定語氣指示 (例如: 保持活潑愉快)

pnpx wrangler secret put --cwd worker MAN_VOICE_ID
# 選填: 男聲語音 ID (OpenAI 預設 onyx)

pnpx wrangler secret put --cwd worker WOMAN_VOICE_ID
# 選填: 女聲語音 ID (OpenAI 預設 nova)

pnpx wrangler secret put --cwd worker AUDIO_SPEED
# 選填: Edge / Minimax 語速設定
```

#### 語音合成提供者設定
#### R2 CORS 設定提醒
- 若使用自訂網域（例如 https://podcast.david888.com）提供音檔，請在 Cloudflare R2 的 **Settings → CORS** 新增：
```
[
  {
    "AllowedOrigins": [
      "https://podcast.david888.com"
    ],
    "AllowedMethods": [
      "GET"
    ]
  }
]
```
- 設定生效後，前端播放器才能直接讀取 R2 上的 mp3，避免出現 CORS 錯誤。

#### 網域與環境變數對應
- `HACKER_NEWS_R2_BUCKET_URL`（Worker）與 `NEXT_STATIC_HOST`（前端）必須都指向 R2 公開網址，例如 https://podcast.david888.com；Workflow 寫入 KV 時只會存檔案鍵值，前端播放時會組合 `NEXT_STATIC_HOST + '/' + audio`。
- `NEXT_PUBLIC_BASE_URL` 僅供前端使用，填網站本身的域名（例如 https://podcast.david888.com）。
- `HACKER_NEWS_WORKER_URL` 應設定成後端 Worker 域名（例如 https://daily-podcast-worker.oobwei.workers.dev），供流程內部呼叫。

- 預設使用 Microsoft Edge TTS，不需額外金鑰。
- 設定 `TTS_PROVIDER=openai` 後，需提供 `OPENAI_TTS_API_KEY`、`OPENAI_TTS_BASE_URL` (預設 https://api.openai.com/v1)。
- 若選擇 Minimax，請同時設定 `TTS_API_URL`、`TTS_API_ID`、`TTS_API_KEY`、`TTS_MODEL`。
- OpenAI 路徑使用 `gpt-4o-mini-tts`，男聲預設 `onyx`、女聲預設 `nova`，可透過 `MAN_VOICE_ID` / `WOMAN_VOICE_ID` 覆寫。
- GPT-4o mini TTS 單次輸入上限約 2000 tokens，過長台詞會觸發 400 錯誤，必要時請切段。
- 若文字摘要改用其他相容端點 (如 Gemini)，記得保留 `OPENAI_TTS_BASE_URL=https://api.openai.com/v1` 以免 404。

#### Token 限制調整
- `OPENAI_MAX_TOKENS` 控制抓取內容送入模型的最大輸入 tokens。
- `OPENAI_MAX_COMPLETION_TOKENS` 控制摘要 / 腳本 / 部落格輸出 tokens 的上限，避免超出模型配額。
- 未設定時分別使用 4096 與 16384 的預設值，確保相容於 GPT-4o 與 Gemini 等模型。

##### Web 應用環境變數

```bash
pnpx wrangler secret put NEXTJS_ENV
# 輸入: production

pnpx wrangler secret put NEXT_PUBLIC_BASE_URL
# 輸入: https://your-web-domain.com

pnpx wrangler secret put NEXT_STATIC_HOST
# 輸入: https://your-r2-domain.com
```

### 第四步：部署應用

```bash
# 部署 Worker 應用
pnpm deploy:worker

# 部署 Web 應用
pnpm run deploy
```

### 第五步：部署後檢查

```bash
# 檢查應用狀態
curl https://your-worker-domain.com
curl https://your-web-domain.com

# 檢查 Worker 日誌
pnpm logs:worker

# 檢查 binding 是否正確設定 (重要！)
pnpx wrangler deployments list --cwd worker
pnpx wrangler deployments list

# 手動觸發工作流程測試
```bash
# 預設執行當天流程
curl -X POST https://your-worker-domain.com/workflow

# 指定日期與強制覆寫 (JSON Body)
curl -X POST https://your-worker-domain.com/workflow \
     -H "Content-Type: application/json" \
     -d '{"today":"2025-09-24","force":true}'

# 亦可透過 Query 參數 (GET/POST 皆可)
curl "https://your-worker-domain.com/workflow?today=2025-09-24&force=true"
```


> 💡 **檢查 binding**：部署輸出中應顯示以下 binding：
> - Worker: `HACKER_NEWS_KV`, `HACKER_NEWS_R2`, `HACKER_NEWS_WORKFLOW`
> - Web: `HACKER_NEWS_KV`, `HACKER_NEWS_R2`, `ASSETS`

## ✅ 部署檢查清單

使用此檢查清單確保您的部署過程順利完成。

### 部署前準備
- [ ] Cloudflare 帳號已創建並登入
- [ ] Node.js 18+ 已安裝
- [ ] pnpm 套件管理器已安裝
- [ ] OpenAI API Key 已獲取
- [ ] 專案已克隆到本地

### Cloudflare 資源設定
- [ ] R2 存儲桶已創建 (名稱: `hacker-news`)
- [ ] KV 存儲空間已創建
- [ ] 記錄了 KV 命名空間 ID
- [ ] 更新了 `wrangler.jsonc` 中的資源 ID
- [ ] 更新了 `worker/wrangler.jsonc` 中的資源 ID

### 環境變數設定
- [ ] `OPENAI_API_KEY` - OpenAI API 金鑰
- [ ] `OPENAI_BASE_URL` - https://api.openai.com/v1 (或自訂相容端點)
- [ ] `OPENAI_MODEL` - gpt-4o-mini
- [ ] `OPENAI_MAX_TOKENS` (可選) - 最大輸入 tokens
- [ ] `OPENAI_MAX_COMPLETION_TOKENS` (可選) - 最大輸出 tokens
- [ ] `WORKER_ENV` - production
- [ ] `HACKER_NEWS_WORKER_URL` - Worker 域名
- [ ] `HACKER_NEWS_R2_BUCKET_URL` - R2 公開 URL
- [ ] `TTS_PROVIDER` (可選) - edge / minimax / openai
- [ ] `TTS_API_URL` / `TTS_API_ID` / `TTS_API_KEY` (可選) - Minimax 語音服務參數
- [ ] `TTS_MODEL` (可選) - Minimax 語音模型
- [ ] `OPENAI_TTS_API_KEY` (可選) - OpenAI TTS 金鑰
- [ ] `OPENAI_TTS_BASE_URL` (可選) - https://api.openai.com/v1
- [ ] `OPENAI_TTS_MODEL` (可選) - gpt-4o-mini-tts
- [ ] `OPENAI_TTS_INSTRUCTIONS` (可選) - 固定語氣指示
- [ ] `MAN_VOICE_ID` / `WOMAN_VOICE_ID` (可選) - 自訂聲線 ID
- [ ] `AUDIO_SPEED` (可選) - 語速設定
- [ ] `NEXTJS_ENV` - production
- [ ] `NEXT_PUBLIC_BASE_URL` - Web 應用域名
- [ ] `NEXT_STATIC_HOST` - R2 CDN 域名

### 部署執行
- [ ] 執行 `pnpm install` 安裝依賴
- [ ] 執行 `pnpm deploy:worker` 部署 Worker ⚠️ **(重要：讓 KV/R2 binding 生效)**
- [ ] 執行 `pnpm run deploy` 部署 Web 應用 ⚠️ **(重要：讓 KV/R2 binding 生效)**
- [ ] 記錄部署後的 URL
- [ ] 更新環境變數中的 URL 配置
- [ ] 測試應用功能正常

## 📊 技術架構

### 系統組件
- **Web 應用**: Next.js + React + Tailwind CSS
- **Worker 應用**: Cloudflare Workers + Hono
- **Workflow**: Cloudflare Workflows (內容生成流程)
- **存儲**: Cloudflare R2 (音頻文件) + KV (元數據)
- **AI 服務**: OpenAI/Gemini (內容摘要) + Edge / OpenAI / Minimax TTS

### 工作流程
1. **定時觸發** (每日 23:30 UTC)
2. **內容抓取** - 多平台新聞來源
3. **AI 摘要** - OpenAI / Gemini 模型生成摘要
4. **語音合成** - Edge / OpenAI / Minimax TTS 生成播客音頻
5. **音頻合併** - FFmpeg 合併多段音頻
6. **內容發布** - 更新 RSS 和網頁

## ❓ 常見問題

### 為什麼 `pnpm deploy` 會報錯 "No project was selected for deployment"？

`pnpm deploy` 是 pnpm 的內建命令，用於將 workspace 中的 package 部署到另一個位置。它需要指定目標目錄，但專案中的部署腳本是自定義的 `deploy` 腳本。

**解決方案**：使用 `pnpm run deploy` 而不是 `pnpm deploy`。

```bash
# 正確的命令
pnpm run deploy      # 運行自定義的 deploy 腳本
pnpm deploy:worker   # 運行自定義的 deploy:worker 腳本

# 錯誤的命令 (會觸發 pnpm 內建的 deploy 命令)
pnpm deploy          # 這會嘗試部署 package，但沒有指定目標
```

## 🔧 可用指令

```bash
# 開發
pnpm dev              # 啟動 Web 開發服務
pnpm dev:worker       # 啟動 Worker 開發服務

# 部署
pnpm deploy           # 部署 Web 應用
pnpm deploy:worker    # 部署 Worker 應用

# 監控
pnpm logs:worker      # 查看 Worker 日誌

# 測試
node tests/test-new-sources.mjs  # 測試新聞來源
```

## 📝 更新日誌

### 🆕 v0.3.0 - 多平台內容聚合 (2025-01-XX)
- ✅ 新增 **GitHub Trending** 開源項目追蹤 (使用 DeepWiki 增強)
- ✅ 新增 **Product Hunt** 新產品發現
- ✅ 新增 **Dev.to** 技術文章精選
- ✅ 智能容錯機制，確保單一來源失效不影響整體服務
- ✅ 針對不同內容類型的專業化 AI 處理策略

### 🆕 v0.2.0 - 基礎功能完善 (2024-XX-XX)
- ✅ 完整的 Hacker News 播客生成功能
- ✅ Cloudflare Workers 完整部署
- ✅ RSS 訂閱支援
- ✅ 響應式網頁設計

### 🆕 v0.1.0 - 初始版本 (2024-XX-XX)
- ✅ 基於原始專案的基礎功能
- ✅ 繁體中文支援
- ✅ AI 摘要和語音合成

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 📄 授權

本專案採用 MIT 授權 - 查看 [LICENSE](LICENSE) 文件了解詳情。

## 🙏 致謝

- 原始專案: [Hacker News 每日播報](https://github.com/ccbikai/hacker-news)
- AI 服務: OpenAI/Gemini (內容摘要) + Edge / OpenAI / Minimax TTS
- 語音合成: Edge TTS (預設) / OpenAI GPT-4o mini TTS / Minimax
- 雲端平台: Cloudflare Workers

---

**⭐ 如果這個專案對您有幫助，請給我們一個 Star！**
