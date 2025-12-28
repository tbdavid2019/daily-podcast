# 配置使用指南

> 📖 **文檔導航**: [← 返回主文檔](../README.md) | [安全指南](./SECURITY.md) | [RSS 修復指南](./RSS-FIX-GUIDE.md)

本文檔提供詳細的配置說明，包括天數限制、環境變數、域名對應等內容。

---

## 📅 天數限制配置

### 為什麼需要限制天數？

Cloudflare Workers 對每次調用有 **subrequest 限制**：
- **免費方案**: 最多 50 個子請求
- **付費方案**: 最多 1000 個子請求

每次從 KV 讀取數據都算一個子請求，如果 `keepDays` 設置過大（例如 3650 天），會導致：
```
Error: Too many API requests by single worker invocation.
```

### 配置文件位置

編輯 `config.ts`：

```typescript
// 首頁顯示的天數 (建議 7-30 天)
export const keepDays = 30

// Sitemap 顯示的天數 (建議 365 天)
export const sitemapDays = 365

// RSS 顯示的天數 (建議 10 天)
export const rssDays = 10
```

### 配置說明

| 配置項 | 預設值 | 建議範圍 | 用途 | 說明 |
|--------|--------|----------|------|------|
| `keepDays` | 30 天 | 7-30 天 | 首頁顯示 | 直接影響首頁載入速度和 KV 讀取次數 |
| `sitemapDays` | 365 天 | 90-365 天 | SEO 優化 | 不會在每次訪問時觸發，可以設置較大值 |
| `rssDays` | 10 天 | 7-30 天 | 播客訂閱 | 播客 App 通常不需要太多歷史內容 |

### 推薦配置方案

#### 🚀 快速載入方案（免費方案推薦）

適合：剛開始使用、希望最快載入速度

```typescript
export const keepDays = 7        // 一週內容，最快載入
export const sitemapDays = 90    // 三個月 SEO 覆蓋
export const rssDays = 7         // 一週 RSS
```

**優點**：
- 載入速度最快
- 完全不會觸發限制
- 適合免費方案

**缺點**：
- 歷史內容較少
- SEO 覆蓋較短

#### ⚖️ 平衡方案（推薦）

適合：一般使用、希望平衡速度和內容

```typescript
export const keepDays = 30       // 一個月內容
export const sitemapDays = 365   // 一年 SEO 覆蓋
export const rssDays = 10        // 十天 RSS
```

**優點**：
- 載入速度適中
- 內容覆蓋充足
- 免費方案可用

**缺點**：
- 需要確保免費方案限制（50 次）

#### 💪 最大內容方案（付費方案）

適合：付費用戶、需要最大歷史內容

```typescript
export const keepDays = 90       // 三個月內容
export const sitemapDays = 730   // 兩年 SEO 覆蓋
export const rssDays = 30        // 一個月 RSS
```

**優點**：
- 內容覆蓋最全
- SEO 效果最好

**缺點**：
- 需要付費方案
- 載入速度較慢

### 如何修改配置

1. **編輯配置文件**：
   ```bash
   vim config.ts
   # 或使用你喜歡的編輯器
   ```

2. **修改對應的值**：
   ```typescript
   export const keepDays = 30  // 改成你想要的天數
   ```

3. **重新部署**：
   ```bash
   pnpm run deploy:worker  # 部署 Worker
   pnpm run deploy         # 部署 Web 應用
   ```

4. **驗證**：
   訪問你的網站，檢查是否正常顯示

---

## 🌐 環境變數配置

### Worker 應用環境變數

| 變數名 | 說明 | 範例值 | 必需 |
|--------|------|--------|------|
| `WORKER_ENV` | 運行環境 | `production` | ✅ |
| `HACKER_NEWS_WORKER_URL` | 後端 Worker 域名 | `https://your-worker.workers.dev` ⚠️ **不要公開** | ✅ |
| `HACKER_NEWS_R2_BUCKET_URL` | R2 公開 URL | `https://podcast.david888.com` | ✅ |
| `OPENAI_API_KEY` | OpenAI API 金鑰 | `sk-...` | ✅ |
| `OPENAI_BASE_URL` | OpenAI API 端點 | `https://api.openai.com/v1` | ✅ |
| `OPENAI_MODEL` | OpenAI 模型 | `gpt-4o-mini` | ✅ |
| `JINA_KEY` | Jina AI 金鑰 | `jina_...` | ⭕ |
| `FIRECRAWL_KEY` | Firecrawl 金鑰 | `fc-...` | ⭕ |
| `TTS_PROVIDER` | 語音合成提供者 | `edge` / `openai` / `minimax` | ⭕ |

### Web 應用環境變數

| 變數名 | 說明 | 範例值 | 必需 |
|--------|------|--------|------|
| `NEXTJS_ENV` | 運行環境 | `production` | ✅ |
| `NEXT_PUBLIC_BASE_URL` | 前端網站域名 | `https://podcast.david888.com` | ✅ |
| `NEXT_STATIC_HOST` | R2 CDN 域名 | `https://podcast.david888.com` | ✅ |

### 環境變數用途說明

#### `HACKER_NEWS_WORKER_URL`
- **設定在**: Worker 應用
- **用途**: Workflow 內部呼叫後端 Worker API（例如音頻合併）
- **範例**: `https://your-worker.workers.dev`
- **如何獲取**: 部署 Worker 後，Cloudflare 會提供的域名
- **⚠️ 安全警告**: 不要在公開文檔中暴露此 URL，否則任何人都能觸發 workflow 消耗你的 API 配額

#### `HACKER_NEWS_R2_BUCKET_URL`
- **設定在**: Worker 應用
- **用途**: Workflow 寫入音頻檔案路徑到 KV 時使用
- **範例**: `https://podcast.david888.com`
- **如何獲取**: 
  1. 在 Cloudflare R2 設定自訂域名
  2. 或使用 R2 的公開 URL

#### `NEXT_PUBLIC_BASE_URL`
- **設定在**: Web 應用
- **用途**: 生成 RSS、Sitemap、OpenGraph 等絕對 URL
- **範例**: `https://podcast.david888.com`
- **注意**: 必須是你的網站域名，不是 Worker 域名

#### `NEXT_STATIC_HOST`
- **設定在**: Web 應用
- **用途**: 前端播放器組合音頻檔案完整 URL
- **範例**: `https://podcast.david888.com`
- **組合方式**: `NEXT_STATIC_HOST + '/' + audio`

### 域名對應關係

```
你的架構：

1. 前端網站: https://podcast.david888.com
   ├─ 環境變數: NEXT_PUBLIC_BASE_URL=https://podcast.david888.com
   └─ 環境變數: NEXT_STATIC_HOST=https://podcast.david888.com

2. 後端 Worker: https://your-worker.workers.dev (⚠️ 保密)
   ├─ 環境變數: HACKER_NEWS_WORKER_URL=https://your-worker.workers.dev
   └─ 環境變數: HACKER_NEWS_R2_BUCKET_URL=https://podcast.david888.com

3. R2 存儲: 透過自訂域名 https://podcast.david888.com 訪問
```

### 如何設定環境變數

#### 方法一：使用腳本（推薦）

```bash
./setup-env-vars.sh
```

按提示輸入各項配置。

#### 方法二：手動設定

```bash
# Worker 應用
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
# 輸入: https://your-worker.workers.dev (使用你自己的 Worker URL)

pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL
# 輸入: https://podcast.david888.com

# Web 應用
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL
# 輸入: https://podcast.david888.com

pnpx wrangler secret put NEXT_STATIC_HOST
# 輸入: https://podcast.david888.com
```

### 驗證環境變數

```bash
# 列出 Worker 環境變數
pnpx wrangler secret list --cwd worker

# 列出 Web 環境變數
pnpx wrangler secret list
```

### 常見錯誤

#### ❌ 錯誤 1: CORS 錯誤

**症狀**: 前端無法播放音頻，瀏覽器控制台顯示 CORS 錯誤

**原因**: R2 CORS 未正確設定

**解決**:
1. 進入 Cloudflare Dashboard → R2 → 你的 Bucket
2. 點擊 Settings → CORS Policy
3. 添加：
   ```json
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

#### ❌ 錯誤 2: 音頻 URL 404

**症狀**: 音頻檔案無法訪問，返回 404

**原因**: `NEXT_STATIC_HOST` 與 `HACKER_NEWS_R2_BUCKET_URL` 不一致

**解決**: 確保兩者指向同一個域名（你的 R2 公開 URL）

#### ❌ 錯誤 3: RSS Feed 連結錯誤

**症狀**: RSS 中的連結指向錯誤的域名

**原因**: `NEXT_PUBLIC_BASE_URL` 設定錯誤

**解決**: 確保設定為你的網站域名，不是 Worker 域名

---

## 🔄 完整部署流程

### 1. 修改配置

```bash
# 編輯天數配置
vim config.ts
```

### 2. 設定環境變數

```bash
# 使用腳本
./setup-env-vars.sh

# 或手動設定
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL
pnpx wrangler secret put NEXT_STATIC_HOST
```

### 3. 部署應用

```bash
# 先部署 Worker（重要：讓環境變數生效）
pnpm run deploy:worker

# 再部署 Web 應用
pnpm run deploy
```

### 4. 驗證部署

```bash
# 檢查 Worker (使用你自己的 Worker URL)
curl https://your-worker.workers.dev

# 檢查 Web
curl https://podcast.david888.com

# 檢查 RSS
curl https://podcast.david888.com/rss.xml
```

### 5. 測試功能

1. 訪問網站首頁
2. 檢查播客列表是否顯示
3. 測試音頻播放
4. 檢查 RSS 訂閱

---

## � 安全建議

### ⚠️ 重要：保護你的 Worker URL

**問題**：如果你的 Worker URL 被公開，任何人都可以：
- 觸發 workflow 生成播客
- 消耗你的 API 配額（OpenAI、TTS 等）
- 產生不必要的成本
- 可能觸發 Cloudflare Workers 的限制

**解決方案**：

#### 1. 不要在公開文檔中暴露 Worker URL

❌ **錯誤做法**：
```markdown
我的 Worker URL: https://daily-podcast-worker.oobwei.workers.dev
```

✅ **正確做法**：
```markdown
我的 Worker URL: https://your-worker.workers.dev
```

#### 2. 實施 API 認證（推薦）

在 Worker 中添加認證機制：

```typescript
// worker/index.ts
export default {
  async fetch(request: Request, env: Env) {
    // 驗證請求來源
    const authHeader = request.headers.get('Authorization')
    const expectedToken = env.API_SECRET_TOKEN
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return new Response('Unauthorized', { status: 401 })
    }
    
    // 繼續處理請求...
  }
}
```

設定密鑰：
```bash
pnpx wrangler secret put --cwd worker API_SECRET_TOKEN
# 輸入一個強密碼，例如: your-strong-random-token-here
```

#### 3. 使用 Cloudflare Access（最安全）

1. 在 Cloudflare Dashboard 中設定 Access 規則
2. 只允許特定 IP 或電子郵件訪問
3. 完全免費且易於設定

#### 4. 限制請求頻率

```typescript
// 使用 Durable Objects 或 KV 來限制請求頻率
const rateLimitKey = `rate-limit:${clientIP}`
const requestCount = await env.KV.get(rateLimitKey)

if (requestCount && parseInt(requestCount) > 10) {
  return new Response('Too Many Requests', { status: 429 })
}

await env.KV.put(rateLimitKey, String(parseInt(requestCount || '0') + 1), {
  expirationTtl: 3600 // 1 小時
})
```

#### 5. 監控異常流量

定期檢查 Worker 日誌：
```bash
pnpm logs:worker
```

注意以下異常：
- 大量來自同一 IP 的請求
- 非預期時間的請求（例如非 cron 觸發時間）
- 失敗率突然增加

### 🔐 環境變數安全最佳實踐

1. **永遠不要提交包含密鑰的文件到 Git**
   ```bash
   # .gitignore 中應包含：
   .env*
   .env.production
   .env.local
   ```

2. **使用 Cloudflare Secrets 而不是環境變數**
   ```bash
   # 使用 wrangler secret（加密存儲）
   pnpx wrangler secret put API_KEY
   
   # 而不是在 wrangler.toml 中明文設定
   ```

3. **定期輪換密鑰**
   - 每 3-6 個月更換一次 API 密鑰
   - 如果懷疑洩露，立即更換

4. **使用最小權限原則**
   - OpenAI API Key 設定使用限制
   - 只給予必要的權限

### 🚨 如果 Worker URL 已經洩露

1. **立即更改 Worker 名稱**
   ```bash
   # 編輯 worker/wrangler.jsonc
   {
     "name": "new-worker-name-12345"  # 改成新名稱
   }
   
   # 重新部署
   pnpm run deploy:worker
   ```

2. **更新環境變數**
   ```bash
   pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
   # 輸入新的 Worker URL
   ```

3. **檢查使用情況**
   - 查看 Cloudflare Analytics
   - 檢查 API 使用量是否異常

4. **實施認證機制**（見上述建議）

---

## �📞 獲取幫助

如果遇到問題：

1. **檢查日誌**：
   ```bash
   pnpm logs:worker
   ```

2. **測試新聞來源**：
   ```bash
   pnpm test:sources
   ```

3. **重新部署**：
   ```bash
   pnpm run deploy:worker
   pnpm run deploy
   ```

4. **查看錯誤訊息**：
   - Cloudflare Dashboard → Workers → 你的 Worker → Logs
   - 瀏覽器開發者工具 → Console

---

**🎉 配置完成後，你的播客系統就可以正常運作了！**
