# CHANGELOG: Bing 背景與 Bento 視覺優化 (2026-04-24)

## 概述
本更新導入了動態 Bing 桌布背景功能，並運用 Bento 設計風格全面優化了前端介面視覺，提升了整體的沉浸感與現代感。

## 新增功能
### 1. 動態 Bing 背景
- **呼吸動畫**：實作了圖片載入後的平滑淡入與 `scale(1.1)` 到 `scale(1.0)` 的緩慢縮放動畫（Ken Burns 效果）。
- **隨機桌布**：每次載入時從 GitHub 源 (`v5tech/bing-wallpaper`) 隨機抓取一張歷史桌布。
- **開關控制**：在網頁右上角新增了切換按鈕，預設調整為 **開啟 (ON)**，並支援 `localStorage` 偏好記憶。
- **偏好持久化**：使用 `localStorage` 儲存使用者的背景開關設定。

### 2. Bento 視覺風格優化
- **毛玻璃效果 (Glassmorphism)**：為文章卡片 (`ArticleCard`) 與 UI 組件加入 `backdrop-blur` 與半透明背景。
- **現代字體**：引入 `Inter` 字體，並針對標題進行加粗與字距調整（Tracking Tight）。
- **佈局升級**：
  - 加大標題層次感。
  - 優化間距系統（基於 4/8/12/16/24/32 比例）。
  - 文章卡片加入更柔和的邊框、陰影與懸停（Hover）過渡效果。

## 技術改動
- **Styles**: 
  - `app/globals.css`: 新增 `animate-zoom-out` 動畫與 `glass` utility classes。
- **Components**:
  - `components/bing-background.tsx`: [NEW] 處理背景圖邏輯與動畫。
  - `components/bg-toggle.tsx`: [NEW] 提供右上角切換介面。
  - `components/article-card.tsx`: [MODIFY] 全面重構視覺樣式。
- **Layout**:
  - `app/layout.tsx`: [MODIFY] 整合新組件並套用 `Inter` 字體。

## 驗證項目
- [x] 背景開關功能正常。
- [x] 圖片載入動畫平滑無殘影。
- [x] 各裝置響應式佈局正常。
- [x] `localStorage` 設定成功保存。
