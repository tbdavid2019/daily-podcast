# 🔒 安全指南

> 📖 **文檔導航**: [← 返回主文檔](../README.md) | [配置指南](./CONFIG-GUIDE.md) | [RSS 修復指南](./RSS-FIX-GUIDE.md)

本文檔提供完整的安全指南，包括 Worker URL 保護、API 密鑰管理、認證機制實施等內容。

---

## ⚠️ 重要安全警告

本專案包含敏感的 Worker URL 和 API 密鑰，如果洩露可能導致：

- 🚨 API 配額被濫用（OpenAI、TTS 等）
- 💸 產生意外的費用
- ⚡ 觸發 Cloudflare Workers 限制
- 🔥 服務中斷

## 🔐 必須保密的信息

### 1. Worker URL

```
❌ 不要公開: https://your-worker.workers.dev
```

**原因**: 任何人知道這個 URL 都可以觸發 workflow 生成播客

**保護方法**:

- 不要在 README、文檔中使用真實 URL
- 不要在 Git 提交中包含
- 實施 API 認證（見下方）

### 2. API 密鑰

```
❌ 不要公開:
- OPENAI_API_KEY
- JINA_KEY
- FIRECRAWL_KEY
- MINIMAX_API_KEY
```

**保護方法**:

- 使用 `wrangler secret put` 存儲
- 永遠不要提交到 Git
- 定期輪換密鑰

## 🛡️ 實施安全措施

### 方案 1: API Token 認證（推薦）

#### 步驟 1: 生成強密鑰

```bash
# 生成隨機密鑰
openssl rand -base64 32
# 輸出: 例如 abc123xyz789...
```

#### 步驟 2: 設定密鑰

```bash
pnpx wrangler secret put --cwd worker API_SECRET_TOKEN
# 輸入剛才生成的密鑰
```

#### 步驟 3: 修改 Worker 代碼

編輯 `worker/index.ts`：

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // 只對 workflow 路徑進行認證
    if (url.pathname.startsWith('/workflow')) {
      const authHeader = request.headers.get('Authorization')
      const expectedToken = env.API_SECRET_TOKEN

      if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' }
        })
      }
    }

    // 繼續處理請求...
  }
}
```

#### 步驟 4: 更新 Cron 觸發器

編輯 `worker/wrangler.jsonc`：

```jsonc
{
  "triggers": {
    "crons": ["30 23 * * *"]
  }
}
```

注意: Cloudflare Cron 會繞過認證，因為它是內部觸發

#### 步驟 5: 手動觸發時使用 Token

```bash
# 需要攜帶 Authorization header
curl -X POST https://your-worker.workers.dev/workflow \
     -H "Authorization: Bearer your-secret-token-here"
```

### 方案 2: Cloudflare Access（最簡單）

#### 步驟 1: 在 Cloudflare Dashboard 設定

1. 進入 **Zero Trust** → **Access** → **Applications**
2. 點擊 **Add an application**
3. 選擇 **Self-hosted**
4. 填寫：
   - Application name: `Daily Podcast Worker`
   - Subdomain: `your-worker`
   - Domain: `workers.dev`

#### 步驟 2: 設定訪問規則

1. 選擇 **One-time PIN** 或 **Email**
2. 添加你的電子郵件地址
3. 儲存設定

現在訪問 Worker 時需要先登入！

### 方案 3: IP 白名單

編輯 `worker/index.ts`：

```typescript
const ALLOWED_IPS = [
  '1.2.3.4', // 你的 IP
  '5.6.7.8', // 你的辦公室 IP
]

export default {
  async fetch(request: Request, env: Env) {
    const clientIP = request.headers.get('CF-Connecting-IP')

    if (url.pathname.startsWith('/workflow')) {
      if (!ALLOWED_IPS.includes(clientIP)) {
        return new Response('Forbidden', { status: 403 })
      }
    }

    // 繼續處理...
  }
}
```

### 方案 4: 速率限制

使用 Cloudflare KV 實現速率限制：

```typescript
async function checkRateLimit(env: Env, clientIP: string): Promise<boolean> {
  const key = `rate-limit:${clientIP}`
  const current = await env.HACKER_NEWS_KV.get(key)

  if (current) {
    const count = parseInt(current)
    if (count > 10) { // 每小時最多 10 次
      return false
    }
    await env.HACKER_NEWS_KV.put(key, String(count + 1), {
      expirationTtl: 3600 // 1 小時
    })
  }
  else {
    await env.HACKER_NEWS_KV.put(key, '1', {
      expirationTtl: 3600
    })
  }

  return true
}

export default {
  async fetch(request: Request, env: Env) {
    const clientIP = request.headers.get('CF-Connecting-IP')

    if (url.pathname.startsWith('/workflow')) {
      if (!await checkRateLimit(env, clientIP)) {
        return new Response('Too Many Requests', { status: 429 })
      }
    }

    // 繼續處理...
  }
}
```

## 🔍 監控與檢測

### 1. 定期檢查 Worker 日誌

```bash
# 查看最近的日誌
pnpm logs:worker

# 查看即時日誌
pnpx wrangler tail --cwd worker
```

### 2. 監控異常模式

注意以下異常：

- ✅ 預期的 Cron 觸發（每日 23:30 UTC）
- ❌ 非預期時間的大量請求
- ❌ 來自陌生 IP 的請求
- ❌ 失敗率突然增加

### 3. 設定 Cloudflare Alerts

1. 進入 Cloudflare Dashboard → **Notifications**
2. 創建新的 Alert：
   - Workers 請求量異常
   - 錯誤率過高
   - CPU 使用率過高

### 4. 檢查 API 使用量

定期檢查：

- OpenAI Usage Dashboard
- Cloudflare Analytics
- 其他 API 提供商的使用統計

## 🚨 應急響應

### 如果懷疑 Worker URL 洩露

#### 1. 立即更改 Worker 名稱

```bash
# 編輯 worker/wrangler.jsonc
{
  "name": "daily-podcast-worker-new-12345"  # 改成新的隨機名稱
}

# 重新部署
pnpm run deploy:worker
```

#### 2. 更新環境變數

```bash
# 更新 Worker 應用的 URL
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL
# 輸入新的 Worker URL

# 更新 Web 應用也需要這個 URL 嗎？檢查代碼
```

#### 3. 輪換所有 API 密鑰

```bash
# OpenAI
pnpx wrangler secret put --cwd worker OPENAI_API_KEY

# 其他密鑰...
```

#### 4. 實施認證機制

如果之前沒有認證，現在立即實施（見上述方案）

#### 5. 檢查損失

- 查看 OpenAI 使用統計
- 查看 Cloudflare Workers 請求量
- 確認是否有異常費用

### 如果懷疑 API 密鑰洩露

#### 1. 立即停用舊密鑰

- OpenAI: 前往 API Keys 頁面刪除
- 其他服務: 同樣停用

#### 2. 生成新密鑰並更新

```bash
pnpx wrangler secret put --cwd worker OPENAI_API_KEY
# 輸入新的 API Key
```

#### 3. 重新部署

```bash
pnpm run deploy:worker
pnpm run deploy
```

## 📋 安全檢查清單

部署前檢查：

- [ ] 所有敏感信息使用 `wrangler secret` 存儲
- [ ] `.gitignore` 包含 `.env*` 文件
- [ ] README 和文檔中沒有真實的 Worker URL
- [ ] README 和文檔中沒有真實的 API 密鑰
- [ ] 已實施至少一種認證方案
- [ ] 已設定速率限制
- [ ] 已設定 Cloudflare Alerts

定期檢查（每月）：

- [ ] 檢查 Worker 日誌是否有異常
- [ ] 檢查 API 使用量是否正常
- [ ] 檢查 Cloudflare Analytics
- [ ] 考慮輪換 API 密鑰

## 💡 最佳實踐

1. **最小權限原則**

   - 只給 API 密鑰必要的權限
   - OpenAI: 設定使用限制和預算

2. **分離環境**

   - 開發環境使用不同的密鑰
   - 生產環境密鑰更嚴格保護

3. **監控和告警**

   - 設定自動告警
   - 定期檢查日誌

4. **文檔安全**

   - 使用佔位符替代真實值
   - 明確標註哪些是敏感信息

5. **定期審計**
   - 每 3-6 個月輪換密鑰
   - 檢查訪問日誌
   - 更新安全措施

## 📞 報告安全問題

如果發現安全漏洞，請：

1. **不要**在公開 Issue 中討論
2. 直接聯繫專案維護者
3. 提供詳細的漏洞描述
4. 等待回應後再公開

---

**🔒 安全是持續的過程，不是一次性的任務！**
