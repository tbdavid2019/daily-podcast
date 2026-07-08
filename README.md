# DAVID888 Daily 每日放送

基於原始專案 [Hacker News 每日播報](https://github.com/ccbikai/hacker-news) 擴展開發的 AI 科技播客系統。

**專案倉庫**: https://github.com/tbdavid2019/daily-podcast

**預覽地址**: https://podcast.david888.com

**RSS 訂閱**: https://podcast.david888.com/rss.xml

---

## 🆕 最近更新

- **📌 播放器懸浮固定與 RSS 格式優化 (2026-07-08)**：修復了網頁端播放器在滾動時無法固定在頂部的問題；頁尾版權聲明更改為「由 david888.com 製作」；優化 RSS feed 以置頂回連網址，並藉由限制內文大小，徹底解決 YouTube Podcast 匯入時描述過長的警告。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🌐 RSS CORS 與 Cloudflare 部署指令修正 (2026-07-08)**：`/rss.xml` 現在會回傳 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods` 與 `Access-Control-Allow-Headers`，可供前端瀏覽器直接跨站抓取 RSS。另已釐清 Cloudflare 正確部署指令必須使用 `pnpm run deploy`，不能使用 `pnpm deploy`，並同步修正文檔與腳本。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🤖 Agent Discovery / robots.txt / Markdown for Agents (2026-07-07)**：新增正式 `robots.txt`（含 `GPTBot`、`OAI-SearchBot`、`Claude-Web`、`Google-Extended` 與 wildcard 規則）、`Content-Signal`、首頁 `Link` discovery headers、`/.well-known/api-catalog`、`/.well-known/agent-skills/index.json`、`/openapi.json`、`/api/status` 與 `/docs/api`。同時支援首頁與文章頁在 `Accept: text/markdown` 時回傳 Markdown，並已部署至 `https://podcast.david888.com`。詳見 [CHANGELOG.md](CHANGELOG.md)。
- **🖼️ Bing 背景與 Bento 視覺優化 (2026-04-24)**：導入了動態 Bing 桌布背景功能，支援從 GitHub 源隨機抓取歷史桌布，並套用平滑的呼吸動畫。同時全面套用 **Bento 設計風格**，引入毛玻璃質感 (`backdrop-blur`)、現代 `Inter` 字體與精緻的間距系統。背景開關預設調整為 **開啟 (ON)**，使用者仍可於右上角手動切換。
- **🗣️ Edge TTS 台灣優化 (2026-02-05)**：預設 Edge TTS 聲線已從中國普通話切換為 **台灣繁體中文聲線**，採用最自然的 `zh-TW-HsiaoChenNeural` (女聲/曉臻) 與 `zh-TW-YunJheNeural` (男聲/雲哲)。生成的 Podcast 將擁有道地的台灣口音，聽感更親切自然。此功能為免費且預設啟用，無需額外設定。
- **🎙️ OpenAI TTS 語速調整 (2026-02-05)**：新增 OpenAI TTS 的 `speed` 參數支援，預設語速調整為 **1.3 倍**（快 30%），大幅縮短播放時間。這讓文稿可以更長、內容更豐富，同時保持合理的播放時長。可透過 `AUDIO_SPEED` 環境變數自訂（範圍 0.25-4.0，建議 1.0-1.5）。
- **🔧 Reddit Self Post 修復 (2026-02-05)**：移除了 `!postData.is_self` 過濾條件，解決 Reddit 返回 0 篇文章的問題。之前的邏輯會過濾掉所有純文字討論貼文，導致 r/sysadmin (10/10) 和 r/dataengineering (9/10) 的文章幾乎全部被排除。現在 self posts 可以透過 JSON API 正確提取 selftext 內容，大幅增加 Reddit 來源的文章數量與討論深度。
- **Reddit 來源優化**：全面替換來源為高含金量技術版面 (LocalLLaMA, coding, netsec, sysadmin, dataengineering)，移除政治相關與淺層討論版。
- **Force 重新生成**：啟用 force 參數時會清除 script/content/story-contents 的 KV 快取，確保重跑會重新產生新標題與內容。
- **Reddit 去重機制**：新增跨天排除（讀取近 7 天已播清單），避免熱門貼文連續出現。
- **Reddit 討論串**：改抓取 Reddit comments JSON，摘要與腳本可讀到社群觀點。
- **Reddit 選題機制**：每版保留前 K 名後再隨機抽樣，降低重複又保留熱門度。
- **內容過濾**：新增政治相關關鍵字過濾。
- **排程比例**：Hacker News 7 篇、Reddit 3 篇。
- **爬蟲熔斷機制**：針對 Jina / Firecrawl 增加錯誤計數熔斷機制。當連續 2 次遇到 402 (Payment Required) 或 429 (Too Many Requests) 錯誤時，自動暫停後續請求，避免大量無效 subrequest 導致 Workflow 崩潰。
- **Gemini TTS 支援 (2026-02-08)**：新增 Google Gemini TTS 支援，使用高品質的 **Fenrir (男)** 與 **Leda (女)** 聲音。透過 `generativelanguage.googleapis.com` API 呼叫，需配置 `GEMINI_TTS_API_KEY`。此功能提供更自然的語音合成效果，且可作為 OpenAI TTS 的替代方案。
- **TTS 故障自動轉移 (Fallback) (2026-02-08)**：實作 TTS 容錯機制。當主選的 TTS 服務商（如 Gemini/OpenAI）發生錯誤時，系統會自動降級並切換至免費的 **Edge TTS** 繼續生成，確保 Podcast 每日更新不中斷。
- **自建 Jina Reader 支援**：支援配置多個自建 Jina Reader 節點（Primary/Secondary），優先使用自建節點以節省額度並提高穩定性。

---

## 📚 文檔導航

本專案功能豐富，為保持文檔清晰，詳細說明已拆分：

| 文檔 | 說明 | 適合對象 |
|------|------|----------|
| [README.md](./README.md) | **專案綜覽 & 快速開始** | 所有使用者 |
| [CONFIG-GUIDE.md](docs/CONFIG-GUIDE.md) | **詳細配置指南** (天數、參數、環境變數) | 部署與維護者 |
| [SECURITY.md](docs/SECURITY.md) | **安全指南** (認證、密鑰保護) | 系統管理員 |
| [RSS-FIX-GUIDE.md](docs/RSS-FIX-GUIDE.md) | **RSS 修復與規範** | 播客開發者 |
| [CHANGELOG.md](./CHANGELOG.md) | **更新日誌與修復記錄** | 所有使用者、開發者、維護者 |
| [DOCS-INDEX.md](docs/DOCS-INDEX.md) | **完整文檔索引** | 進階使用者 |

---

## 🌟 核心特色

- ⚡️ **驚悚標題生成**：AI 自動生成符合 SEO 與點擊率的「震驚體」標題 (Clickbait Title)，提升傳播力。
- 💰 **AdSense 整合**：內建 PC 雙側邊欄 (Sidebar) 與 Mobile 列表廣告穿插機制。
- 🤖 **多源聚合**：Hacker News, Reddit, GitHub, Product Hunt, Dev.to
- 🧠 **AI 智慧摘要**：自動生成繁體中文摘要與講稿 (OpenAI / Gemini)
- 🎙️ **語音合成**：Edge TTS / OpenAI TTS / Minimax 多種選擇
- 🎯 **Reddit 熱門隨機化**：每版保留前 K 名後再隨機抽樣，避免熱門貼文長期霸榜
- ☁️ **全雲端運行**：部署於 Cloudflare Workers，無需自建伺服器

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
系統採用「文稿生成 -> 自動觸發語音」的設計：
1. **排程觸發 (Cron)**：每天固定時間 (00:30) 觸發 `PodcastScriptWorkflow`。
2. **文稿生成**：抓取新聞、整理摘要、生成逐字稿，並存入 KV。
3. **自動接續**：文稿生成完畢後，**自動呼叫** `PodcastAudioWorkflow`。
4. **語音生成**：根據逐字稿產出 MP3 並上傳至 R2。

這種設計確保了：
- **不用擔心時間差**：不需要預估文稿要跑多久，完成後自然會接續語音生成。
- **節省資源**：如果文稿生成失敗（例如爬蟲掛了），就不會觸發語音生成，避免浪費 TTS 資源。

### YouTube 的「排程」（消費者）：
- YouTube 不知道你的 Workflow 幾點跑完。
- YouTube 自己的機器人（Crawler）有它自己的時間表，它會定期來訪問你的網址 `https://你的網域/rss.xml`。

> **保護機制說明**：為了避免 YouTube 在音檔還沒好時就抓取導致報錯，系統已在前端 (`rss.xml`) 加入檢查：只有當 **R2 音檔確實存在** 時，該集數才會顯示在 RSS 中。

---

## 🚀 快速開始 (Quick Start)

### 1. 準備工作
- 安裝 Node.js 18+ 和 pnpm
- 準備 OpenAI API Key
- Cloudflare 帳號 (需開通 Workers 與 R2)

### 2. 下載與安裝
```bash
git clone https://github.com/tbdavid2019/daily-podcast.git
cd daily-podcast
pnpm install
```

### 3. 一鍵配置 (推薦)
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

## ⚙️ 進階配置

關於 **天數限制 (Keep Days)**、**詳細環境變數說明**、**自訂排程邏輯** 等進階設定，請務必閱讀：

👉 **[詳細配置指南 (CONFIG-GUIDE.md)](docs/CONFIG-GUIDE.md)**

---

## 🎧 語音合成設定 (TTS Configuration)

本專案支援多種 TTS 服務商，透過設定環境變數 `TTS_PROVIDER` 切換：

| 服務商 (Provider) | 設定值 (`TTS_PROVIDER`) | 必填變數 (Required Vars) | 說明 |
| :--- | :--- | :--- | :--- |
| **Gemini** (推薦) | `gemini` | `GEMINI_TTS_API_KEY` | 使用 Google Gemini 2.5 Flash 生成高品質中文語音 (Fenrir/Leda)。 |
| **OpenAI** | `openai` | `OPENAI_TTS_API_KEY` (或 `OPENAI_API_KEY`) | 使用 OpenAI TTS (alloy, echo, fable, onyx, nova, shimmer)。 |
| **Minimax** | `minimax` | `TTS_API_ID`, `TTS_API_KEY` | 使用 Minimax 語音模型。 |
| **Edge TTS** (預設) | `edge` (或留空) | 無 | 使用微軟免費 Edge TTS，台灣腔調優化 (zh-TW-HsiaoChenNeural)。 |

### Gemini TTS 設定範例

若要使用 Gemini TTS，請在 `wrangler.jsonc` 或環境變數中設定：

```jsonc
{
  "vars": {
    "TTS_PROVIDER": "gemini",
    "GEMINI_TTS_API_KEY": "你的_Google_AI_Studio_API_Key",
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

若配置的付費 TTS 服務商（如 `gemini`, `openai`, `minimax`）發生錯誤（例如額度用盡、API 異常或網路問題），系統會自動捕捉錯誤並**降級切換至免費的 Edge TTS**，確保 Podcast 音檔能順利生成，不會因為單一服務商故障而中斷流程。

---

## 🛠️ 開發與測試

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
