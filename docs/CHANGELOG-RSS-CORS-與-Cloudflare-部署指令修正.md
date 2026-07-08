# Changelog: RSS CORS 與 Cloudflare 部署指令修正

日期: 2026-07-08

## 摘要

本次修正兩個實際部署問題：

- `https://podcast.david888.com/rss.xml` 缺少 CORS headers，導致前端瀏覽器直接抓取 RSS 時容易被 CORS 擋住。
- Cloudflare Web 正式部署若使用 `pnpm deploy`，在 `pnpm@10` 下會被解讀成 workspace deploy 子命令，無法執行 `package.json` 中定義的 deploy script。

## 變更內容

### 1. 為 `rss.xml` 補上 CORS headers

在 [`app/rss.xml/route.ts`](../app/rss.xml/route.ts) 補上：

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Accept`

同時新增 `OPTIONS` handler，讓預檢請求也能正常回應。

### 2. 釐清正確 Web 部署指令

Cloudflare Web 的正確部署方式是：

```bash
pnpm run deploy
```

不是：

```bash
pnpm deploy
```

原因是 `pnpm@10` 會把 `pnpm deploy` 解讀成 workspace deploy 子命令，而不是 `package.json` 的 `scripts.deploy`。

### 3. 修正文檔與腳本

已同步修正以下檔案中的部署說明：

- `README.md`
- `deploy-to-cloudflare.sh`
- `setup-env-vars.sh`
- `docs/DOCS-INDEX.md`

## 主要影響檔案

- `app/rss.xml/route.ts`
- `README.md`
- `deploy-to-cloudflare.sh`
- `setup-env-vars.sh`
- `docs/DOCS-INDEX.md`

## 部署紀錄

### 本次部署

- Web: `daily-podcast` 已成功部署
- Production URL: `https://podcast.david888.com`
- Workers URL: `https://daily-podcast.oobwei.workers.dev`
- Web Version ID: `40289dc6-ce1a-481f-8c4a-1a99081b1c4b`

## 線上驗證結果

已確認：

- `HEAD https://podcast.david888.com/rss.xml` 回傳 `200`
- 回應 header 包含 `access-control-allow-origin: *`
- 回應 header 包含 `access-control-allow-methods: GET, HEAD, OPTIONS`
- 回應 header 包含 `access-control-allow-headers: Content-Type, Accept`

## 後續建議

- 若其他公開 feed 或 API 也會被瀏覽器直接抓取，應採用相同做法補齊 CORS headers。
- 後續所有部署文件應統一使用 `pnpm run deploy`，避免再次混入 `pnpm deploy`。
