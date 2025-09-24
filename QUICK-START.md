# 🚀 DAVID888 Daily Report 快速開始指南

本指南幫助您快速設定和運行 DAVID888 Daily Report 多元科技新聞播客專案。

## 📋 前置需求檢查清單

- [ ] Node.js 18+ 已安裝
- [ ] pnpm 套件管理器已安裝
- [ ] OpenAI API Key (必需)
- [ ] Jina AI API Key (可選，提高成功率)
- [ ] Cloudflare 帳號 (部署時需要)

## ⚡ 30 秒快速設定

```bash
# 1. 克隆專案
git clone https://github.com/tbdavid2019/daily-podcast.git
cd daily-podcast

# 2. 安裝相依套件
pnpm install

# 3. 快速設定環境變數
chmod +x setup-dev-vars.sh
./setup-dev-vars.sh

# 4. 啟動開發服務 (需要兩個終端)
pnpm dev:worker  # 終端 1
pnpm dev         # 終端 2
```

## � Cloudflare Workers 重新部署

### 快速重新部署指令

```bash
# 完整重新部署 (推薦)
pnpm run opennext && WRANGLER_BUILD_PLATFORM=node pnpx wrangler deploy
pnpx wrangler deploy --cwd worker

# 或使用簡化指令
pnpm deploy        # 部署 Web 應用
pnpm deploy:worker # 部署 Worker API
```

### 部署後檢查

```bash
# 檢查應用狀態
curl https://daily-podcast.oobwei.workers.dev
curl https://daily-podcast-worker.oobwei.workers.dev

# 手動觸發工作流程測試
curl https://daily-podcast-worker.oobwei.workers.dev/workflow
```

## �🔧 手動設定環境變數

如果快速設定腳本無法使用，請手動建立以下檔案：

### `.dev.vars` (根目錄)

```bash
NEXTJS_ENV=development
NEXT_STATIC_HOST=http://localhost:3000/static
```

### `worker/.dev.vars` (Worker 目錄)

```bash
# 基本配置
WORKER_ENV=development
HACKER_NEWS_WORKER_URL=http://localhost:8787
HACKER_NEWS_R2_BUCKET_URL=https://your-bucket-url

# OpenAI (必需)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 爬蟲服務 (可選)
JINA_KEY=your_jina_api_key_here
```

## 🧪 測試新功能

```bash
# 測試所有新聞來源
node test-new-sources.js

# 手動觸發工作流
curl -X POST http://localhost:8787
```

## 📚 詳細文檔

- [完整 README](./README.md) - 完整的專案說明
- [Cloudflare Workers 部署指南](./CLOUDFLARE-DEPLOY.md) - 生產環境完整部署教學
- [新聞來源擴充說明](./CHANGELOG-新聞來源擴充.md) - 新功能詳細實作
- [環境變數完整指南](./README.md#本地开发) - 詳細的配置說明

## ❓ 常見問題

**Q: 為什麼需要兩個 .dev.vars 文件？**
A: 因為專案包含兩個獨立的 Cloudflare Workers 應用 (Web 和 Worker)，每個都需要自己的環境變數。

**Q: JINA_KEY 是必需的嗎？**
A: 不是必需的，但強烈建議設定以提高爬蟲成功率。

**Q: 如何獲得 OpenAI API Key？**
A: 前往 [OpenAI Platform](https://platform.openai.com/)，註冊並創建新的 API Key。

## 🆘 需要幫助？

如果遇到問題，請：

1. 檢查環境變數是否正確設定
2. 確保所有依賴都已安裝
3. 查看終端錯誤訊息
4. 提交 GitHub Issue
