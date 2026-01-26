# DAVID888 Daily 每日放送

基於原始專案 [Hacker News 每日播報](https://github.com/ccbikai/hacker-news) 擴展開發的 AI 科技播客系統。

**專案倉庫**: https://github.com/tbdavid2019/daily-podcast

**預覽地址**: https://podcast.david888.com

**RSS 訂閱**: https://podcast.david888.com/rss.xml

---

## 📚 文檔導航

本專案功能豐富，為保持文檔清晰，詳細說明已拆分：

| 文檔 | 說明 | 適合對象 |
|------|------|----------|
| [README.md](./README.md) | **專案綜覽 & 快速開始** | 所有使用者 |
| [CONFIG-GUIDE.md](docs/CONFIG-GUIDE.md) | **詳細配置指南** (天數、參數、環境變數) | 部署與維護者 |
| [SECURITY.md](docs/SECURITY.md) | **安全指南** (認證、密鑰保護) | 系統管理員 |
| [RSS-FIX-GUIDE.md](docs/RSS-FIX-GUIDE.md) | **RSS 修復與規範** | 播客開發者 |
| [DOCS-INDEX.md](docs/DOCS-INDEX.md) | **完整文檔索引** | 進階使用者 |

---

## 🌟 核心特色

- ⚡️ **驚悚標題生成**：AI 自動生成符合 SEO 與點擊率的「震驚體」標題 (Clickbait Title)，提升傳播力。
- 💰 **AdSense 整合**：內建 PC 雙側邊欄 (Sidebar) 與 Mobile 列表廣告穿插機制。
- 🤖 **多源聚合**：Hacker News, Reddit, GitHub, Product Hunt, Dev.to
- 🧠 **AI 智慧摘要**：自動生成繁體中文摘要與講稿 (OpenAI / Gemini)
- 🎙️ **語音合成**：Edge TTS / OpenAI TTS / Minimax 多種選擇
- 🔄 **Round Robin 選文**：Reddit 採用輪詢機制，確保內容多樣性，不被單一來源洗版
- ☁️ **全雲端運行**：部署於 Cloudflare Workers，無需自建伺服器

## 📅 內容排程

為了內容多樣性與系統效率，採用動態排程抓取與隨機化機制：

| 星期 | 固定來源 (每日) | 輪替來源 (特色內容) | 總篇數 (約) |
|------|----------------|---------------------|------------|
| **週一** | Hacker News (5), Reddit (5) | 🚀 GitHub Trending (2) | 12 篇 |
| **週二** | Hacker News (5), Reddit (5) | 🏆 Product Hunt (2) | 12 篇 |
| **週三** | Hacker News (5), Reddit (5) | 💻 Dev.to (3) | 13 篇 |
| **週四** | Hacker News (5), Reddit (5) | 🚀 GitHub Trending (2) | 12 篇 |
| **週五** | Hacker News (5), Reddit (5) | 🏆 Product Hunt (2) | 12 篇 |
| **週末** | Hacker News (6), Reddit (6) | - | 12 篇 |

### 🎲 隨機化選文機制
- **Reddit**: 採用 `Hot` / `Rising` / `Top` 三種排序**隨機切換**，避免連續幾天因為熱門文章霸榜而重複抓取。
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

### 4. 部署到 Cloudflare
設定完成後，只需兩行指令即可部署：

```bash
# 1. 部署後端 (Worker)
pnpm run deploy:worker

# 2. 部署前端 (Web)
pnpm run deploy
```

---

## ⚙️ 進階配置

關於 **天數限制 (Keep Days)**、**詳細環境變數說明**、**自訂排程邏輯** 等進階設定，請務必閱讀：

👉 **[詳細配置指南 (CONFIG-GUIDE.md)](docs/CONFIG-GUIDE.md)**

---

## 🛠️ 開發與測試

本地測試新聞來源抓取邏輯：
```bash
# 測試所有來源 (不消耗 OpenAI額度，僅測試爬蟲)
npx tsx test-new-sources.mjs
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
