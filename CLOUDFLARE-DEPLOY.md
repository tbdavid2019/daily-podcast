# 🚀 Cloudflare Workers 完整部署指南

本指南將帶您完成從零開始在 Cloudflare Workers 上部署 Hacker News 播客系統的所有步驟。

## 📋 部署前檢查清單

- [ ] Cloudflare 帳號 (免費版即可開始)
- [ ] 安裝 Node.js 18+
- [ ] 安裝 pnpm 包管理器
- [ ] OpenAI API Key
- [ ] 專案已克隆到本地

## 🏗️ 第一步：Cloudflare 資源準備

### 1. 登入 Cloudflare Dashboard

前往 [Cloudflare Dashboard](https://dash.cloudflare.com/) 並登入您的帳號。

### 2. 創建 R2 存儲桶

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

### 3. 創建 KV 存儲空間

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

### 4. 獲取資源 ID

記錄以下信息，稍後配置時需要：

- R2 存儲桶名稱：`hacker-news`
- KV 命名空間 ID：`從上一步獲取`
- 您的 Cloudflare 帳號 ID：在 Dashboard 右側邊欄可找到

## ⚙️ 第二步：配置 Wrangler 文件

### 1. 更新根目錄 `wrangler.jsonc`

```bash
# 查看當前配置
cat wrangler.jsonc
```

確保 `kv_namespaces` 和 `r2_buckets` 中的 ID 正確：

```jsonc
{
  "name": "hacker-news",
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
    },
    {
      "binding": "NEXT_INC_CACHE_R2_BUCKET", 
      "bucket_name": "hacker-news"
    }
  ]
}
```

### 2. 更新 Worker 目錄 `worker/wrangler.jsonc`

```jsonc
{
  "name": "hacker-news-worker",
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

## 🔐 第三步：設定環境變數

### 自動化設定 (推薦)

使用提供的腳本快速設定：

```bash
# 給腳本執行權限
chmod +x setup-production-env.sh

# 執行腳本並按提示輸入值
./setup-production-env.sh
```

### 手動設定

如果腳本無法使用，請手動執行以下命令：

#### **Worker 應用環境變數**

```bash
# 基本配置
pnpx wrangler secret put --cwd worker WORKER_ENV
# 輸入: production

pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
# 輸入: https://hacker-news-worker.your-subdomain.workers.dev

pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL
# 輸入: https://pub-xxxxx.r2.dev (從 R2 設定中獲取)

# OpenAI 配置 (必需)
pnpx wrangler secret put --cwd worker OPENAI_API_KEY
# 輸入: 你的 OpenAI API Key

pnpx wrangler secret put --cwd worker OPENAI_BASE_URL
# 輸入: https://api.openai.com/v1

pnpx wrangler secret put --cwd worker OPENAI_MODEL
# 輸入: gpt-4o-mini

pnpx wrangler secret put --cwd worker OPENAI_THINKING_MODEL
# 輸入: gpt-4o

pnpx wrangler secret put --cwd worker OPENAI_MAX_TOKENS
# 輸入: 4096

# 爬蟲服務 (可選，但建議設定)
pnpx wrangler secret put --cwd worker JINA_KEY
# 輸入: 你的 Jina AI API Key

pnpx wrangler secret put --cwd worker FIRECRAWL_KEY
# 輸入: 你的 Firecrawl API Key
```

#### **Web 應用環境變數**

```bash
pnpx wrangler secret put NEXTJS_ENV
# 輸入: production

pnpx wrangler secret put NEXT_PUBLIC_BASE_URL
# 輸入: https://hacker-news.your-subdomain.workers.dev

pnpx wrangler secret put NEXT_STATIC_HOST
# 輸入: https://pub-xxxxx.r2.dev (R2 的公開 URL)
```

## 🚀 第四步：部署應用

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 部署 Worker 應用 (後端)

```bash
# 部署 Worker (處理爬蟲、AI、音頻生成)
pnpm deploy:worker
```

部署成功後會顯示 Worker URL，例如：
```
✨ Success! Deployed to https://hacker-news-worker.your-subdomain.workers.dev
```

### 3. 部署 Web 應用 (前端)

```bash
# 構建並部署 Web 應用 (用戶界面)
pnpm deploy
```

部署成功後會顯示 Web URL，例如：
```
✨ Success! Deployed to https://hacker-news.your-subdomain.workers.dev
```

## 🎯 第五步：驗證部署

### 1. 檢查 Worker 狀態

```bash
# 手動觸發工作流程
curl -X POST https://hacker-news-worker.your-subdomain.workers.dev

# 查看 Worker 日誌
pnpm logs:worker
```

### 2. 檢查 Web 應用

訪問您的 Web 應用 URL：
- 首頁應該顯示播客界面
- RSS 訂閱地址：`https://your-domain/rss.xml`

### 3. 檢查定時任務

Worker 會在每天 23:30 UTC 自動執行。您可以檢查：

```bash
# 查看 Cron 觸發器狀態
pnpx wrangler tail --cwd worker
```

## 🌐 第六步：設定自定義域名 (可選)

### 1. 添加域名到 Cloudflare

1. 在 Cloudflare Dashboard 中添加您的域名
2. 更新 DNS 設定指向 Cloudflare

### 2. 配置 Workers 路由

1. 進入 Workers & Pages
2. 選擇您的 Worker
3. 點擊 "Triggers" > "Custom Domains"
4. 添加自定義域名，例如：
   - Worker: `api.yourdomain.com`
   - Web: `yourdomain.com`

### 3. 更新環境變數

使用新域名更新相關環境變數：

```bash
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
# 輸入: https://api.yourdomain.com

pnpx wrangler secret put NEXT_PUBLIC_BASE_URL  
# 輸入: https://yourdomain.com
```

## 📊 第七步：監控和維護

### 查看使用情況

```bash
# 查看 Worker 日誌
pnpm logs:worker

# 檢查 R2 存儲使用量
pnpx wrangler r2 bucket list

# 檢查 KV 存儲
pnpx wrangler kv:namespace list
```

### 更新應用

```bash
# 拉取最新代碼
git pull origin main

# 重新部署
pnpm deploy:worker
pnpm deploy
```

## ❗ 常見問題解決

### 問題 1: 部署失敗 "Namespace not found"
**解決方案**: 檢查 `wrangler.jsonc` 中的 KV 和 R2 ID 是否正確。

### 問題 2: OpenAI API 調用失敗
**解決方案**: 
```bash
# 檢查 API Key 是否正確設定
pnpx wrangler secret list --cwd worker
```

### 問題 3: 音頻文件無法訪問
**解決方案**: 確保 R2 存儲桶設定為公開訪問，或配置正確的 CORS 設定。

### 問題 4: 定時任務未執行
**解決方案**: 檢查 `worker/wrangler.jsonc` 中的 cron 設定：
```jsonc
"triggers": {
  "crons": ["30 23 * * *"]
}
```

## 🎉 部署完成！

恭喜！您的 Hacker News 播客系統現在已成功部署到 Cloudflare Workers。

**您現在擁有**：
- 🤖 每日自動執行的新聞聚合系統
- 📱 響應式 Web 界面
- 🎙️ AI 生成的中文播客
- 📡 RSS 訂閱功能
- 🌍 全球 CDN 加速

**下一步**：
- 在播客應用中訂閱您的 RSS 地址
- 監控系統運行狀況
- 根據需要調整配置

---

**需要幫助？**
- 查看 [詳細文檔](./README.md)
- 提交 [GitHub Issue](https://github.com/ccbikai/hacker-news/issues)
- 檢查 [更新日誌](./CHANGELOG-新聞來源擴充.md)