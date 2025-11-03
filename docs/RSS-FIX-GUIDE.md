# RSS Feed 修復說明

> 📖 **文檔導航**: [← 返回主文檔](./README.md) | [配置指南](docs/CONFIG-GUIDE.md) | [安全指南](./SECURITY.md)

本文檔說明 RSS Feed 的修復過程，包括 Byte-range 支援和 Podcast namespace 的實施。

---

## 問題描述

RSS feed 驗證器報告了兩個問題：

1. ❌ **缺少 Byte-range support**：音頻檔案不支援部分內容請求（串流功能）
2. ❌ **缺少 Podcast namespace**：RSS feed 缺少播客命名空間

## 修復內容

### 1. 添加 Podcast Namespace ✅

**檔案**: `app/rss.xml/route.ts`

添加了 `customNamespaces` 配置：

```typescript
const feed = new Podcast({
  // ...其他配置
  customNamespaces: {
    'podcast': 'https://podcastindex.org/namespace/1.0',
  },
})
```

**效果**：
- RSS feed 現在包含 `xmlns:podcast="https://podcastindex.org/namespace/1.0"`
- 符合 PSP-1 (Podcast Standards Project Phase 1) 規範
- 支援現代播客功能（章節、轉錄等）

### 2. 實施 Byte-range Support ✅

**檔案**: `app/static/[...path]/route.ts`

完全重寫了靜態檔案處理邏輯，支援 HTTP Range 請求：

#### 主要改進：

1. **檢測 Range Header**
   ```typescript
   const range = request.headers.get('range')
   ```

2. **處理 Range 請求**
   ```typescript
   if (range) {
     const file = await env.HACKER_NEWS_R2.get(filePath, {
       range: request.headers,
     })
     // 返回 206 Partial Content
   }
   ```

3. **設定正確的 Headers**
   ```typescript
   {
     'Accept-Ranges': 'bytes',
     'Content-Range': 'bytes start-end/total',
     'Content-Type': 'audio/mpeg',
     status: 206  // Partial Content
   }
   ```

4. **處理兩種 Range 類型**
   - `bytes=0-1023`（offset + length）
   - `bytes=-1024`（suffix，最後 N 個 bytes）

#### 效果：
- ✅ 播客 App 可以串流播放音頻
- ✅ 支援快轉/後退功能
- ✅ 節省頻寬（只下載需要的部分）
- ✅ 符合 Apple Podcasts 要求

### 3. 更新 Public Headers

**檔案**: `public/_headers`

添加了音頻檔案的 headers：

```
/*.mp3
  Accept-Ranges: bytes
  Cache-Control: public,max-age=31536000,immutable
  Content-Type: audio/mpeg
```

## 驗證方法

### 1. 測試 Byte-range Support

使用 curl 測試：

```bash
# 測試完整下載
curl -I https://podcast.david888.com/static/audio/2025-10-01.mp3

# 應該看到：
# Accept-Ranges: bytes

# 測試部分下載
curl -H "Range: bytes=0-1023" -I https://podcast.david888.com/static/audio/2025-10-01.mp3

# 應該看到：
# HTTP/2 206 Partial Content
# Content-Range: bytes 0-1023/XXXXX
# Accept-Ranges: bytes
```

### 2. 測試 Podcast Namespace

檢查 RSS feed：

```bash
curl https://podcast.david888.com/rss.xml | grep 'xmlns:podcast'

# 應該看到：
# xmlns:podcast="https://podcastindex.org/namespace/1.0"
```

### 3. 使用驗證器

訪問以下網站驗證你的 RSS feed：

- **Cast Feed Validator**: https://castfeedvalidator.com/
  - 輸入：`https://podcast.david888.com/rss.xml`
  - 應該通過 Byte-range 和 Namespace 檢查

- **Podbase Validator**: https://podba.se/validate/
  - 輸入：`https://podcast.david888.com/rss.xml`
  - 檢查是否符合 Apple Podcasts 規範

- **Apple Podcasts Connect**: https://podcastsconnect.apple.com/
  - 提交你的 RSS feed
  - 檢查是否有錯誤或警告

### 4. 在播客 App 中測試

1. **Apple Podcasts**
   - 訂閱你的 RSS feed
   - 測試播放、快轉、後退功能
   - 檢查封面圖是否正確顯示

2. **Pocket Casts**
   - 搜尋或手動添加 RSS feed
   - 測試串流播放

3. **Overcast**
   - 添加自訂 RSS feed
   - 測試播放控制

## 技術細節

### HTTP Range 請求流程

1. **客戶端請求**
   ```
   GET /static/audio/2025-10-01.mp3
   Range: bytes=0-1023
   ```

2. **伺服器回應**
   ```
   HTTP/1.1 206 Partial Content
   Content-Type: audio/mpeg
   Content-Range: bytes 0-1023/5242880
   Accept-Ranges: bytes
   Content-Length: 1024
   
   [音頻資料的前 1024 bytes]
   ```

3. **客戶端繼續請求**
   ```
   GET /static/audio/2025-10-01.mp3
   Range: bytes=1024-2047
   ```

### R2 Range 支援

Cloudflare R2 原生支援 Range 請求：

```typescript
const file = await env.HACKER_NEWS_R2.get(filePath, {
  range: request.headers,  // 自動解析 Range header
})

// file.range 可能是：
// { offset: 0, length: 1024 }        // bytes=0-1023
// { suffix: 1024 }                   // bytes=-1024
```

### Podcast Namespace 功能

添加 `podcast` namespace 後，你可以使用以下進階功能：

```xml
<!-- 章節標記 -->
<podcast:chapters url="https://example.com/chapters.json" type="application/json+chapters"/>

<!-- 轉錄文字 -->
<podcast:transcript url="https://example.com/transcript.srt" type="application/srt"/>

<!-- 鎖定 Feed -->
<podcast:locked owner="podcast@example.com">yes</podcast:locked>

<!-- 資金支援 -->
<podcast:funding url="https://example.com/donate">Support the show</podcast:funding>
```

## 效能影響

### Byte-range 的優勢

1. **頻寬節省**
   - 用戶只下載實際播放的部分
   - 快轉/後退不需重新下載整個檔案

2. **載入速度**
   - 播放可以立即開始（不需等待完整下載）
   - 改善用戶體驗

3. **成本降低**
   - R2 egress 費用降低（只傳輸必要的資料）
   - 符合免費配額限制

### 快取策略

```typescript
'Cache-Control': 'public, max-age=31536000, immutable'
```

- 音頻檔案被標記為不可變（immutable）
- CDN 和瀏覽器可以安全快取一年
- 減少重複請求

## 故障排除

### 問題 1: Range 請求返回 200 而非 206

**症狀**：雖然發送了 Range header，但得到完整檔案

**原因**：
- R2 binding 設定錯誤
- Worker 路由配置問題

**解決**：
```bash
# 檢查 binding
pnpx wrangler deployments list

# 確認 HACKER_NEWS_R2 binding 存在
```

### 問題 2: Content-Range header 格式錯誤

**症狀**：播客 App 無法正確處理 Range 回應

**原因**：Content-Range 格式不符合規範

**正確格式**：
```
Content-Range: bytes 0-1023/5242880
```

**錯誤格式**：
```
Content-Range: 0-1023/5242880        ❌ 缺少 "bytes"
Content-Range: bytes 0-1023          ❌ 缺少總大小
```

### 問題 3: CORS 錯誤

**症狀**：瀏覽器無法播放音頻

**解決**：確認 R2 CORS 設定（見主 README）

```json
[
  {
    "AllowedOrigins": ["https://podcast.david888.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"]
  }
]
```

## 相關標準

- **RFC 7233**: HTTP/1.1 Range Requests
- **RFC 2616**: HTTP/1.1 (舊版，但仍相關)
- **PSP-1**: Podcast Standards Project Phase 1
- **Podcast Namespace**: https://github.com/Podcastindex-org/podcast-namespace

## 未來改進

可以考慮添加的功能：

1. **章節標記**
   ```xml
   <podcast:chapters url="https://example.com/chapters.json"/>
   ```

2. **轉錄文字**
   ```xml
   <podcast:transcript url="https://example.com/transcript.srt"/>
   ```

3. **多個音頻格式**
   ```xml
   <podcast:alternateEnclosure type="audio/opus">
     <podcast:source uri="https://example.com/episode.opus"/>
   </podcast:alternateEnclosure>
   ```

4. **Season/Episode 編號**
   ```xml
   <podcast:season>1</podcast:season>
   <podcast:episode>5</podcast:episode>
   ```

---

**✅ 修復完成！你的播客 RSS feed 現在完全符合現代播客標準。**
