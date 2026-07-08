# 播放器漂浮與 RSS 格式優化記錄 (2026-07-08)

## 🎯 優化與修復目標

本次更新主要解決了網頁端播放器無法固定漂浮在最上方的問題、修改了頁尾（Footer）的商標與版權聲明，並優化了 RSS XML 的生成結構，解決了 YouTube Podcast RSS 匯入時因為描述過長而產生的警告訊息，同時也滿足了聽眾在 Apple Podcasts 等客戶端收聽時能夠直觀點擊回連至網站原文章的期待。

## 📝 主要變更

### 1. 網頁播放器懸浮固定修復 (`components/article-card.tsx`)
- **問題**: 之前版本在 `Card` 元件加上了 `overflow-hidden`，這會限制子元素的粘性定位 (`position: sticky`)，導致播放器無法在滾動時固定於最上方。同時播放器容器也遺失了對應的 sticky 類別。
- **修復**:
  - 移除了卡片外層的 `overflow-hidden`，讓 `position: sticky` 能穿透卡片容器。
  - 將播放器容器 `CardContent` 的樣式設定為 `sticky top-0 z-30 bg-white/90 backdrop-blur-md border-y border-zinc-200/30`，確保其漂浮時擁有良好的視覺效果且不遮蔽背景。
  - 在卡片底部 `CardFooter` 元件加上 `rounded-b-lg`，維持卡片視覺整潔與圓角的美觀。

### 2. 頁尾版權聲明調整 (`app/layout.tsx`)
- **修復**: 移除了原有的 Hacker News 關聯聲明，將頁尾文字修改為簡潔的製作聲明，並提供超連結導向個人主頁：
  > 由 [david888.com](https://david888.com) 製作

### 3. RSS 格式與描述長度優化 (`app/rss.xml/route.ts`)
- **修復**:
  - **解決 YouTube 描述過長警告**: YouTube Podcasts 匯入 RSS 時要求影片描述長度在 5,000 字元內。先前 RSS 的 `<description>` 和 `<content:encoded>` 在沒有 `introContent` 時會包含整篇極長逐字稿，導致匯入後被 YouTube 強制截斷。現在 `description` 被優化為 `[回連連結] + [極簡摘要]`，且當無極簡摘要時，只截取前 300 個字元作為預覽，確保極致安全。
  - **Apple Podcasts 回連連結支援**: 在 RSS 產生的 `<description>` (純文字) 與 `<content:encoded>` (HTML) 最頂部，直接置頂顯示 `"詳細網頁版與參考連結：https://podcast.david888.com/post/YYYY-MM-DD"`。方便聽眾在任何 Podcast 播放器中一鍵返回官網。
  - **精簡 HTML 內文**: `<content:encoded>` 移除了原本整篇長度高達數千字元且排版雜亂的 Markdown 渲染 HTML，改為極簡的 `[網頁回連] + [極簡摘要] + [相關參考連結列表]`，大幅縮減 Feed 體積並防止 YouTube 出錯。
  - **代碼清理**: 移除了 `app/rss.xml/route.ts` 中不再使用的 `markdown-it` 套件引用與相關實例程式碼。

## 🚀 驗證結果

### 播放器體驗
- 在文章詳細頁滾動時，播放器列能完美黏定於瀏覽器最上方，且具備半透明毛玻璃質感。

### RSS 規格驗證
- 檢查 `/rss.xml` 輸出的 XML 結構，`<description>` 與 `<content:encoded>` 均成功在第一行輸出指引連結，且內容大小控制在 1,000 字元以內，完美避開 YouTube 5,000 字元長度限制。

---
**📖 相關文件**: [文檔索引](./DOCS-INDEX.md) | [專案 README](../README.md)
