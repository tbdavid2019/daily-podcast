# DAVID888 Daily 每日放送

以原始專案 [Hacker News 每日播報](https://github.com/ccbikai/hacker-news) 為基礎擴充的 AI 科技 Podcast 系統。

**專案倉庫**: https://github.com/tbdavid2019/daily-podcast

**預覽地址**: https://podcast.david888.com

**RSS 訂閱**: https://podcast.david888.com/rss.xml

---

## 🆕 最近更新

- **🧪 自架來源、完整 Podcast 對話與 Free Plan 驗證 (2026-08-02)**：文章全文與討論內容依序由三台自架 Markdown reader 取得：`https://create360.ai`、`http://git.glsoft.ai:8083`、`http://60.248.142.126:8083`。Podcast 腳本維持直接閱讀完整原始內容，不改成只吃摘要；每個成功取得的故事都必須有男女主持人的完整觀點交換，重要故事再展開 2–3 個來回。正式重跑結果為 7 則故事、19 段對話、6,059 字純對話；23 個 Gemini TTS segment 分成 5 批，每批最多 5 次外部請求，未超過 Cloudflare Workers Free Plan 的 50 次限制。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **⚡ Web Worker 邊緣快取與 KV 去重 (2026-07-20)**：啟用 Cloudflare Workers Cache，在 Worker invocation 前快取 HTML 與 RSS；HTML 的 Edge TTL 為 10 分鐘、瀏覽器為 60 秒，RSC／router payload 則在外層 Worker 強制 `private, no-store`。移除會累積完整 Podcast script 的全域 `Map`，改用 React request-scoped cache 去除同一 SSR 的重複 KV reads，並新增實際 header 與 build gate 回歸測試。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🛡️ Next.js 與 production dependencies 安全更新 (2026-07-20)**：Next.js 由 15.4.6 升至 15.5.20，React 升至 19.2.7、OpenNext Cloudflare adapter 升至 1.20.1，並同步更新 Puppeteer、Cheerio、Radix 與 build tooling。Production audit 已由 60 項降至 4 項，Critical／High 均為 0；AI SDK 保持既有 `ai` 4.x／`@ai-sdk/openai` 1.x major。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🎧 音訊合併改為 bounded-memory R2 Multipart (2026-07-20)**：最終 Podcast 不再一次下載所有 batch 或建立整集 combined buffer；現在以 5 MiB 固定 Part、R2 range stream 與 `FixedLengthStream` 直接上傳，WAV 只保留一個正確總檔 header。每個 Part 可獨立重試，失敗會 abort，解決 128MB 峰值記憶體風險。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **⚙️ Workflow Free Plan 成本與恢復性最佳化 (2026-07-20)**：將文章內容改為單篇 durable step，原文以 4 天 R2 checkpoint 保存、step state 只保留短 key；AI 最壞嘗試由 20 次降為 2 次，TTS 以 deterministic segment/batch checkpoint 避免成功片段被重做，Reddit 去重的日常 KV 讀取由 7 次降為 1 次。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **✅ TypeScript 與前後端 Build Gate (2026-07-20)**：修復 10 個既有 TypeScript 錯誤，Next build 不再跳過 lint／型別 failure；新增 `pnpm check` 與 GitHub Actions，在 push／PR 自動驗證 OpenNext 前端及 Generation Worker bundle。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🔐 Workflow 認證、冪等與安全重跑 (2026-07-20)**：`POST /workflow` 已加入 Bearer Token 認證與 fail-closed 保護；一般執行採固定 instance ID，強制重跑使用 `Idempotency-Key`，避免網路重試或並行請求重複消耗 AI/TTS 額度。另新增 Token 首次設定、輪換、文稿重產與聲音重產指令，並將 AI/TTS 金鑰遷移至 Cloudflare Secrets。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **📌 播放器懸浮固定與 RSS 格式最佳化 (2026-07-08)**：修復了網頁端播放器在滾動時無法固定在頂部的問題；頁尾版權聲明更改為「由 david888.com 製作」；調整 RSS feed，將回連網址置頂，並限制內文大小，解決 YouTube Podcast 匯入時描述過長的警告。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🌐 RSS CORS 與 Cloudflare 部署指令修正 (2026-07-08)**：`/rss.xml` 現在會回傳 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods` 與 `Access-Control-Allow-Headers`，可供前端瀏覽器直接跨站抓取 RSS。另已釐清 Cloudflare 正確部署指令必須使用 `pnpm run deploy`，不能使用 `pnpm deploy`，並同步修正文件與腳本。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🤖 Agent Discovery / robots.txt / Markdown for Agents (2026-07-07)**：新增正式 `robots.txt`（含 `GPTBot`、`OAI-SearchBot`、`Claude-Web`、`Google-Extended` 與 wildcard 規則）、`Content-Signal`、首頁 `Link` discovery headers、`/.well-known/api-catalog`、`/.well-known/agent-skills/index.json`、`/openapi.json`、`/api/status` 與 `/docs/api`。同時支援首頁與文章頁在 `Accept: text/markdown` 時回傳 Markdown，並已部署至 `https://podcast.david888.com`。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🖼️ Bing 背景與 Bento 視覺最佳化 (2026-04-24)**：加入動態 Bing 桌布背景功能，支援從 GitHub 來源隨機抓取歷史桌布，並套用平滑的呼吸動畫。同時全面套用 **Bento 設計風格**，加入毛玻璃質感 (`backdrop-blur`)、現代 `Inter` 字體與精緻的間距系統。背景開關預設調整為 **開啟 (ON)**，使用者仍可於右上角手動切換。
- **🗣️ Edge TTS 台灣用語調整 (2026-02-05)**：預設 Edge TTS 聲線已從中國普通話切換為 **台灣繁體中文聲線**，採用 `zh-TW-HsiaoChenNeural`（女聲／曉臻）與 `zh-TW-YunJheNeural`（男聲／雲哲）。產生的 Podcast 會使用台灣口音。此功能免費且預設啟用，不需額外設定。
- **🎙️ OpenAI TTS 語速調整 (2026-02-05)**：新增 OpenAI TTS 的 `speed` 參數支援，預設語速調整為 **1.3 倍**（快 30%），大幅縮短播放時間。這讓文稿可以更長、內容更豐富，同時保持合理的播放時長。可透過 `AUDIO_SPEED` 環境變數自訂（範圍 0.25-4.0，建議 1.0-1.5）。
- **🔧 Reddit Self Post 修復 (2026-02-05)**：移除了 `!postData.is_self` 過濾條件，解決 Reddit 回傳 0 篇文章的問題。之前的邏輯會過濾掉所有純文字討論貼文，導致 r/sysadmin (10/10) 和 r/dataengineering (9/10) 的文章幾乎全部被排除。現在 self posts 可以透過 JSON API 正確擷取 selftext 內容，大幅增加 Reddit 來源的文章數量與討論深度。
- **Reddit 來源最佳化**：改用資訊密度較高的技術版面（LocalLLaMA、coding、netsec、sysadmin、dataengineering），移除政治相關與較淺的討論版。
- **Force 重新產生**：啟用 force 參數時會清除 script/content/story-contents 的 KV 快取，確保重跑會重新產生新標題與內容。
- **Reddit 去重機制**：新增跨天排除（讀取近 7 天已播清單），避免熱門貼文連續出現。
- **Reddit 討論串**：改抓取 Reddit comments JSON，摘要與腳本可讀到社群觀點。
- **Reddit 選題機制**：每版保留前 K 名後再隨機抽樣，降低重複又保留熱門度。
- **內容過濾**：新增政治相關關鍵字過濾。
- **排程比例**：Hacker News 7 篇、Reddit 3 篇。
- **內容來源**：一般文章先以 create360 的 `/v1/batch` 每批最多取得 5 篇，再個別 fallback 至 `https://create360.ai`、`http://git.glsoft.ai:8083`、`http://60.248.142.126:8083`；Hacker News 留言仍逐篇取得。Reddit 以一個合併 subreddit RSS 取得候選，再以單篇 RSS 取得正文與留言，外部文章才使用自架 reader。
- **Gemini TTS 支援 (2026-02-08)**：新增 Google Gemini TTS 支援，使用 **Fenrir（男）**與 **Leda（女）**聲音。透過 `generativelanguage.googleapis.com` API 呼叫，需設定 Cloudflare Secret `GEMINI_TTS_API_SECRET`，可作為 OpenAI TTS 的替代方案。
- **TTS 故障自動轉移（Fallback）(2026-02-08)**：實作 TTS 容錯機制。當主要 TTS 服務供應商（如 Gemini／OpenAI）發生錯誤時，系統會改用免費的 **Edge TTS** 繼續產生音訊，確保 Podcast 每日更新不中斷。

---

## 📚 文件導覽

本專案功能較多，詳細說明已拆分成不同文件：

| 文件 | 說明 | 適合對象 |
|------|------|----------|
| [README.md](./README.md) | **專案綜覽 & 快速開始** | 所有使用者 |
| [CONFIG-GUIDE.md](docs/CONFIG-GUIDE.md) | **詳細設定指南**（天數、參數、環境變數） | 部署與維護者 |
| [SECURITY.md](docs/SECURITY.md) | **安全指南**（認證、金鑰保護） | 系統管理員 |
| [RSS-FIX-GUIDE.md](docs/RSS-FIX-GUIDE.md) | **RSS 修復與規範** | Podcast 開發者 |
| [CHANGELOG.md](./CHANGELOG.md) | **更新日誌與修復記錄** | 所有使用者、開發者、維護者 |
| [DOCS-INDEX.md](docs/DOCS-INDEX.md) | **完整文件索引** | 進階使用者 |

---

## 🌟 核心特色

- ⚡️ **節目標題**：AI 根據當日素材產生具體、易懂且適合搜尋的標題，不加入素材無法支持的聳動結論。
- 💰 **AdSense 整合**：內建 PC 雙側邊欄 (Sidebar) 與 Mobile 列表廣告穿插機制。
- 🤖 **多源聚合**：Hacker News, Reddit, GitHub, Product Hunt, Dev.to
- 🧠 **AI 智慧摘要**：自動產生台灣繁體中文摘要與講稿（OpenAI／Gemini）
- 🎙️ **語音合成**：Edge TTS / OpenAI TTS / Minimax 多種選擇
- 🎯 **Reddit 熱門隨機化**：每版保留前 K 名後再隨機抽樣，避免熱門貼文長期霸榜
- ☁️ **全雲端執行**：部署於 Cloudflare Workers，不需要自建伺服器

## 📅 內容排程

為了內容多樣性與系統效率，採用動態排程抓取與隨機化機制：

| 星期 | 固定來源 (每日) | 輪替來源 (特色內容) | 總篇數 (約) |
|------|----------------|---------------------|------------|
| **週一** | Hacker News (7), Reddit (3) | 🚀 GitHub Trending (2) | 12 篇 |
| **週二** | Hacker News (7), Reddit (3) | 🏆 Product Hunt (2) | 12 篇 |
| **週三** | Hacker News (7), Reddit (3) | 💻 Dev.to (3) | 13 篇 |
| **週四** | Hacker News (7), Reddit (3) | 🚀 GitHub Trending (2) | 12 篇 |
| **週五** | Hacker News (7), Reddit (3) | 🏆 Product Hunt (2) | 12 篇 |
| **週末** | Hacker News (7), Reddit (3) | - | 10 篇 |

### 🎲 隨機化選文機制
- **Reddit**: 每版保留前 K 名後再隨機抽樣，並套用近 7 天去重，避免熱門貼文連續霸榜。
- **GitHub Trending**: 從 **Top 10** 熱門專案中**隨機挑選**，增加不同專案的曝光機會。
- **Product Hunt**: 從 **Top 10** 熱門產品中**隨機挑選**，不會只介紹第一名。

---

## 🔄 自動化 Workflow 機制

### Workflow 自動串接
系統採用「產生文稿 → 自動觸發語音」的設計：
1. **排程觸發 (Cron)**：每天固定時間 (00:30) 觸發 `PodcastScriptWorkflow`。
2. **產生文稿**：抓取新聞、整理摘要、產生逐字稿，並存入 KV。
3. **自動接續**：文稿完成後，**自動呼叫** `PodcastAudioWorkflow`。
4. **產生語音**：根據逐字稿產出 MP3 並上傳至 R2。

這種設計確保了：
- **不用擔心時間差**：不需要預估文稿要執行多久，完成後會接續產生語音。
- **節省資源**：如果文稿產生失敗（例如來源抓取失敗），就不會觸發語音，避免浪費 TTS 資源。

### YouTube 的「排程」（消費者）：
- YouTube 不知道你的 Workflow 幾點跑完。
- YouTube 的 Crawler 有自己的排程，會定期存取 `https://你的網域/rss.xml`。

> **保護機制說明**：為了避免 YouTube 在音檔還沒好時就抓取導致報錯，系統已在前端 (`rss.xml`) 加入檢查：只有當 **R2 音檔確實存在** 時，該集數才會顯示在 RSS 中。

---

## 🚀 快速開始 (Quick Start)

### 1. 準備工作
- 安裝 Node.js 24（專案以 `.node-version` 固定版本；Wrangler 需要 Node.js 22+）和 pnpm
- 準備 OpenAI API Key
- Cloudflare 帳號 (需開通 Workers 與 R2)

### 2. 下載與安裝
```bash
git clone https://github.com/tbdavid2019/daily-podcast.git
cd daily-podcast
pnpm install
```

### 3. 一鍵設定（建議）
我們提供了一個互動式腳本，幫您產生所有必要的環境變數檔案 (不需手動建立 `.env`)：

```bash
./setup-env-vars.sh
```
*依據提示輸入 API Key 與相關設定即可。*

或者，您可以手動複製範例設定檔：

```bash
cp worker/wrangler.example.jsonc worker/wrangler.jsonc
# 然後編輯 worker/wrangler.jsonc 填入您的 API Key
```

### 4. 部署到 Cloudflare
設定完成後，只需兩行指令即可部署：

```bash
# 1. 部署後端 (Worker)
pnpm run deploy:worker

# 2. 部署前端 (Web)
pnpm run deploy
```

注意：這裡必須使用 `pnpm run deploy`，不要用 `pnpm deploy`。在 `pnpm@10` 下，`pnpm deploy` 會被解讀成 workspace deploy 子命令，而不是 `package.json` 內的 `deploy` script。

### 5. 開發與測試
日誌
```bash
npx wrangler tail
npx wrangler tail daily-podcast-worker
```

---

## ⚙️ 進階設定

關於 **天數限制 (Keep Days)**、**詳細環境變數說明**、**自訂排程邏輯** 等進階設定，請務必閱讀：

👉 **[詳細設定指南（CONFIG-GUIDE.md）](docs/CONFIG-GUIDE.md)**

---

## 🎧 語音合成設定 (TTS Configuration)

本專案支援多種 TTS 服務商，透過設定環境變數 `TTS_PROVIDER` 切換：

| 服務商 (Provider) | 設定值 (`TTS_PROVIDER`) | 必填變數 (Required Vars) | 說明 |
| :--- | :--- | :--- | :--- |
| **Gemini**（建議） | `gemini` | `GEMINI_TTS_API_SECRET` | 使用 Google Gemini 2.5 Flash 產生中文語音（Fenrir／Leda）。 |
| **OpenAI** | `openai` | `OPENAI_TTS_API_SECRET` (或 `OPENAI_API_SECRET`) | 使用 OpenAI TTS (alloy, echo, fable, onyx, nova, shimmer)。 |
| **Minimax** | `minimax` | `TTS_API_ID`, `TTS_API_SECRET` | 使用 Minimax 語音模型。 |
| **Edge TTS**（預設） | `edge`（或留空） | 無 | 使用微軟免費 Edge TTS 與台灣聲線（zh-TW-HsiaoChenNeural）。 |

### Gemini TTS 設定範例

若要使用 Gemini TTS，公開設定留在 `wrangler.jsonc`，金鑰用 Wrangler Secret：

```bash
pnpm exec wrangler secret put --cwd worker GEMINI_TTS_API_SECRET
```

```jsonc
{
  "vars": {
    "TTS_PROVIDER": "gemini",
    // 預設使用 gemini-2.5-flash-preview-tts，可選
    "GEMINI_TTS_MODEL": "gemini-2.5-flash-preview-tts",
    // 自訂 Gemini 音色 (可選)
    "MAN_VOICE_ID": "Puck",   // 男聲預設為 Puck (更渾厚)
    "WOMAN_VOICE_ID": "Leda"  // 女聲預設為 Leda
  }
}
```

### 🗣️ 音色對照表 (Voice ID)

| 提供商 | 性別 | ID (預設) | 其他可用選項 |
| :--- | :--- | :--- | :--- |
| **Gemini** | 男 (Male) | `Puck` | `Fenrir` (舊預設), `Zephyr`, `Charon` |
| **Gemini** | 女 (Female) | `Leda` | `Kore`, `Aoede` |
| **Edge** | 男 (Male) | `zh-TW-YunJheNeural` | `zh-CN-YunxiNeural`, `en-US-ChristopherNeural` |
| **Edge** | 女 (Female) | `zh-TW-HsiaoChenNeural` | `zh-CN-XiaoxiaoNeural`, `en-US-JennyNeural` |
| **OpenAI** | 男 (Male) | `onyx` | `echo`, `fable` |
| **OpenAI** | 女 (Female) | `nova` | `alloy`, `shimmer` |

### 🛡️ 自動故障轉移 (Fallback Mechanism)

若設定的付費 TTS 服務（如 `gemini`、`openai`、`minimax`）發生錯誤，例如額度用盡、API 異常或網路問題，系統會自動處理錯誤並**改用免費的 Edge TTS**，確保 Podcast 音檔能順利產生，不會因單一服務故障而中斷流程。

---

## 🛠️ 開發與測試

### 安全地手動重新產生 Podcast

後端的 `POST /workflow` 使用 Bearer Token 保護。Cloudflare Cron 與文稿完成後
自動觸發聲音的內部流程不需要手動提供 Token。

首次設定：

```bash
# 1. 安全產生 Token 與本機設定（Token 不會印在終端）
pnpm workflow:setup --worker-url https://your-generation-worker.workers.dev

# 2. 將 .env.workflow.local 內的 Token 存入 Cloudflare
pnpm workflow:secret
```

手動執行：

```bash
# 重新產生指定日期的文稿，完成後會自動產生聲音
pnpm workflow:run --today 2026-07-20 --force

# 只重新產生指定日期的聲音
pnpm workflow:audio --today 2026-07-20

# 一般執行不加 --force；同一天重複呼叫會回傳既有 instance
pnpm workflow:run --today 2026-07-20
```

`force` 執行會自動產生 `Idempotency-Key`。如果需要重送同一個請求，可用
`--idempotency-key <原本的值>`，避免因網路重試建立兩份工作。

Token 不需要背下來。它保存在 git ignored、權限為 `0600` 的
`.env.workflow.local`，上述指令會自動讀取。建議另存一份到密碼管理器，但不要
貼到聊天、README、Git 或 shell 指令參數中。

Token 遺失、懷疑外洩或需要定期輪換時：

```bash
# 產生新 Token 並覆寫本機設定
pnpm workflow:setup \
  --worker-url https://your-generation-worker.workers.dev \
  --rotate

# 將新 Token 更新至 Cloudflare；成功後舊 Token 立即失效
pnpm workflow:secret
```

若第二步因網路或登入狀態失敗，重新執行 `pnpm workflow:secret` 即可。Cron 與
Workflow 之間的內部 binding 不使用這組 Token，因此不受輪換影響。

### 新聞來源測試

提交前先執行完整 build gate：

```bash
pnpm check
pnpm opennext
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy --cwd worker --dry-run
```

GitHub 的 `Quality Gate` 會在 push 到 `main` 或建立 Pull Request 時自動執行相同
檢查；CI 使用 Node.js 24 與 `pnpm install --frozen-lockfile`，不持有 production
Secret，也不會自動部署。

本地測試新聞來源抓取邏輯：
```bash
# 測試所有來源 (不消耗 OpenAI額度，僅測試爬蟲)
npx tsx tests/test-new-sources.mjs
```

本地啟動開發伺服器：
```bash
# 終端機 1: 啟動 Worker
pnpm dev:worker

# 終端機 2: 啟動 Web
pnpm dev
```

---

## 🤝 貢獻與支持
歡迎提交 PR 或 Issue。如果您覺得這個專案有幫助，請給我們一顆 ⭐️！
