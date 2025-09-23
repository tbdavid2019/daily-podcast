# ✅ Cloudflare Workers 部署檢查清單

使用此檢查清單確保您的部署過程順利完成。

## 📋 部署前準備

### 必需項目
- [ ] Cloudflare 帳號已創建並登入
- [ ] Node.js 18+ 已安裝
- [ ] pnpm 包管理器已安裝
- [ ] OpenAI API Key 已獲取
- [ ] 專案已克隆到本地

### 可選但建議
- [ ] Jina AI API Key 已獲取 (提高爬蟲成功率)
- [ ] Firecrawl API Key 已獲取 (爬蟲備用方案)
- [ ] 自定義域名已準備 (用於生產環境)

## 🏗️ Cloudflare 資源設定

- [ ] R2 存儲桶已創建 (名稱: `hacker-news`)
- [ ] KV 存儲空間已創建
- [ ] 記錄了 KV 命名空間 ID
- [ ] 更新了 `wrangler.jsonc` 中的資源 ID
- [ ] 更新了 `worker/wrangler.jsonc` 中的資源 ID

## 🔐 環境變數設定

### Worker 應用 (必需)
- [ ] `OPENAI_API_KEY` - OpenAI API 金鑰
- [ ] `OPENAI_BASE_URL` - https://api.openai.com/v1
- [ ] `OPENAI_MODEL` - gpt-4o-mini
- [ ] `WORKER_ENV` - production
- [ ] `HACKER_NEWS_WORKER_URL` - Worker 域名
- [ ] `HACKER_NEWS_R2_BUCKET_URL` - R2 公開 URL

### Worker 應用 (可選)
- [ ] `OPENAI_THINKING_MODEL` - gpt-4o
- [ ] `OPENAI_MAX_TOKENS` - 4096
- [ ] `JINA_KEY` - Jina AI API 金鑰
- [ ] `FIRECRAWL_KEY` - Firecrawl API 金鑰

### Web 應用
- [ ] `NEXTJS_ENV` - production
- [ ] `NEXT_PUBLIC_BASE_URL` - Web 應用域名
- [ ] `NEXT_STATIC_HOST` - R2 CDN 域名

## 🚀 部署執行

- [ ] 執行 `pnpm install` 安裝依賴
- [ ] 執行 `pnpm deploy:worker` 部署 Worker
- [ ] 執行 `pnpm deploy` 部署 Web 應用
- [ ] 記錄部署後的 URL

### 或使用自動化腳本
- [ ] 執行 `./deploy-to-cloudflare.sh` 一鍵部署

## 🧪 部署驗證

### Worker 應用測試
- [ ] Worker URL 可以訪問
- [ ] 手動觸發工作流程成功: `curl -X POST https://your-worker.workers.dev`
- [ ] 檢查 Worker 日誌: `pnpm logs:worker`
- [ ] 確認定時任務配置 (每日 23:30 UTC)

### Web 應用測試
- [ ] Web 應用首頁正常顯示
- [ ] RSS 訂閱地址可訪問: `/rss.xml`
- [ ] 播客播放器功能正常
- [ ] 響應式設計在移動設備上正常

### 資源檢查
- [ ] R2 存儲桶可以寫入文件
- [ ] KV 存儲可以讀寫數據
- [ ] 音頻文件可以正常訪问

## 🌐 域名設定 (可選)

- [ ] 域名已添加到 Cloudflare
- [ ] DNS 設定已更新
- [ ] Workers 自定義域名已配置
- [ ] SSL 證書已生效
- [ ] 更新環境變數中的域名

## 📊 監控設定

- [ ] 設定 Workers 分析和監控
- [ ] 配置錯誤通知
- [ ] 設定用量警告
- [ ] 定期檢查存儲使用量

## 🔧 後續維護

- [ ] 文檔化您的配置
- [ ] 設定備份策略
- [ ] 建立更新流程
- [ ] 監控成本使用

## ❗ 常見問題檢查

如果遇到問題，檢查以下項目：

### 部署失敗
- [ ] 檢查 API Key 是否正確
- [ ] 確認 Cloudflare 資源 ID 正確
- [ ] 檢查網路連接

### 功能異常
- [ ] 檢查環境變數是否設定完整
- [ ] 確認 OpenAI API 額度充足
- [ ] 檢查 R2/KV 權限設定

### 音頻問題
- [ ] 確認 R2 存儲桶公開訪問
- [ ] 檢查 CORS 設定
- [ ] 驗證音頻文件格式

## 🎉 部署成功確認

當所有檢查項目都完成後，您應該擁有：

- ✅ 運行中的 Hacker News 播客系統
- ✅ 每日自動更新的科技新聞播客
- ✅ 響應式 Web 界面
- ✅ RSS 訂閱功能
- ✅ 全球 CDN 加速

## 📞 獲取幫助

如果遇到問題：
- 查看 [完整部署指南](./CLOUDFLARE-DEPLOY.md)
- 檢查 [README.md](./README.md) 中的詳細說明
- 提交 [GitHub Issue](https://github.com/ccbikai/hacker-news/issues)
- 查看 Cloudflare Workers 官方文檔

---

**祝您部署順利！** 🚀