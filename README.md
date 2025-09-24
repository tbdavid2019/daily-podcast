# DAVID888 Daily Report 每日報告

基於原始專案 [Hacker News 每日播報](https://github.com/ccbikai/hacker-news) 擴展開發

**專案倉庫**: https://github.com/tbdavid2019/daily-podcast

## ✨ 專案簡介

基於 AI 技術的多元科技新聞播客，每日彙整 Hacker News、GitHub Trending、Product Hunt、Dev.to 等優質內容，自動生成繁體中文摘要並轉換為播客節目。

**預覽地址**: https://daily-podcast.oobwei.workers.dev

**RSS 訂閱**: https://daily-podcast.oobwei.workers.dev/rss.xml

## 🌟 新聞來源

- 🔥 **Hacker News** - 程式設計師最愛的科技新聞社群
- 🚀 **GitHub Trending** - 最熱門的開源專案
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
- 🎯 **AI 智慧摘要**：使用 OpenAI GPT 模型智慧總結文章內容和評論
- 🎙️ **免費語音合成**：透過 Edge TTS 生成高品質中文播報 (無需 API Key)
- 📱 **多端支援**：支援網頁和播客 App 收聽
- 🔄 **自動化更新**：每日定時自動更新內容
- ☁️ **雲端部署**：完全運行在 Cloudflare Workers 上
- 📝 提供文章摘要和完整播报文本
- 🌐 智能容错机制，确保服务稳定性

## ✨ 最新更新

### 🆕 v0.3.0 - 多平台內容聚合

- ✅ 新增 **GitHub Trending** 開源項目追蹤 (使用 DeepWiki 增強)
- ✅ 新增 **Product Hunt** 新產品發現
- ✅ 新增 **Dev.to** 技術文章精選
- ✅ 智能容錯機制，確保單一來源失效不影響整體服務
- ✅ 針對不同內容類型的專業化 AI 處理策略

## 技术栈

- **前端**: Next.js + Tailwind CSS + shadcn-ui 組件庫
- **後端**: Cloudflare Workers + Workflows 編排
- **AI 服務**: OpenAI API (GPT-4 系列模型)
- **語音合成**: Edge TTS / Minimax Audio
- **爬蟲服務**: Jina AI + Firecrawl (雙重備援)
- **存儲**: Cloudflare R2 (音頻) + KV (元數據)
- **部署**: Cloudflare 全球 CDN

## 工作流程

1. **📊 多源數據抓取**:

   - Hacker News 熱門文章
   - GitHub Trending 開源項目 (使用 DeepWiki 增強)
   - Product Hunt 新產品發布
   - Dev.to 技術文章精選

2. **🤖 AI 智能處理**: 使用 OpenAI API 生成中文摘要和播報文稿

3. **🎙️ 語音合成**: 通過 TTS 轉換為音頻 (感謝 [Minimax Audio](https://hailuoai.com/audio) 贊助)

4. **💾 雲端存儲**: 存儲到 Cloudflare R2 和 KV

5. **📡 內容分發**: 通過 RSS feed 和網頁提供訪問

## 📖 文档索引

### � 快速開始

- [**快速開始指南**](./QUICK-START.md) - 30 秒快速設定和運行專案

### �📋 更新日誌

- [**新聞來源擴充實作說明**](./CHANGELOG-新聞來源擴充.md) - 新增 GitHub Trending、Product Hunt、Dev.to 三個新聞來源的詳細實作

### 🛠️ 設定工具

- [環境變數設定腳本](./setup-production-env.sh) - 一鍵設定生產環境變數
- [開發環境快速設定](./setup-dev-vars.sh) - 統一管理本地開發環境變數

## 🚀 快速開始

- [**快速開始指南**](./QUICK-START.md) - 30 秒快速設定和運行專案
- [**Cloudflare Workers 部署指南**](./CLOUDFLARE-DEPLOY.md) - 完整的生產環境部署教學

## 📋 更新日誌

- [**新聞來源擴充實作說明**](./CHANGELOG-新聞來源擴充.md) - 新增 GitHub Trending、Product Hunt、Dev.to 三個新聞來源的詳細實作

## 🛠️ 設定工具

- [環境變數設定腳本](./setup-production-env.sh) - 一鍵設定生產環境變數
- [開發環境快速設定](./setup-dev-vars.sh) - 統一管理本地開發環境變數

## 🧪 測試工具

- [新聞來源測試腳本](./test-new-sources.js) - 測試新增的爬蟲功能

---

## 🏗️ 專案架構

> 專案由**兩個獨立的 Cloudflare Workers 應用**組成：
>
> - **Web 應用** (根目錄): Next.js 前端，負責內容展示和 RSS 生成
> - **Worker 應用** (worker/ 目錄): 後端處理，負責爬蟲、AI 處理、音頻生成等

## ☁️ Cloudflare Workers 重新部署

### 🔄 完整重新部署流程

```bash
# 1. 重新建構和部署 Web 應用
pnpm run opennext
WRANGLER_BUILD_PLATFORM=node pnpx wrangler deploy

# 2. 重新部署 Worker API
pnpx wrangler deploy --cwd worker

# 3. 檢查部署狀態
pnpx wrangler list
```

### 🎯 單獨部署指令

```bash
# 只部署 Web 應用 (前端)
pnpm deploy

# 只部署 Worker API (後端)
pnpm deploy:worker

# 檢視 Worker 即時日誌
pnpm logs:worker
```

### 🔧 部署後確認

1. **檢查應用狀態**：

   - Web 應用：https://daily-podcast.oobwei.workers.dev
   - Worker API：https://daily-podcast-worker.oobwei.workers.dev
   - RSS 訂閱：https://daily-podcast.oobwei.workers.dev/rss.xml

2. **手動觸發工作流程**：

   ```bash
   curl https://daily-podcast-worker.oobwei.workers.dev/workflow
   ```

3. **檢查環境變數**：
   ```bash
   # 列出所有 secrets
   pnpx wrangler secret list
   pnpx wrangler secret list --cwd worker
   ```

---

## 💻 本地開發

### 📋 前置需求

- Node.js 18+
- pnpm 套件管理器
- OpenAI API Key (必需)
- Jina AI API Key (可選，提高爬蟲成功率)
- Firecrawl API Key (可選，作為備用爬蟲)

### 🛠️ 設定步驟

1. **安裝相依套件**：

```bash
pnpm install
```

## �️ TTS 語音合成技術

### 🔊 預設使用 Edge TTS (免費)

本專案預設使用 **Microsoft Edge TTS**，具有以下優勢：

- ✅ **完全免費** - 無需任何 API Key
- ✅ **高品質** - 微軟專業級語音合成技術
- ✅ **中文支援** - 優秀的繁體/簡體中文發音
- ✅ **雲端運行** - 在 Cloudflare Workers 上原生執行
- ✅ **多種聲音** - 支援男聲/女聲切換

```typescript
// 預設語音配置 (無需設定任何環境變數)
男聲: zh-CN-YunyangNeural
女聲: zh-CN-XiaoxiaoNeural
語速: +10%
```

### 🚀 進階選項：Minimax TTS (付費)

如果需要更專業的商業級語音品質，可選擇 Minimax TTS：

```bash
# 設定環境變數啟用 Minimax TTS
pnpx wrangler secret put --cwd worker TTS_PROVIDER
# 輸入: minimax

pnpx wrangler secret put --cwd worker TTS_API_KEY
# 輸入您的 Minimax API Key
```

---

## 💻 本地開發環境設定

### 📋 系統需求

- Node.js 18+
- pnpm 套件管理器
- OpenAI API Key (必需)
- Jina AI API Key (可選，提高爬蟲成功率)

### 📋 API Key 需求

- OpenAI API Key (必需)
- Jina AI API Key (可選，提高爬蟲成功率)
- Firecrawl API Key (可選，作為備用爬蟲)

### 🛠️ 環境設定步驟

1. **安裝相依套件**：

```bash
pnpm install
```

2. **配置環境變數**：

> ⚠️ **重要**：需要建立**兩個** `.dev.vars` 檔案，因為這是兩個獨立的 Cloudflare Workers 應用

#### **根目錄 `.dev.vars` (Web 應用)**

```bash
# Next.js Web 應用環境變數
NEXTJS_ENV=development
NEXT_STATIC_HOST=http://localhost:3000/static
```

#### **worker/.dev.vars (Worker 應用)**

```bash
# Worker 基本配置
WORKER_ENV=development
HACKER_NEWS_WORKER_URL=http://localhost:8787
HACKER_NEWS_R2_BUCKET_URL=https://your-bucket-url

# OpenAI 配置 (必需)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_THINKING_MODEL=gpt-4o
OPENAI_MAX_TOKENS=4096

# 爬蟲服務 API Keys (可選，提高成功率)
JINA_KEY=your_jina_api_key_here
FIRECRAWL_KEY=your_firecrawl_api_key_here
```

#### **環境變數說明**

| 變數名稱         | 必需 | 說明               | 獲取方式                                        |
| ---------------- | ---- | ------------------ | ----------------------------------------------- |
| `OPENAI_API_KEY` | ✅   | OpenAI API 金鑰    | [OpenAI Platform](https://platform.openai.com/) |
| `JINA_KEY`       | ⭕   | Jina AI 爬蟲服務   | [Jina AI](https://jina.ai/)                     |
| `FIRECRAWL_KEY`  | ⭕   | Firecrawl 爬蟲備用 | [Firecrawl](https://firecrawl.dev/)             |

3. **啟動開發伺服器**：

```bash
# 開發 Worker 工作流程
pnpm dev:worker
# curl -X POST http://localhost:8787 # 手動觸發工作流程

# 開發 Web 應用
pnpm dev
```

> 注意：
>
> - 本地运行工作流时，Edge TTS 转换音频可能会卡住。建议直接注释该部分代码进行调试。
> - 由于合并音频需要使用 CloudFlare 的浏览器端呈现，不支持本地开发，需要远程调试。 可以使用 `npm run test` 进行测试。

### 📋 開發流程

```bash
# 同時啟動兩個服務 (需要兩個終端)
pnpm dev:worker  # 終端 1: 啟動 Worker (後端)
pnpm dev         # 終端 2: 啟動 Web (前端)

# 手動觸發工作流測試
curl -X POST http://localhost:8787
```

### ⚠️ 開發注意事項

- 本地運行工作流時，Edge TTS 轉換音頻可能會卡住，建議注釋該部分代碼進行調試
- 音頻合併需要 Cloudflare 瀏覽器渲染，不支援本地開發，可使用 `pnpm tests` 遠程測試
- 確保兩個 `.dev.vars` 文件都正確配置

## 🚀 部署

### 準備工作

1. **創建 Cloudflare 資源**:

   - R2 存儲桶 (用於音頻文件存儲)
   - KV 存儲空間 (用於元數據存儲)
   - 綁定自定義域名 (可選但建議)

2. **更新配置文件**:
   - 修改 `wrangler.jsonc` 中的 KV 和 R2 ID
   - 修改 `worker/wrangler.jsonc` 中的相應配置

### 環境變數設定

#### **Worker 應用環境變數**

```bash
# 基本配置
pnpx wrangler secret put --cwd worker WORKER_ENV  # production
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL  # 你的 Worker 域名
pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL  # 你的 R2 域名

# OpenAI 配置
pnpx wrangler secret put --cwd worker OPENAI_API_KEY
pnpx wrangler secret put --cwd worker OPENAI_BASE_URL
pnpx wrangler secret put --cwd worker OPENAI_MODEL
pnpx wrangler secret put --cwd worker OPENAI_THINKING_MODEL
pnpx wrangler secret put --cwd worker OPENAI_MAX_TOKENS

# 爬蟲服務 (可選)
pnpx wrangler secret put --cwd worker JINA_KEY
pnpx wrangler secret put --cwd worker FIRECRAWL_KEY
```

#### **Web 應用環境變數**

```bash
pnpx wrangler secret put NEXTJS_ENV  # production
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL  # 您的 Web 網域名稱
pnpx wrangler secret put NEXT_STATIC_HOST  # 您的 R2 CDN 網域名稱
```

### 📦 部署指令

```bash
# 部署 Worker 應用
pnpm deploy:worker

# 部署 Web 應用
pnpm deploy
```

> 💡 **提示**：可以使用專案根目錄的 `setup-production-env.sh` 腳本來批次設定環境變數

---

## 🤝 貢獻與支持

歡迎提交 Issue 和 Pull Request！

## 💖 贊助與致謝

- **[Minimax Audio](https://hailuoai.com/audio)**：讓文字栩栩如「聲」
- **原作者致謝**：感謝 [ccbikai](https://github.com/ccbikai) 開發的原始專案

## 📧 聯繫方式

- **GitHub**：[tbdavid2019](https://github.com/tbdavid2019)
- **專案倉庫**：[daily-podcast](https://github.com/tbdavid2019/daily-podcast)

## ⚖️ 免責聲明

本專案基於開源專案 [Hacker News 每日播報](https://github.com/ccbikai/hacker-news) 擴展開發，與 Hacker News、Y Combinator、GitHub、Product Hunt、Dev.to 等平台沒有官方關聯。所有商標均為其各自所有者的財產。

````

#### **Web 應用環境變數**

```bash
pnpx wrangler secret put NEXTJS_ENV  # production
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL  # 你的 Web 域名
pnpx wrangler secret put NEXT_STATIC_HOST  # 你的 R2 CDN 域名
````

### 部署命令

```bash
# 部署 Worker 應用
pnpm deploy:worker

# 部署 Web 應用
pnpm deploy
```

> 💡 **提示**: 可以使用項目根目錄的 `setup-production-env.sh` 腳本來批量設定環境變數

## 贡献

欢迎提交 Issue 和 Pull Request!

## 赞助

- **[Minimax Audio](https://hailuoai.com/audio)**：让文字栩栩如“声”

1. [在 Telegram 关注我](https://t.me/miantiao_me)
2. [在 𝕏 上关注我](https://404.li/x)
3. [在 GitHub 赞助我](https://github.com/sponsors/ccbikai)

## 免责声明

本项目与 Hacker News 和 Y Combinator 没有任何关联。"Hacker News" 是 Y Combinator 的注册商标。
