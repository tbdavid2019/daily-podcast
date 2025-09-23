# Hacker News 每日播报 

原始專案來源 ： https://github.com/ccbikai/hacker-news



一个基于 AI 的 Hacker News 中文播客项目，每天自动抓取 Hacker Ne### 🚀 快速開始
- [**快速開始指南**](./QUICK-START.md) - 30 秒快速設定和運行專案
- [**Cloudflare Workers 部署指南**](./CLOUDFLARE-DEPLOY.md) - 完整的生產環境部署教學
- [**部署檢查清單**](./DEPLOY-CHECKLIST.md) - 確保部署成功的完整檢查清單

### 📋 更新日誌  
- [**新聞來源擴充實作說明**](./CHANGELOG-新聞來源擴充.md) - 新增 GitHub Trending、Product Hunt、Dev.to 三個新聞來源的詳細實作

### 🛠️ 設定工具
- [環境變數設定腳本](./setup-production-env.sh) - 一鍵設定生產環境變數
- [開發環境快速設定](./setup-dev-vars.sh) - 統一管理本地開發環境變數

### 🧪 測試工具
- [新聞來源測試腳本](./test-new-sources.js) - 測試新增的爬蟲功能I 生成中文总结并转换为播客内容。

[<img src="https://devin.ai/assets/deepwiki-badge.png" alt="DeepWiki" height="20"/>](https://deepwiki.com/ccbikai/hacker-news)

预览地址: <https://hacker-news.agi.li>

订阅地址: <https://hacker-news.agi.li/rss.xml>

![hacker-news](https://socialify.git.ci/ccbikai/hacker-news/image?description=1&forks=1&name=1&owner=1&pattern=Circuit+Board&stargazers=1&theme=Auto)

---

## 主要特性

- 🤖 自动抓取多个科技平台的热门内容
  - **Hacker News**: 热门文章与社区讨论
  - **GitHub Trending**: 开源项目 (使用 DeepWiki 增强)
  - **Product Hunt**: 新产品发布
  - **Dev.to**: 技术文章精选
- 🎯 使用 AI 智能总结文章内容和评论
- 🎙️ 通过 Edge TTS 生成中文播报
- 📱 支持网页和播客 App 收听
- 🔄 每日自动更新
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

### 🧪 測試工具
- [新聞來源測試腳本](./test-new-sources.js) - 測試新增的爬蟲功能

## 🏗️ 專案架構

> 專案由**兩個獨立的 Cloudflare Workers 應用**組成：
> 
> - **Web 應用** (根目錄): Next.js 前端，負責內容展示和 RSS 生成
> - **Worker 應用** (worker/ 目錄): 後端處理，負責爬蟲、AI 處理、音頻生成等

## 本地开发

### 前置要求

- Node.js 18+ 
- pnpm 包管理器
- OpenAI API Key (必需)
- Jina AI API Key (可選，提高爬蟲成功率)
- Firecrawl API Key (可選，作為備用爬蟲)

### 設定步驟

1. **安装依赖**:

```bash
pnpm install
```

2. **配置环境变量**:

> ⚠️ **重要**: 需要創建**兩個** `.dev.vars` 文件，因為這是兩個獨立的 Cloudflare Workers 應用

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

| 變數名稱 | 必需 | 說明 | 獲取方式 |
|---------|------|------|----------|
| `OPENAI_API_KEY` | ✅ | OpenAI API 金鑰 | [OpenAI Platform](https://platform.openai.com/) |
| `JINA_KEY` | ⭕ | Jina AI 爬蟲服務 | [Jina AI](https://jina.ai/) |
| `FIRECRAWL_KEY` | ⭕ | Firecrawl 爬蟲備用 | [Firecrawl](https://firecrawl.dev/) |

3. **启动开发服务器**:

```bash
# 开发工作流
pnpm dev:worker
# curl -X POST http://localhost:8787 # 手动触发工作流

# 开发 Web 页面
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
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL  # 你的 Web 域名
pnpx wrangler secret put NEXT_STATIC_HOST  # 你的 R2 CDN 域名
```

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
