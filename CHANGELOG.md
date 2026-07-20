# 更新日誌 (Changelog)

本專案的所有更新歷史紀錄。最新的變更會排在最上方。

---

## [2026-07-20] Next.js 與 production dependencies 安全更新

### 摘要

修補既有 Next.js App Router／React Server Components 安全風險，並更新相依的
Cloudflare adapter 與 production toolchain。Next.js 由 15.4.6 升至 15.5.20，
production audit 從 60 項降至 4 項，Critical 與 High 均降為 0。

### 版本與範圍

- Next.js `15.4.6 → 15.5.20`、React／React DOM `19.1.1 → 19.2.7`、
  `eslint-config-next` 同步至 15.5.20。
- `@opennextjs/cloudflare 1.6.5 → 1.20.1`、Wrangler `4.110.0 → 4.112.0`；
  OpenNext 官方支援 Next.js 15 最新 minor，雙 Worker 均重新 bundle 驗證。
- 同步更新 Cloudflare Puppeteer、Cheerio、Radix UI、Markdown、Tailwind 與 lint／
  TypeScript tooling，因此本次是受控 dependency refresh，不只是單一 Next patch。
- 保持 `ai` 4.3.19 與 `@ai-sdk/openai` 1.3.24 的既有 major，避免 AI 產生流程
  被非必要的 major migration 影響。
- Wrangler typegen 產生的 workerd runtime version 註解同步提交，確保
  `pnpm install --frozen-lockfile` 後工作樹可重現。

### 剩餘 audit findings

`pnpm audit --prod` 尚有 2 moderate、2 low，沒有 Critical／High：

- `jsondiffpatch` HTML formatter XSS（由 AI SDK 間接帶入；本專案未使用 formatter）。
- Next.js 內部 PostCSS stringify XSS（moderate，等待上游 dependency 更新）。
- AI SDK file upload whitelist bypass（low；本專案未提供 AI file upload）。
- `@ai-sdk/provider-utils` resource consumption（low，目前 advisory 無修補版本）。

### 驗證

- `pnpm install --frozen-lockfile`：通過，lockfile 可重現。
- `pnpm check`：通過；TypeScript 0 error、ESLint 0 error（6 個既有 warning）、
  38 項 Workflow／觸發腳本 tests 與 5 項 build/tooling gate tests 通過。
- OpenNext production build：Next.js 15.5.20、React 19.2.7、adapter 1.20.1 成功。
- Web Worker dry-run：gzip 1683.99 KiB；Generation Worker dry-run：297.74 KiB，
  皆低於 Workers Free Plan 3 MiB 限制。
- 本機 OpenNext Worker curl smoke：首頁、status API、RSS、API docs、API catalog、
  robots.txt 均回傳 200 且 MIME 正確。

官方依據：

- https://nextjs.org/blog/CVE-2025-66478
- https://nextjs.org/blog/security-update-2025-12-11
- https://nextjs.org/support-policy
- https://opennext.js.org/cloudflare

---

## [2026-07-20] 音訊合併改為 bounded-memory R2 Multipart

### 摘要

移除 Audio Workflow 最後一步的 whole-podcast buffering。原本會把所有 batch
完整讀入記憶體，再配置第二份 combined buffer；長音檔因此可能瞬間超過 Workers
Free Plan 的 128MB 記憶體限制。現在改用 R2 Multipart Upload 與 range stream，
Worker 不再持有整集音訊。

### 設計與恢復性

- 先以 R2 `head()` 取得 batch 大小，再將邏輯音訊重新規劃為 5 MiB 固定 Parts；
  最後一個 Part 才允許較小，並限制最多 10,000 Parts，符合 R2 multipart 規則。
- 每個 Part 由 R2 ranged `get()` 讀取來源，透過 `FixedLengthStream` 與原生
  `pipeTo()` 直接送入 `uploadPart()`；不呼叫 final batch 的 `arrayBuffer()`，也不
  建立整集 `Uint8Array`。
- Gemini WAV batch 的 44-byte headers 全部略過，只在邏輯輸出的最前方串流一個
  依總 PCM 長度產生的新 header，確保完成物件是單一有效 WAV，而不是多個 WAV
  檔案的直接串接。
- Multipart 建立後會把 `uploadId` 寫入 instance-specific R2 checkpoint。若
  Workflow step 在成功後重播，可恢復同一個 upload；每個 Part 使用 deterministic
  step name 與 part number，重試只覆寫該 Part。
- Complete step 先檢查最終物件的 `workflowInstanceId` metadata，處理「完成成功、
  step state 尚未提交」的重播情況；真正失敗時會 abort multipart 並刪除 checkpoint。
  成功後才清除 segment、batch 與 multipart 暫存物件。
- R2 官方會在 7 天後自動 abort 未完成的 multipart upload，覆蓋 create 成功但
  checkpoint 寫入前即中斷的極小 orphan window。

### 驗證

- 新增 MP3/WAV part layout、WAV RIFF header、range streaming、R2 part 上限與
  final merge 禁止 whole-buffer regression tests。
- `pnpm check`：通過；TypeScript 0 error、ESLint 0 error（6 個既有 warning）、
  38 項 Workflow／觸發腳本 tests 與 5 項 build/tooling gate tests 通過。
- Generation Worker dry-run：成功，gzip 274.74 KiB，未新增 binding 或 dependency。

官方依據：

- https://developers.cloudflare.com/r2/objects/upload-objects/
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/

---

## [2026-07-20] Workflow subrequest、重試與持久化狀態優化

### 摘要

針對 Cloudflare Workers Free Plan 的 50 個外部 subrequests、100MB Workflow
instance state 與重試成本，將大型來源抓取拆成可獨立恢復的步驟，統一昂貴操作的
重試政策，並以 deterministic R2 checkpoint 避免 AI/TTS 成功結果被整批重做。

### 變更內容

- Hacker News 等來源從「每個來源一個 step」改為「每篇故事一個 step」。單篇故事
  即使走完 3 個 Jina 節點及 Firecrawl fallback，含一次 Workflow retry 的最壞值
  仍低於 Free Plan 的 50 個外部 subrequests。
- 原始文章不再直接成為大型 step output。每篇內容先寫入強一致 R2，step state
  只保存短 object key；checkpoint 保留 4 天，後續每日 Workflow 清除過期 prefix，
  覆蓋 Free Plan 已完成 instance 的 3 天狀態保留期。
- 文字 AI 呼叫關閉 SDK 內層 retry，Workflow step 總 attempts 設為 2；以 Podcast
  script 生成為例，最壞呼叫數由 `5 × 4 = 20` 降為 `2 × 1 = 2`。
- TTS 移除 batch 內的手動 retry loop。每個 segment 與 batch 使用包含 Workflow
  instance ID 的 deterministic R2 key；step retry 只重做缺少的片段，不會重做已
  checkpoint 的成功片段。
- 最終音檔加入 `workflowInstanceId` R2 metadata。若 merge step 在 upload 後重播，
  可辨識同一 instance 已完成；不同 force rerun 仍會正確覆寫最終音檔。
- Reddit 跨天去重改為 14 天 TTL 的小型索引。首次部署會相容讀取近 7 天 script
  建立索引，之後每日由 7 次完整 script KV reads 降為 1 次 index read。
- Workflow 日期與 `generatedAt` 改由 durable `event.timestamp` 推導，跨午夜 replay
  不會改變日期、step 名稱或 object key。
- 限制 AI 輸出最多 40 行對話、每行 2,000 字，確保 TTS steps 與暫存物件數量有界。
- Script Workflow 最終 output 改為 script/audio key 與計數摘要；Audio Workflow
  的 load step 只持久化 dialogue，不再重複保存 blog、stories 與 summaries。

### 驗證結果

- `pnpm check`：通過；TypeScript 0 error、ESLint 0 error（6 個既有 warning）。
- Workflow tests：30 項通過，其中新增 8 項 retry/checkpoint/index regression tests。
- Build/tooling tests：5 項通過。
- Generation Worker dry-run：成功，gzip 約 273 KiB。

### 後續

最終 `merge audio batches` 的 128MB OOM 風險已在同日後續的 bounded-memory R2
Multipart 變更中完成處理。

---

## [2026-07-20] TypeScript 修復與前後端 Build Gate

### 摘要

修復專案既有的 10 個 TypeScript 錯誤，移除 Next.js 跳過 lint／型別錯誤的設定，
並新增本機統一檢查指令與 GitHub Actions。現在 push 到 `main` 或建立 PR 時，會
自動驗證前端 OpenNext bundle 與 Generation Worker bundle。

### 根因與修復

- `NEXT_STATIC_HOST` 只存在部署環境，未納入根 `wrangler.jsonc`，導致 Wrangler
  無法產生正確 `CloudflareEnv`；現在已版本化該 binding 並重新產生
  `cloudflare-env.d.ts`。
- `mapScriptToArticle()` 會回傳 `variant`，但 `Article` 契約漏掉此欄位；現在以
  optional field 保持舊 KV 資料相容。
- Audio Workflow 將 `Uint8Array.buffer` 傳入 R2，使新版 TypeScript 將型別擴大
  為可能包含 `SharedArrayBuffer`；現在直接傳遞 `Uint8Array` view，移除不安全的
  `as ArrayBuffer`。
- 移除 `next.config.mjs` 的 `ignoreBuildErrors` 與 `ignoreDuringBuilds`，正式 build
  不再隱藏型別或 lint failure。
- 移除 ESLint 9 已停用且與 `eslint.config.mjs` 重複的 `.eslintignore`。
- 將 `.node-version` 升級為 Node.js 24，並在 `package.json` 宣告 Node.js 22+
  requirement，符合目前 Wrangler 的 runtime 要求。
- 修正 `postinstall` 呼叫未設定的 `simple-git-hooks` 所造成的乾淨安裝失敗；現在
  只執行 Cloudflare typegen，並以小型 normalization script 清除產生檔尾端空白。

### 新增 Build Gate

```bash
# 一次執行 lint、typecheck 與所有本機 gate tests
pnpm check

# 分別執行
pnpm typecheck
pnpm test:build-gate
pnpm opennext
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy --cwd worker --dry-run
```

`.github/workflows/quality-gate.yml` 會在 push／PR 執行 frozen-lockfile 安裝、lint、
typecheck、22 項 Workflow tests、5 項 build/tooling gate tests、OpenNext production build，
以及前後端兩個 Wrangler dry-run。CI 僅使用 read-only repository permission，不含
任何 production Secret 或自動部署權限。

### 驗證結果

- `pnpm typecheck`：0 error（原 10 個錯誤已清除）。
- `pnpm check`：通過；ESLint 0 error，保留 6 個既有 warning。
- `pnpm install --frozen-lockfile`：Node.js 24 下通過，postinstall 可重現且不留下
  generated diff。
- `pnpm build`：通過，且輸出確認執行 lint 與型別檢查。
- `pnpm opennext`：Cloudflare frontend production bundle 成功。
- Frontend Worker dry-run：成功，gzip 約 1.74 MiB。
- Generation Worker dry-run：成功，gzip 約 272 KiB。

---

## [2026-07-20] Workflow 認證、冪等防重與 Cloudflare Secrets 遷移

### 摘要

生成 Worker 的公開 `POST /workflow` 原本沒有實作認證，任何知道網址的人都能
啟動 AI 文稿與 TTS 工作。本次加入 Bearer Token 保護、輸入驗證、確定性的
Workflow instance ID 與安全的手動重跑腳本，同時將部署設定中的 AI/TTS 明文
金鑰遷移到 Cloudflare Secrets。

### 變更內容

#### 1. 保護公開 Workflow 入口

- `POST /workflow` 必須提供 `Authorization: Bearer <token>`。
- 生產環境未配置 `API_SECRET_TOKEN` 時採 fail-closed，回傳 `503`，不會在無認證
  狀態下繼續執行。
- Token 缺少或錯誤時回傳 `401`；非 `POST` 請求回傳 `405`。
- JSON body 與 query string 經 schema 驗證；格式錯誤、無效日期及不支援的參數
  不會啟動 Workflow。
- Cloudflare Cron 與 Script → Audio 的內部 Workflow binding 不經公開 HTTP
  入口，因此不需要 Bearer Token。

#### 2. 冪等與防止重複付費工作

- 一般執行依環境、日期、variant 與 phase 產生固定 Workflow instance ID。
- Cron、手動請求或網路重送同時抵達時，重複的 instance 會回傳既有工作，不再
  建立第二份 AI/TTS 工作。
- `force` 重跑必須使用 `Idempotency-Key`；相同 key 可以安全重送，不同 key 才會
  建立新的刻意重跑。
- Audio Workflow ID 由 parent Script Workflow instance ID 派生，避免 step retry
  重複建立聲音工作。
- 移除原本只有五分鐘有效且採 eventual-consistent KV 的重複鎖定，改由 Cloudflare
  Workflow instance ID 提供建立時的唯一性。

#### 3. 首次設定與日常重跑指令

```bash
# 首次產生本機 Token（不會把 Token 印到終端）
pnpm workflow:setup --worker-url https://your-generation-worker.workers.dev

# 將同一組 Token 寫入 Cloudflare API_SECRET_TOKEN
pnpm workflow:secret

# 重新產生文稿，完成後自動接續聲音
pnpm workflow:run --today 2026-07-20 --force

# 只重新產生聲音
pnpm workflow:audio --today 2026-07-20
```

Token 儲存在 `.env.workflow.local`，檔案權限為 `0600` 且已被 Git 忽略，不需背誦
或放入指令參數。建議另外保存於密碼管理器。

#### 4. Token 遺失與輪換

```bash
pnpm workflow:setup \
  --worker-url https://your-generation-worker.workers.dev \
  --rotate
pnpm workflow:secret
```

第二個指令成功後舊 Token 立即失效。若上傳失敗，可直接重跑
`pnpm workflow:secret`；Cron 與內部 Workflow binding 不受 Token 輪換影響。

#### 5. AI/TTS 金鑰安全遷移

- `GEMINI_TTS_API_KEY` → `GEMINI_TTS_API_SECRET`
- `OPENAI_API_KEY` → `OPENAI_API_SECRET`
- `OPENAI_TTS_API_KEY` → `OPENAI_TTS_API_SECRET`
- 程式暫時保留舊名稱 fallback，避免既有環境在遷移期間中斷；新部署與文件統一
  使用 `*_SECRET`。
- `worker/wrangler.example.jsonc` 不再包含任何 API Key placeholder，且設定
  `keep_vars: false`，由版本化設定完整管理非敏感 vars。
- 新增遷移腳本 `pnpm workflow:migrate-secrets`，只有 Cloudflare Secret 上傳成功
  後才會移除本機明文值，且不會輸出金鑰內容。

#### 6. 測試與上線驗證

- 新增 17 項認證、輸入解析與冪等單元測試。
- 新增 5 項手動觸發腳本測試，共 22 項全部通過。
- ESLint 通過，保留 6 個與本次變更無關的既有 warning。
- TypeScript 仍有 10 個先前已存在的錯誤，將在下一階段修復 build gate；本次沒有
  新增 TypeScript 錯誤。
- 生產 smoke test：未授權請求回傳 `401`；正確 Token 搭配刻意無效 JSON 回傳
  `400`，確認認證有效且未啟動任何 Workflow。
- 2026-07-20 首次上線版本：`8226f868-78a5-48cc-ac21-dd3dadb240c8`。

### 安全提醒

舊設定曾讓 AI/TTS 金鑰出現在部署輸出。雖然 Worker 已改用 Cloudflare Secrets，
仍應在對應供應商後台輪換舊金鑰，再更新 `GEMINI_TTS_API_SECRET`、
`OPENAI_API_SECRET` 與 `OPENAI_TTS_API_SECRET`。

---

## [2026-07-08] 播放器懸浮固定與 RSS 格式優化

### 🎯 優化與修復目標
解決了網頁端播放器無法固定漂浮在最上方的問題、修改了頁尾（Footer）的商標與版權聲明，並優化了 RSS XML 的生成結構，解決了 YouTube Podcast RSS 匯入時因為描述過長而產生的警告訊息，同時也滿足了聽眾在 Apple Podcasts 等客戶端收聽時能夠直觀點擊回連至網站原文章的期待。

### 📝 變更內容
#### 1. 網頁播放器懸浮固定修復 (`components/article-card.tsx`)
- **問題**: 之前版本在 `Card` 元件加上了 `overflow-hidden`，這會限制子元素的粘性定位 (`position: sticky`)，導致播放器無法在滾動時固定於最上方。
- **修復**:
  - 移除了卡片外層的 `overflow-hidden`。
  - 將播放器容器 `CardContent` 的樣式設定為 `sticky top-0 z-30 bg-white/90 backdrop-blur-md border-y border-zinc-200/30`。
  - 在卡片底部 `CardFooter` 元件加上 `rounded-b-lg`，以維持圓角外觀。

#### 2. 頁尾版權聲明調整 (`app/layout.tsx`)
- **修復**: 移除了原有的 Hacker News 關聯聲明，將頁尾文字修改為：
  > 由 [david888.com](https://david888.com) 製作

#### 3. RSS 格式與描述長度優化 (`app/rss.xml/route.ts`)
- **解決 YouTube 描述過長警告**: RSS `description` 優化為 `[回連連結] + [極簡摘要]`，且當無極簡摘要時，只截取前 300 個字元作為預覽，防範 YouTube 5,000 字元長度限制警告。
- **Apple Podcasts 回連連結支援**: 在 RSS 產生的 `<description>` (純文字) 與 `<content:encoded>` (HTML) 最頂部，置頂顯示 `"詳細網頁版與參考連結：https://podcast.david888.com/post/YYYY-MM-DD"`。
- **精簡 HTML 內文**: `<content:encoded>` 改為極簡的 `[網頁回連] + [極簡摘要] + [相關連結列表]`，大幅縮減 Feed 體積並防止 YouTube 讀取過長 HTML 出錯。
- **代碼清理**: 移除了 `app/rss.xml/route.ts` 中不再使用的 `markdown-it` 套件引用。

---

## [2026-07-08] RSS CORS 與 Cloudflare 部署指令修正

### 摘要
本次修正兩個實際部署問題：
- `https://podcast.david888.com/rss.xml` 缺少 CORS headers，導致前端瀏覽器直接抓取 RSS 時容易被 CORS 擋住。
- Cloudflare Web 正式部署若使用 `pnpm deploy`，在 `pnpm@10` 下會被解讀成 workspace deploy 子命令，無法執行 `package.json` 中定義 of deploy script。

### 變更內容
#### 1. 為 `rss.xml` 補上 CORS headers
在 `app/rss.xml/route.ts` 補上 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods: GET, HEAD, OPTIONS`、`Access-Control-Allow-Headers: Content-Type, Accept`。同時新增 `OPTIONS` handler。
#### 2. 釐清正確 Web 部署指令
將部署指令修正為 `pnpm run deploy`，排除 `pnpm deploy` 的歧義。
#### 3. 修正文檔與腳本
同步修正 `README.md`、`deploy-to-cloudflare.sh`、`setup-env-vars.sh` 與 `docs/DOCS-INDEX.md` 中的部署說明。

---

## [2026-07-07] Agent Discovery / robots.txt / Markdown for Agents

### 摘要
為 `https://podcast.david888.com` 補齊 agent-facing discovery 能力，讓站點能更明確地向搜尋引擎、AI crawler、與自動化 agent 宣告可抓取範圍、API 發現入口、Agent Skills index，以及 Markdown 回應能力。本次也同步修正 lint 範圍。

### 變更內容
#### 1. 補上標準化 `robots.txt`
新增根路徑 `robots.txt`，支援 `GPTBot`、`OAI-SearchBot`、`Claude-Web`、`Google-Extended` 與 `*` 的抓取規則。
#### 2. 補上 AI content usage preferences
在 `robots.txt` 新增 `Content-Signal: ai-train=no, search=yes, ai-input=yes`。
#### 3. 首頁加上 `Link` response headers
回傳 `api-catalog`、`service-desc`、`service-doc` 與 `status` 關係。
#### 4. 發佈 API catalog
新增 `/.well-known/api-catalog`、`/openapi.json`、`/api/status` 與 `/docs/api`。
#### 5. 發佈 Agent Skills Discovery index
新增 `/.well-known/agent-skills/index.json` 與 `/.well-known/agent-skills/{slug}`。
#### 6. 支援 Markdown for Agents
首頁與文章頁已支援 `Accept: text/markdown`。
#### 7. lint scope 收斂
調整 ESLint ignore 規則，排除 `**/*.md` 與 `tests/**/*`。

---

## [2026-04-24] Bing 背景與 Bento 視覺優化

### 概述
本更新導入了動態 Bing 桌布背景功能，並運用 Bento 設計風格全面優化了前端介面視覺，提升了整體的沉浸感與現代感。

### 新增功能
#### 1. 動態 Bing 背景
- **呼吸動畫**：圖片載入後套用平滑淡入與 Ken Burns 效果縮放動畫。
- **隨機桌布**：載入時隨機從 GitHub 源抓取歷史桌布。
- **開關控制**：右上角新增切換按鈕，預設為開啟，支援 `localStorage` 偏好記憶。
#### 2. Bento 視覺風格優化
- **毛玻璃效果 (Glassmorphism)**：為文章卡片與 UI 組件加入 `backdrop-blur` 與半透明背景。
- **現代字體**：引入 `Inter` 字體，優化間距與標題層次感，卡片加入柔和邊框與陰影。

---

## [2026-04-14] TTS 引擎與 Workflow 穩定性修復

### 🎯 修復目標
為解決語音合成 (TTS) 引擎失效、環境變數配置錯誤、工作流程 (Workflow) 重複觸發，以及播客標題偶爾未經過 LLM 美化的問題。

### 📝 主要變更
#### 1. 標題美化與故障切換 (Fail-safe)
- **標題自動補位機制 (`workflow/index.ts`)**: 若偵測到標題缺失，會額外發起一個極輕量的 LLM 請求產出 SEO 驚悚標題。
- **Fallback 標式優化 (`lib/utils.ts`)**: 新增 `[備用標題]` 前綴。
#### 2. TTS 引擎修復與優化
- **Gemini TTS 模型代碼校正**: 修正模型代碼為 `gemini-2.5-flash-preview-tts`。
#### 3. Workflow 穩定性增強
- **防止重複觸發 Audio Workflow**: 新增 KV 狀態鎖定 (Dedup Lock)，防止 5 分鐘內重複觸發。
- **API 路由精確化**: 修正 `/workflow` 路由判斷。

---

## [2026-04-08] RSS 日期排序修正

### 摘要
修正 `https://podcast.david888.com/rss.xml` 在 Pocket Casts 等播客 App 中未依節目日期穩定排序的問題。

### 變更內容
#### 1. 導入穩定時間戳
在 `lib/utils.ts` 新增 `getArticleTimestamp()`，優先使用既有穩定時間戳，或回退到節目日期。
#### 2. RSS 改用穩定日期
RSS item `date` 與 `enclosure` 的 `?t=` 參數皆改用穩定時間，不再於每次 feed 重建時刷新。
#### 3. Workflow 寫入 `generatedAt`
在產生的腳本資料中寫入 `generatedAt: Date.now()`，保有固定生成時間。
#### 4. 收斂重複 mapping 邏輯
將文章頁與 RSS 的 `mapScriptToArticle()` 時間格式同步。
#### 5. 額外調整
在 `wrangler.jsonc` 補上 `account_id`，防止多帳號部署失敗。

---

## [2025-10-31] 新聞來源擴充實作

### 🎯 新增功能概覽
為 Hacker News 播客系統新增了三個新的新聞來源：
1. **GitHub Trending** - 熱門開源專案（使用 DeepWiki 增強內容）
2. **Product Hunt** - 新產品發布
3. **Dev.to** - 技術文章 Top 10

### 📝 主要變更
#### 1. 類型定義更新 (`types/story.d.ts`)
擴充了 `Story` 介面以支援多種來源（`source`、`sourceUrl`、`description` 等）。
#### 2. 爬蟲函數 (`workflow/utils.ts`)
新增 `getGitHubTrendingStories()`（轉換為 DeepWiki URL 並透過 Jina 爬取）、`getProductHuntStories()`（取前 5 產品）、`getDevToStories()`（取前 10 技術文章）與 `getAllStories()`（並行聚合所有來源）。
#### 3. 內容處理與提示詞更新
- `getHackerNewsStory()` 根據來源進行不同內容獲取。
- 更新 `summarizeStoryPrompt` AI 提示詞以處理多種來源類型。
#### 4. 工作流程整合
`workflow/index.ts` 從抓取單一 HN 改為執行 `getAllStories()` 聚合。
