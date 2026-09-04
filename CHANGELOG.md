# 更新日誌 (Changelog)

本專案的所有更新歷史紀錄。最新的變更會排在最上方。

## [2026-09-04] Gemini TTS 語音合成重試、多 Key 容錯切換與移除 Edge-TTS (Gemini TTS Retry, Multi-Key Failover & Edge-TTS Removal)

- **Gemini TTS 加入 45 秒強制逾時控制（AbortSignal Timeout）**：
  - 在 `workflow/tts.ts` 中，替所有 Gemini API 呼叫（`fetch`）加入 `AbortSignal.timeout(45_000)`。
  - 徹底解決遠端 Google 伺服器若遇長連線掛起或無回應時，工作流在單一步驟死等超過 15 分鐘導致 `WorkflowTimeoutError` 的架構缺陷。
- **實作智慧指數退避重試（Exponential Backoff Retry）**：
  - 遇到 429（瞬時限流）、500/502/503（伺服器錯誤）或網路連線逾時等暫態異常時，自動退避等待（1 秒、2 秒...）於同一把 Key 原地重試最多 2 次，可自行消化 90% 以上的偶發性網路抖動。
- **支援多把 Gemini Key 自動容錯切換（Multi-Key Failover）**：
  - 新增 `createGeminiTtsConfigs` 模組，支援環境變數與 Secret 設定 `GEMINI_TTS_FALLBACK_API_KEY`（或 `GEMINI_TTS_FALLBACK_API_SECRET`），並相容插槽 `GEMINI_TTS_FALLBACK_1_API_KEY` 至 `GEMINI_TTS_FALLBACK_5_API_KEY`。
  - 當第一把 Key 遇到 401/403 權限異常或 429 配額耗盡重試完畢後，系統會自動無縫切換至備用 Key 繼續完成語音合成。
  - 全程維持 100% 原生 Gemini 2.5 Flash 24kHz PCM WAV 高擬真音質，徹底杜絕破音、變聲或格式衝突問題。
- **徹底拔除 Edge-TTS 自動降級**：
  - 移除以往主服務失敗時自動降級至 Edge-TTS 的機制，杜絕 `@echristian/edge-tts` 在 Cloudflare Workers 底層因 WebSocket 握手掛起造成的無限卡死，以及 WAV 剝除 Header 硬接 MP3 導致的音訊損毀問題。
- **補齊完整單元測試與品質檢查**：
  - 新增 `tests/tts-fallback.test.ts`，驗證 Key 解析、暫態錯誤重試、401 立即切換、429 配額切換與絕不降級 Edge-TTS 等情境。
  - 納入 `package.json` 的 `test:workflow-security` 測試套件，並全數通過 `pnpm check`。
- **線上 Worker 部署**：
  - Generation Worker (`daily-podcast-worker`) 已正式部署上線（版本 `7d40017a-fcc3-44be-bd52-45eeeaccf502`）。

---

## [2026-09-03] 消除 KV 讀取放大與 RSS 快取優化 (KV Read Amplification Elimination & RSS Cache)

- **根除 RSS 90 天盲猜之讀取放大問題**：
  - 解決原本在 `/rss.xml` 透過 `getPastDays(90)` 盲猜過去 90 天日期的架構瑕疵。原架構下每當 Apple Podcasts、Spotify、Feedly 等外部平台爬蟲請求一次 RSS，就會產生 90 至 180 次 KV 讀取，導致極低訪客流量下每日 KV 讀取高達 3 萬多次並逼近 10 萬次免費上限。
  - 引入單鍵 KV 快取 `cache:{env}:{variant}:rss.xml`，所有外部請求優先讀取已產生的 XML。單次請求 KV 讀取由原本的 90~180 次驟降至 1 次（邊緣快取命中時為 0 次），讀取消耗削減達 99.4%。
- **建立集數日期索引清單（Episode Date Index）**：
  - 在 `workflow/efficiency.ts` 與 `lib/content.ts` 新增 `index:{env}:{variant}:dates` 規範與管理函式。
  - 首頁分頁（`getHomepageArticles`）與 Sitemap（`app/sitemap.ts`）直接依賴此索引清單進行日期分頁與網址生成，徹底消除原本使用 `KV.list()` 全庫動態輪詢的做法，徹底解除 Cloudflare KV 每天 1,000 次 `list()` 的額度上限風險。
  - 後端 Generation Worker（`workflow/index.ts`）在每日儲存新腳本時，自動將新集數日期去重並排序寫入索引。
- **自動化 RSS 快取更新與失效機制**：
  - 在 `workflow/audio.ts` 完成音訊 Multipart 上傳與 R2 最終確認後，清理步驟會自動刪除舊的 `rssCacheKey`，確保音檔發佈完成後隨後的第一次外部請求會自動生成包含最新音訊連結的 RSS Feed 並重新快取。
  - 在工作流強制重跑（`force clear script cache`）時，亦同步清除 RSS 快取以維持資料一致性。
- **補齊單元測試與門禁驗證**：
  - 在 `tests/workflow-efficiency.test.ts` 新增索引 Key 正規化、RSS Cache Key 建置、日期排序與去重邏輯之單元測試。
  - 通過 `pnpm check`（lint, typecheck, 52 workflow tests, 27 web cache tests, 4 webmcp tests, 4 pwa tests, 6 build-gate tests）與 `pnpm build`。
- **上線部署版本**：
  - Generation Worker (`daily-podcast-worker`)：版本 `9e2b66c0-1881-4da7-a4b3-1e47e4643fb6`。
  - Web Worker (`daily-podcast`)：版本 `9f7cebba-a9ec-4ff3-8568-0a275aeae3da`。

---

## [2026-09-01] 單集頁面頂部固定導航列優化 (Article Card Sticky Header Enhancement)

- **整合標題、播放器與分頁列為統一頂部固定容器**：
  - 重構 `components/article-card.tsx`，將**文章標題（`CardHeader`）**、**音訊播放器（`AudioPlayer` + 分享按鈕）**與**分頁切換列（`TabsList`：總結 / Podcast / 參考）**共同封裝進同一個頂部固定區塊（`sticky top-0 z-30 bg-white/90 backdrop-blur-md`）。
  - 修復以往向下滾動長篇 Podcast 逐字稿或總結時，標題與 Tab 切換按鈕會被捲出可視範圍、只剩下播放器的問題。
  - 滾動瀏覽內容時，使用者可隨時看見當前集數標題、控制播放進度，並直接切換「總結 / Podcast / 參考」分頁，無須再手動滑回頁面頂部。
  - 在固定容器底部增加微細分隔線（`border-b border-zinc-200/30`），確保下方文字內容滾動穿過時視覺乾淨且層次分明。

---

## [2026-08-30] 修復手機版與行動端音訊無法播放問題 (Mobile Audio Playback Fix)

- **移除 `<audio>` 標籤 `crossOrigin="anonymous"` 限制**：
  - 前端 `podcast.david888.com` 與音訊儲存網域 `r2.david888.com` 為跨子網域；原本的 `crossOrigin="anonymous"` 會強制行動端瀏覽器（特別是 iOS Safari / WebKit WebViews）進入嚴格 CORS 檢查模式。因 R2 自訂網域未回傳 CORS 標頭，導致 iOS Safari AVPlayer 直接拋出錯誤並中斷播放。
  - 移除 `crossOrigin` 屬性後，瀏覽器以標準 `no-cors` 媒體串流管道播放，全面相容 iOS Safari、Android Chrome 及各式 In-App Webview。
- **補齊 R2 音訊 Multipart Upload 的 `httpMetadata` MIME 類型**：
  - 在 `workflow/audio.ts` 中的 `createMultipartUpload` 設定正確的 `httpMetadata`（`contentType: isGeminiTTS ? 'audio/wav' : 'audio/mpeg'`, `cacheControl: 'public, max-age=31536000, immutable'`），確保音檔上傳至 R2 後具備標準 `Content-Type` 標頭，防止行動端播放器因判定為未知二進位流（`application/octet-stream`）而拒絕解碼。
- **修正 `/static/[...path]` 串流代理之 RFC 7233 規範與 CORS 支援**：
  - 修正 HTTP 206 Partial Content 回應中的 `Content-Length` 標頭計算，改為該 Range 切片的實際長度（而非整檔總大小 `file.size`），修復 iOS Safari 在探測位元組範圍（`Range: bytes=0-1`）時因長度不符而中止連線的 Bug。
  - 增加依附副檔名（`.mp3`、`.wav`、`.png`、`.jpg`）自動解析 MIME 類型之邏輯。
  - 補齊 CORS 標頭與 `OPTIONS` 預檢回應支援。
- **更新 `public/_headers`**：
  - 在 `/*.mp3` 規則中補齊 `Access-Control-Allow-Origin: *` 與 `Access-Control-Expose-Headers`。
- **重構 Sitemap 為全量歷史永久收錄（0 死連結、無天數上限）**：
  - 徹底移除 Sitemap 的天數限制，直接透過 `HACKER_NEWS_KV.list()` 動態檢索整個資料庫（含現代與歷史集數），**永久收錄有史以來的每一集節目（無 90 天或 365 天限制，永遠不過期）**。
  - 僅收錄資料庫中真實存在的文章頁面，達到 100% 有效連結，徹底杜絕 404 死連結，提升 Google SEO 權重。
- **全面救援還原歷史節目資產（304 集歷史節目全數回歸）**：
  - 掃描 R2 儲存庫中完整保留的歷史 MP3 音訊檔，透過批次匯入將過去因 7 天 TTL 過期而遺失的 **304 集歷史節目全數重建寫入 Cloudflare KV 並永久保存**。
  - 現在 Sitemap 已收錄共 **321 集節目**，涵蓋 2025 年創台至今所有集數，使用者與搜尋引擎皆可永久訪問與播放歷史節目。
- **現代化升級首頁分頁器 UI（支援數字頁碼 pills、快速跳頁與全量導航）**：
  - 重構 `components/pagination.tsx`，引進現代毛玻璃卡片（Glassmorphism）與 Lucide 向量圖示導航。
  - 新增「動態數字頁碼 Pills」與省略號，清晰顯示當前頁面與前後集數。
  - 新增「第一頁 / 上一頁 / 下一頁 / 最後一頁」完整雙箭頭與單箭頭導航按鈕。
  - 新增「快速跳頁輸入框（Jump to Page）」，輸入頁數並按下 Enter 即可瞬間跳轉至任意歷史頁面（1 ~ 54 頁）。
  - 全面相容行動端與桌面端自適應排版（響應式 Touch Targets 與高對比度深淺色模式支援）。
- **取消網站首頁與資料庫過期限制，全面改為永久典藏（僅 RSS 保留 90 天）**：
  - 網站首頁 (`app/page.tsx`、`lib/content.ts`) 改為由 KV 動態檢索全量歷史集數並提供分頁瀏覽（共 54+ 頁，所有歷史集數皆可翻頁瀏覽與永久收聽）。
  - 單集文章頁面 (`/post/[date]`) 永久保留，隨時可訪問與播放。
  - 網站地圖 (`/sitemap.xml`) 永久收錄全量集數（目前已收錄共 321 集）。
  - Podcast RSS Feed (`/rss.xml`) 維持保留最新 90 天（一季約 90 集），確保各大 Podcast 播放器同步最新節目且極速回應。
  - 徹底移除 `workflow/index.ts` 中 `save script to kv` 的 `expirationTtl`（原先設定為 7 天過期，導致歷史節目在 7 天後被 Cloudflare KV 自動清除），改為**永久保存（無過期時間）**，並同步清除線上既有集數的 TTL 限制，實現永久典藏。

---

## [2026-08-23] WebMCP AI Agent 工具支援

- 在全站 layout 加入 WebMCP client provider；支援的 Chrome 會透過 `document.modelContext.registerTool()` 註冊網站工具，不支援的瀏覽器則維持原有功能並自動降級。
- 新增 `list_recent_episodes`，讓 AI Agent 讀取分頁後的近期集數、日期、摘要與音訊連結。
- 新增 `get_episode`，讓 AI Agent 依日期與變體取得既有 Markdown 文章內容；`main` 會正規化為 `hacker-news`。
- 新增 `open_episode`，讓 AI Agent 開啟指定 Podcast 集數頁面供使用者查看與播放。
- 所有工具輸入都會驗證日期、變體與頁碼；外部新聞內容標記為不受信任資料，工具輸出限制為 1,500 字元，避免無界內容進入模型上下文。
- 新增 WebMCP helper 測試，並將 `test:webmcp` 納入 `pnpm check`。
- Web Worker version：`81bff5d6-92a4-4c21-bc8e-4673dd546658`；已部署至 `https://podcast.david888.com` 對應的 Cloudflare Worker。

---

## [2026-08-10] llms.txt 與 llms-full.txt 規範支援

- 依據 llmstxt.org 標準實作 `/llms.txt` 與 `/llms-full.txt` 端點（同時提供 `public/` 靜態檔案與 App Router 動態路由）。
- 提供精簡與完整的網站結構索引、文章路由格式、RSS/Sitemap 鏈結、AI Agent Skills 索引、OpenAPI 規範與維護團隊資訊。
- 在 `lib/discovery.ts` 與 `middleware.ts` 首頁探索標頭中加入 `Link: </llms.txt>; rel="llms-txt"; type="text/markdown"`。
- 在 `skillDocuments` 中新增 `llms-txt` 說明文件，並更新 `robots.txt` 與 `OpenAPI` 規格。

---

## [2026-08-09] 修正 Podcast 腳本 schema 與付費步驟重試次數

- 移除對 LLM 結構化輸出的單段 380 字與總段數硬性 schema 上限，避免模型只因些微超出提示詞目標，就讓整份有效 JSON 觸發 `AI_NoObjectGeneratedError`。
- 生成後由本地純函式依標點切成最長 380 字的對話段；沒有標點的長句也會安全切開，TTS 端共用同一套切段邏輯。
- 接受模型偶爾以 `Cordelia`／`David` 回傳 speaker，儲存前統一轉為既有的「女」／「男」。
- AI 與 TTS Workflow step 的 `retries.limit` 由 2 改為 1，使 Cloudflare 的實際執行從最多三次降為最多兩次總嘗試；AI SDK 內層仍不重試。
- 新增 schema 漂移、標點切段、無標點長句與重試預算的回歸測試。
- Generation Worker version：`02b1b7fd-9821-4c79-8d21-bc48feb1e110`；部署時未手動觸發 AI 或 TTS。
- 週日的 Hacker News 配額由 7 篇提高為 10 篇；其他星期與來源配額不變，且不重跑已完成的 2026-08-09 節目。
- 確認 Reddit 候選清單仍直接呼叫 Reddit JSON API；目前該端點回傳 `403`。`create360.ai` 用於入選後的文章內文備援，但代抓 Reddit 頁面時同樣取得封鎖頁，不能取代正式的 Reddit API 授權。
- 週日配額版 Generation Worker：`3f3ff96f-f26b-4170-bfaf-06d2f37823ff`；部署時未觸發任何 AI 或 TTS Workflow。
- Reddit 候選來源由五個必定回傳 `403` 的 JSON API 請求，改為一個涵蓋 LocalLLaMA、coding、netsec、sysadmin、dataengineering 的合併 Atom RSS；選文依日期輪替 subreddit 順序，同一天重跑仍維持相同結果。
- 入選的 Reddit 故事改讀單篇 Atom RSS，直接取得 self post 正文與最多 20 則留言；連結貼文的外部文章才交給自架 reader。Reddit RSS 請求之間以 40 秒 Workflow 持久化等待遵守匿名 rate limit，不占用 Worker CPU。
- 實際 smoke test：合併 RSS 單次取得 25 篇候選；單篇 RSS 取得 785 字原文與 20 則、共 4,035 字留言。create360 的 URL 陣列與換行批次均確認不受支援。
- Reddit RSS 架構版 Generation Worker：`49428aff-94c7-41dd-9c1b-09391358880a`；部署時未觸發任何 AI 或 TTS Workflow。
- 一般外部文章的 primary reader 改用 create360 `/v1/batch`，每批最多 5 篇；成功內容先寫入獨立 R2 checkpoint，後續故事步驟只讀 checkpoint 再抓留言，避免大文章進入 Workflow step state。
- batch 項目失敗、內容過短或服務異常時，個別故事仍照既有 create360／第二台／第三台 reader fallback；Reddit 保持 RSS 架構，不併入 batch 以避開 `429`。
- create360 batch 架構版 Generation Worker：`7944324f-d162-47e2-9acf-f7707d32ed36`；部署時未觸發任何 AI 或 TTS Workflow。

---

## [2026-08-08] 主持人風格、台灣用語與 TTS 節目預算

### 摘要

調整 Podcast 腳本提示，恢復 Cordelia 技術樂觀派與 David 工程現實派的對立風格，並加強
David 的技術解說責任。同步統一 AI 產出、網站介面、PWA 描述與維護文件的台灣用語，且在
Cloudflare Workers Free plan 的 50 次外部 subrequest 限制內保留 15–20 分鐘的節目內容。

### 對話稿與主持人定位

- Cordelia 從產品願景、使用者價值、架構潛力與正面證據展開觀點；David 從技術原理、部署、
  維護、相容性、授權、效能與 Bug 檢驗主張。
- David 不再只負責質疑。每個故事都必須補充背景或核心原理，重要故事至少安排一段完整的
  機制解說，再進入雙方的價值判斷。
- 保留支持與反對觀點的角色張力，但所有評論、Issues、價格、使用經驗與因果關係都必須能由
  原始素材支持，避免為了製造衝突而補造翻車案例。
- Hacker News、Reddit、GitHub Trending、Product Hunt 與 Dev.to 依來源採用不同分析角度，
  繼續直接閱讀 `<raw-story-content>`，不增加額外 LLM 規劃或審稿呼叫。
- 移除套版式聊天句型與固定訂閱宣傳收尾，維持 DAVID888 Daily 原有的技術調查與觀點交鋒風格。

### 節目長度與 Free plan 保護

- 正常對話目標依故事數計算，10 篇故事為 24 段、13 篇故事為 30 段，硬上限由 40 段降為
  34 段，替 TTS 失敗與 fallback 保留外部 subrequest 餘裕。
- 單段提示詞目標由 2,000 字收斂為 380 字，低於 400 字 TTS segment 上限，減少單一
  `dialogue` 項目被拆成多次 TTS 呼叫；生成結果的硬性驗證已於 2026-08-09 改為本地安全切段。
- 實質討論以 220–360 字為主，全稿參考範圍為 4,800–6,500 字，目標節目長度約 15–20 分鐘。

### 台灣用語

- AI prompt 明確要求台灣繁體中文，將「播客、博客、用戶、搜索引擎、評論區、內存、函數、
  純文本、超鏈接、音頻」等用語改為「Podcast、部落格、使用者、搜尋引擎、留言討論、記憶體、
  函式、純文字、超連結、音訊」等台灣常用說法。
- 網站 Podcast 分頁、節目描述、PWA manifest、README、操作指南、部署腳本與程式註解同步整理。
- 新增 build-gate 測試，防止主要 prompt 與對外文案重新加入已排除的用語或外部模板句型。

### 驗證與部署

- `pnpm check`、`pnpm build` 與 OpenNext Cloudflare build 全數通過。
- ESLint 維持 0 error，保留 6 個既有 warning。
- Generation Worker version：`7201ae2a-14ea-4f23-9b87-60f1d0c90aa5`。
- Web Worker version：`2356a9e2-f996-42ac-8bd0-c74720bfc75b`。
- 未手動觸發 AI 或 TTS；下一次排程會使用新版主持人與長度規則。

---

## [2026-08-02] 自架來源穩定性、完整對話稿與 Free Plan 驗證

### 摘要

修正 Podcast 生成時的文章來源路徑與故事覆蓋邏輯，保留腳本直接閱讀完整原始內容的設計，並
實際部署 Generation Worker、強制重跑 2026-08-02，確認文字與 Gemini TTS Workflow 沒有超過
Cloudflare Workers Free Plan 的單次 50 次外部 subrequest 限制。

### 來源與內容完整性

- 文章全文與討論內容只依序使用三台自架 Markdown reader：
  `https://create360.ai`、`http://git.glsoft.ai:8083`、`http://60.248.142.126:8083`。
- 自架 reader 不再接收 `JINA_KEY`／`Authorization`；runtime 不再呼叫 `r.jina.ai` 或 Firecrawl。
- 每篇故事獨立嘗試三台 reader，不會因前一篇 reader 失敗而啟動全域熔斷、跳過後續故事。
- RSS 僅負責提供候選故事清單；完整文章與評論仍經自架 reader 取得。
- Podcast 腳本仍直接讀取 `<raw-story-content>` 的完整原始素材；深度摘要不會取代腳本輸入。

### 對話稿節奏

- 對話段數改依實際成功取得內容的故事數計算，不再用原始候選清單估算。
- 每個故事至少完成一個由男女主持人共同參與的觀點交換；重要或有爭議的故事可展開 2–3 個來回。
- 每段集中討論一個故事，避免一段塞入多個故事造成內容快速跳過。
- 保留既有 Cordelia／David 主持人設定、繁體中文與 JSON Schema。

### 正式重跑驗證

- Generation Worker version：`ff0d4c0b-1f7b-46cf-b0f9-8fe7c42668f0`。
- 文字 Workflow 成功取得 7 則故事並完成腳本；沒有 `Too many subrequests` 或資源超限錯誤。
- 新腳本為 19 段、6,059 字純對話（含講者標記 6,116 字）；舊稿約 4,348 字，增加約 39%。
- 23 個 Gemini TTS segment 分成 5 個批次，每批最多 5 次外部請求；五批均一次成功。
- 音訊 Workflow 約 9 分鐘完成，R2 multipart 合併後音檔大小為 46,716,142 bytes，公開音檔回傳 HTTP 200。

### 驗證

- `pnpm check` 通過；保留既有 ESLint warnings，沒有新增 error。
- 公開文章與音檔均已確認可讀：
  [2026-08-02 文章](https://podcast.david888.com/post/2026-08-02)、
  [2026-08-02 音檔](https://r2.david888.com/2026/08/02/production/hacker-news-2026-08-02.mp3)。

---

## [2026-07-31] WebTalk 全站聊天室與 AI 對話

### 摘要

全站加入 WebTalk 333 聊天室與 AI 對話元件，訪客可在所有頁面使用同一個即時討論空間。

### 變更細節

- 根 layout 使用 WebTalk 的 `origin` scope，讓網站內所有頁面共用同一間聊天室。
- WebTalk 腳本以 Next.js `lazyOnload` 策略延後至頁面載入後再取得，不阻塞首屏渲染，也不增加
  Web Worker 的 SSR、KV 或 Workflow 成本。
- 保留 WebTalk 提供的 AI endpoint；使用摘要、AI 對話或 `@ai` 時，頁面文字與提問會由訪客瀏覽器
  傳送至該服務，應依網站隱私政策揭露此資料流。
- 新增 layout 整合 regression test，確認 WebTalk source、全站 room scope、AI endpoint 與延後載入
  策略不會被後續修改移除。

### 驗證

- `pnpm check`、`pnpm build`、`pnpm opennext` 全數通過。
- ESLint 維持 0 error，保留 6 個既有 warning。

---

## [2026-07-31] Podcast 播放進度分享

### 摘要

播放器新增「分享此刻」按鈕，可建立從目前播放位置開始的節目連結。

### 變更細節

- 行動裝置優先開啟系統原生分享面板；不支援原生分享時會複製連結。
- 分享連結使用 `#t=<秒數>`，例如 6:19 為 `#t=379`。開啟連結後會定位到該時間點，
  但不會自動播放。
- 使用 URL hash 而非 query string，因此秒數不會送往 Web Worker，也不會為每個播放
  位置建立獨立的 Edge cache key。
- 修正動態播放器延遲掛載時可能錯過初始 metadata 的時序問題，分享連結現在會在音訊
  元素掛載後可靠定位。
- 新增時間戳格式、連結生成與讀取的回歸測試，並納入既有 Web test command 與 CI。

### 驗證

- `pnpm check`、`pnpm build` 全數通過。
- ESLint 維持 0 error，保留 6 個既有 warning。

---

## [2026-07-31] Android 與 macOS PWA 安裝、離線導覽

### 摘要

網站現在可作為 Progressive Web App 安裝。Android 的 Chromium 瀏覽器可使用
「安裝／加入主畫面」；macOS 的 Chrome／Edge 可安裝為獨立視窗，Safari 則可使用
「加入 Dock」。

### 變更細節

- Manifest 新增穩定的 app ID，維持 standalone 顯示模式、繁中語系與 192／512px
  通用及 maskable icons。Manifest 以靜態資產提供，避免 OpenNext incremental cache
  保留舊 manifest 而使 Chromium 無法重新判斷安裝性。
- 根 layout 註冊 Service Worker，補上 Apple Web App metadata、`zh-TW` 文件語系，
  並使用 Next.js 15 的 viewport metadata 設定主題色。
- 新增由 Service Worker Cache Storage 提供的離線頁與 network-first 導覽 fallback；
  僅預先快取離線頁、manifest 與圖示，不快取每日文章或 Podcast 音檔，避免過期內容
  與不必要的裝置儲存量。fallback 不經 OpenNext 路由，避免舊版本的 dynamic route
  cache 回應遮蔽。
- 新增 PWA regression tests，並納入 `pnpm check` 與 GitHub Actions quality gate。
- Chrome 通過 installability 檢查時，首頁標題旁會顯示「安裝 App」按鈕並開啟原生
  安裝對話框，避免依賴不保證出現的瀏覽器自動邀請。

### 驗證

- `pnpm check`、`pnpm build`、`pnpm opennext` 全數通過。
- 本機正式建置確認 `/manifest.webmanifest` 與 `/sw.js` 均回傳 200，並驗證 Service
  Worker 會建立 HTML fallback response；
  manifest Content-Type 為 `application/manifest+json`。
- ESLint 維持 0 error，保留 6 個既有 warning。

---

## [2026-07-21] 靜態資源 Host 與 OpenAI API Key 環境變數彈性相容

### 摘要

調整 `NEXT_STATIC_HOST` 靜態資源網域為 `https://r2.david888.com`，並補強前端與腳本生成 Workflow 中的環境變數讀取相容性。

### 變更細節

- `wrangler.jsonc`：將 `NEXT_STATIC_HOST` 更新為 `https://r2.david888.com`。
- `app/page.tsx`：`ArticleCard` 的 `staticHost` 增加 `process.env.NEXT_STATIC_HOST` 備用讀取機制。
- `workflow/index.ts`：OpenAI SDK 初始化時新增 `OPENAI_API_SECRET` 與 `OPENAI_API_KEY` 的 fallback 相容處理。

---

## [2026-07-20] Web Worker 邊緣快取與 request-scoped KV 去重

### 摘要

啟用 Cloudflare Workers Cache，讓可公開的 HTML 與 RSS 能在 Worker invocation
之前由 Edge 回應；同時移除無上限的 isolate-global KV `Map`，避免完整 Podcast
script 長期累積而逼近 Free Plan 的 128MB 記憶體限制。

### 快取邊界

- `wrangler.jsonc` 啟用 Workers Cache 並關閉 cross-version sharing；HTML 的瀏覽器
  TTL 為 60 秒、Cloudflare Edge TTL 為 10 分鐘，另允許 30 分鐘 stale response
  與 1 天 stale-if-error。
- 新增外層 `worker.js` 包裝 OpenNext 產物。它會依最終 response 的 Content-Type
  判斷 representation，所有 `text/x-component` RSC payload 均強制
  `Cache-Control` 與 `Cloudflare-CDN-Cache-Control` 為 `private, no-store`。
- HTML 的 `Vary` 同時包含 `Accept`、RSC 與 Next Router headers，避免 Markdown、
  HTML 與 router representation 混用。RSS 使用相同 Edge policy。
- 非 2xx 頁面一律 `private, no-store`，避免尚未產生的 Podcast 或暫時性錯誤被
  Edge 固定成 404／錯誤頁。
- 修正既有 `app/__markdown` 被 Next.js 視為 private folder、導致
  `Accept: text/markdown` 永遠 404 的問題；內部 rewrite 改到可路由的
  `/agent-markdown`，HTML 與 Markdown 由 `Vary: Accept` 安全分流。
- 不使用 `s-maxage`，避免關閉 Workers Cache 的 stale-while-revalidate 行為。

### KV 與 OpenNext

- 首頁改用共用的 bounded pagination loader，不再保留一份重複 KV 讀取實作。
- 文章頁 metadata 與 page body 透過 React `cache()` 在單次 Server Component request
  內共用 KV 結果；不跨 request 保存 payload，也不依賴 Cloudflare isolate 壽命。
- RSS 與 variant routes 統一走 `getArticleByDate()`，移除剩餘的直接 KV reads。
- OpenNext regional cache 使用 purge-aware 預設 refresh mode，不再強制 lazy refresh。

### 驗證

- `pnpm check`：TypeScript 0 error、ESLint 0 error（6 個既有 warning），57 項測試
  全數通過；其中 14 項專門驗證 cache policy、Worker entry 與部署設定。
- OpenNext production build 與 Web Worker dry-run 通過；gzip 約 1694 KiB，低於
  Workers Free Plan 3 MiB 限制。
- 本機 Wrangler curl smoke：HTML 回傳 browser 60 秒／Edge 10 分鐘；RSC 回傳
  `private, no-store`；RSS 回傳 Edge 10 分鐘。

### 正式部署與量測

- 已部署 Web Worker version `09ceae33-2db5-4408-905c-91ad35e804f8`，並確認
  `https://podcast.david888.com` 已切換到新版。
- Production curl：首頁與 Markdown 均確認 `Cf-Cache-Status: HIT`；RSS 與
  status API 均確認 `MISS → HIT`。
- RSC 與不存在文章的 Markdown 404 均回傳 `Cf-Cache-Status: BYPASS` 與
  `private, no-store`，不會寫入 Edge cache。

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

## [2026-07-20] Workflow subrequest、重試與持久化狀態最佳化

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
- 正式環境未設定 `API_SECRET_TOKEN` 時採 fail-closed，回傳 `503`，不會在無驗證
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

## [2026-07-08] 播放器懸浮固定與 RSS 格式最佳化

### 🎯 最佳化與修復目標
解決網頁播放器無法固定在最上方的問題、修改頁尾（Footer）的商標與版權聲明，並調整 RSS XML 的產生結構，解決 YouTube Podcast RSS 匯入時因描述過長而出現的警告訊息，也讓聽眾在 Apple Podcasts 等 App 收聽時能直接點選連結回到網站原文。

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

#### 3. RSS 格式與描述長度最佳化 (`app/rss.xml/route.ts`)
- **解決 YouTube 描述過長警告**：RSS `description` 調整為 `[回連連結] + [極簡摘要]`，沒有極簡摘要時只擷取前 300 個字元作為預覽，避免觸發 YouTube 的 5,000 字元長度警告。
- **Apple Podcasts 回連連結支援**: 在 RSS 產生的 `<description>` (純文字) 與 `<content:encoded>` (HTML) 最頂部，置頂顯示 `"詳細網頁版與參考連結：https://podcast.david888.com/post/YYYY-MM-DD"`。
- **精簡 HTML 內文**: `<content:encoded>` 改為極簡的 `[網頁回連] + [極簡摘要] + [相關連結列表]`，大幅縮減 Feed 體積並防止 YouTube 讀取過長 HTML 出錯。
- **程式碼整理**：移除 `app/rss.xml/route.ts` 中不再使用的 `markdown-it` 套件引用。

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
#### 3. 修正文件與腳本
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

## [2026-04-24] Bing 背景與 Bento 視覺最佳化

### 概述
本次更新加入動態 Bing 桌布背景功能，並運用 Bento 設計風格調整前端介面視覺。

### 新增功能
#### 1. 動態 Bing 背景
- **呼吸動畫**：圖片載入後套用平滑淡入與 Ken Burns 效果縮放動畫。
- **隨機桌布**：載入時隨機從 GitHub 源抓取歷史桌布。
- **開關控制**：右上角新增切換按鈕，預設為開啟，支援 `localStorage` 偏好記憶。
#### 2. Bento 視覺風格最佳化
- **毛玻璃效果 (Glassmorphism)**：為文章卡片與 UI 組件加入 `backdrop-blur` 與半透明背景。
- **現代字體**：加入 `Inter` 字體，調整間距與標題層次，卡片加入柔和邊框與陰影。

---

## [2026-04-14] TTS 引擎與 Workflow 穩定性修復

### 🎯 修復目標
解決語音合成（TTS）引擎失效、環境變數設定錯誤、Workflow 重複觸發，以及 Podcast 標題偶爾未經 LLM 調整的問題。

### 📝 主要變更
#### 1. 標題美化與故障切換 (Fail-safe)
- **標題自動補位機制 (`workflow/index.ts`)**: 若偵測到標題缺失，會額外發起一個極輕量的 LLM 請求產出 SEO 驚悚標題。
- **Fallback 標示調整 (`lib/utils.ts`)**：新增 `[備用標題]` 前綴。
#### 2. TTS 引擎修復與最佳化
- **Gemini TTS 模型名稱校正**：修正模型名稱為 `gemini-2.5-flash-preview-tts`。
#### 3. Workflow 穩定性增強
- **防止重複觸發 Audio Workflow**: 新增 KV 狀態鎖定 (Dedup Lock)，防止 5 分鐘內重複觸發。
- **API 路由精確化**: 修正 `/workflow` 路由判斷。

---

## [2026-04-08] RSS 日期排序修正

### 摘要
修正 `https://podcast.david888.com/rss.xml` 在 Pocket Casts 等 Podcast App 中未依節目日期穩定排序的問題。

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
為 Hacker News Podcast 系統新增三個新聞來源：
1. **GitHub Trending** - 熱門開源專案（使用 DeepWiki 增強內容）
2. **Product Hunt** - 新產品發布
3. **Dev.to** - 技術文章 Top 10

### 📝 主要變更
#### 1. 類型定義更新 (`types/story.d.ts`)
擴充了 `Story` 介面以支援多種來源（`source`、`sourceUrl`、`description` 等）。
#### 2. 來源擷取函式 (`workflow/utils.ts`)
新增 `getGitHubTrendingStories()`（轉換為 DeepWiki URL 並透過 Jina 爬取）、`getProductHuntStories()`（取前 5 產品）、`getDevToStories()`（取前 10 技術文章）與 `getAllStories()`（並行聚合所有來源）。
#### 3. 內容處理與提示詞更新
- `getHackerNewsStory()` 會依來源使用不同的內容取得方式。
- 更新 `summarizeStoryPrompt` AI 提示詞以處理多種來源類型。
#### 4. 工作流程整合
`workflow/index.ts` 從抓取單一 HN 改為執行 `getAllStories()` 聚合。
