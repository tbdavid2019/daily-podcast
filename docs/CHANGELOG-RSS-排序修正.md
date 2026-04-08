# Changelog: RSS 日期排序修正

日期: 2026-04-08

## 摘要

修正 `https://podcast.david888.com/rss.xml` 在 Pocket Casts 等播客 App 中未依節目日期穩定排序的問題。

問題根因不是客戶端排序邏輯，而是 RSS item 的日期與音檔 URL 都綁定到動態刷新的 `updatedAt`，導致舊集數在每次 feed 重建後看起來像是剛更新過。

## Root Cause

### 1. RSS `pubDate` 不穩定

在 `app/rss.xml/route.ts` 中，item 日期原本使用：

```ts
date: new Date(post.updatedAt || post.date)
```

但新格式資料經過 `mapScriptToArticle()` 後，`updatedAt` 被寫成：

```ts
updatedAt: Date.now()
```

這會讓每次 `rss.xml` 重建時，所有 episode 的 `pubDate` 都被刷新成當下時間。

### 2. `enclosure` URL 也不穩定

音檔連結原本使用：

```ts
url: `${env.NEXT_STATIC_HOST}/${post.audio}?t=${post.updatedAt}`
```

因為 `post.updatedAt` 每次都不同，播客 App 可能把同一集視為新內容或更新內容，進一步干擾排序與更新判定。

## 變更內容

### 1. 導入穩定時間戳

在 `lib/utils.ts` 新增 `getArticleTimestamp()`：

- 優先使用既有穩定時間戳
- 若舊資料沒有時間戳，回退到節目日期 `YYYY-MM-DDT00:00:00+08:00`

### 2. RSS 改用穩定日期

在 `app/rss.xml/route.ts`：

- RSS item `date` 改為穩定時間
- `enclosure` 的 `?t=` 參數也改為穩定時間

這樣同一集不會在每次 feed 重建後變成新的發佈時間。

### 3. Workflow 寫入 `generatedAt`

在 `workflow/index.ts` 產生腳本資料時新增：

```ts
generatedAt: Date.now()
```

並在 `workflow/types.ts` 的 `GeneratedScriptData` 中加入：

```ts
generatedAt?: number
```

這讓新產生的資料保有固定生成時間，未來 RSS 可直接使用，不必回退到節目日期。

### 4. 收斂重複 mapping 邏輯

`app/post/[date]/[variant]/page.tsx` 原本有一份獨立的 `mapScriptToArticle()`，同樣會把 `updatedAt` 設成 `Date.now()`。

這次改為直接使用 `lib/utils.ts` 內的共用邏輯，避免頁面與 RSS 之後再出現時間欄位不一致。

## 影響檔案

- `app/rss.xml/route.ts`
- `lib/utils.ts`
- `workflow/index.ts`
- `workflow/types.ts`
- `app/post/[date]/[variant]/page.tsx`
- `wrangler.jsonc`
- `worker/wrangler.jsonc`

## 部署紀錄

### Cloudflare Account

- Account name: `DAVID江江江`
- Account ID: `379570860738dd1757ba7f67ef2bdffe`

### 本次部署

- Worker: `daily-podcast-worker` 已成功部署
- Web: `daily-podcast` 已成功部署
- Web Version ID: `5e39b6e3-6150-488b-807e-a41fa1d2d961`

### 額外調整

為避免 `wrangler deploy` 因多帳號而失敗，已在以下檔案補上 `account_id`：

- `wrangler.jsonc`
- `worker/wrangler.jsonc`

## 預期結果

- RSS item 的 `pubDate` 不再於每次重建時刷新
- `enclosure` URL 不再因暫時性的 `Date.now()` 參數而被視為新檔
- Pocket Casts、Overcast、Apple Podcasts 等客戶端在重新抓取 feed 後，應能更穩定依節目日期顯示順序

## 驗證建議

1. 等待 `rss.xml` 的快取時間過期
2. 手動 refresh 播客 App 的 feed
3. 檢查舊集數是否仍維持原始日期排序
4. 若客戶端保留舊快取，可重新加入 feed 以排除本地快取影響

## 後續建議

- 將 `worker/wrangler.jsonc` 內的明文 API key 改為 `wrangler secret`
- 若未來需要更精確的發佈時間，可考慮把音檔完成時間或 workflow 完成時間作為 episode published timestamp
