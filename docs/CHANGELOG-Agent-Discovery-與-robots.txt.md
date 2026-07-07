# Changelog: Agent Discovery / robots.txt / Markdown for Agents

日期: 2026-07-07

## 摘要

為 `https://podcast.david888.com` 補齊 agent-facing discovery 能力，讓站點能更明確地向搜尋引擎、AI crawler、與自動化 agent 宣告可抓取範圍、API 發現入口、Agent Skills index，以及 Markdown 回應能力。

本次也同步修正 lint 範圍，避免 `docs/*.md` 與 `tests/**/*` 影響主站 runtime 程式碼的 lint gate。

## 變更內容

### 1. 補上標準化 `robots.txt`

新增根路徑 `robots.txt`，回應 `200` 與 `text/plain`，並包含明確的 crawler groups：

- `GPTBot`
- `OAI-SearchBot`
- `Claude-Web`
- `Google-Extended`
- `*`

各 group 皆加入明確 `Allow` / `Disallow` 規則，允許首頁、`/.well-known/`、`/docs/api`、`/api/status` 等 agent 有用資源，並封鎖 `/_next/`、`/api/`、`/static/` 等非必要路徑。

### 2. 補上 AI content usage preferences

在 `robots.txt` 新增：

```txt
Content-Signal: ai-train=no, search=yes, ai-input=yes
```

用於向支援的 agent / crawler 宣告 AI 訓練、搜尋、與輸入使用偏好。

### 3. 首頁加上 `Link` response headers

首頁現在會回傳 agent discovery 相關的 `Link` header：

```http
Link: </.well-known/api-catalog>; rel="api-catalog"
Link: </openapi.json>; rel="service-desc"; type="application/openapi+json"
Link: </docs/api>; rel="service-doc"; type="text/html"
Link: </api/status>; rel="status"; type="application/json"
```

### 4. 發佈 API catalog

新增：

- `/.well-known/api-catalog`
- `/openapi.json`
- `/api/status`
- `/docs/api`

其中 `/.well-known/api-catalog` 以 `application/linkset+json` 回應，提供 `service-desc`、`service-doc`、`status` 等 relation。

### 5. 發佈 Agent Skills Discovery index

新增：

- `/.well-known/agent-skills/index.json`
- `/.well-known/agent-skills/{slug}`

`index.json` 內含：

- `$schema`
- `skills`
- 每個 skill 的 `name`、`type`、`description`、`url`、`sha256`

### 6. 支援 Markdown for Agents

首頁與文章頁已支援 `Accept: text/markdown`：

- `/`
- `/post/{date}`
- `/post/{date}/{variant}`

Markdown 回應會帶：

- `Content-Type: text/markdown; charset=utf-8`
- `Vary: Accept`
- `X-Markdown-Tokens`

### 7. lint scope 收斂

調整 ESLint ignore 規則：

- `*.md` 改為 `**/*.md`
- 新增忽略 `tests/**/*`

同時刪除未被引用的舊測試腳本 `test-new-sources.ts`，並修正 `README.md` 中的測試路徑。

## 主要影響檔案

- `app/robots.txt/route.ts`
- `app/.well-known/api-catalog/route.ts`
- `app/.well-known/agent-skills/index.json/route.ts`
- `app/.well-known/agent-skills/[slug]/route.ts`
- `app/api/status/route.ts`
- `app/openapi.json/route.ts`
- `app/docs/api/page.tsx`
- `app/__markdown/route.ts`
- `app/__markdown/post/[date]/route.ts`
- `app/__markdown/post/[date]/[variant]/route.ts`
- `middleware.ts`
- `lib/discovery.ts`
- `lib/content.ts`
- `eslint.config.mjs`
- `README.md`

## 部署紀錄

### 本次部署

- Web: `daily-podcast` 已成功部署
- Production URL: `https://podcast.david888.com`
- Workers URL: `https://daily-podcast.oobwei.workers.dev`
- Web Version ID: `183311b1-d5b7-4040-9683-f5a64b442e5f`

## 線上驗證結果

已確認下列線上端點回應正確：

- `GET https://podcast.david888.com/robots.txt` -> `200`, `text/plain`
- `HEAD https://podcast.david888.com/` -> 含 agent discovery `Link` headers
- `GET https://podcast.david888.com/.well-known/api-catalog` -> `200`, `application/linkset+json`

## 後續建議

- 若外部 agent-readiness 掃描仍看到舊結果，重新觸發掃描或等待其快取更新。
- `themeColor` metadata warning 與本次功能無關，可之後再遷移到 Next `viewport` export。
