# 新聞來源擴充實作說明

## 🎯 新增功能概覽

本次更新為 Hacker News 播客系統新增了三個新的新聞來源：

1. **GitHub Trending** - 熱門開源專案（使用 DeepWiki 增強內容）
2. **Product Hunt** - 新產品發布  
3. **Dev.to** - 技術文章 Top 10

## 📝 主要變更

### 1. 類型定義更新 (`types/story.d.ts`)

擴充了 `Story` 介面以支援多種來源：

```typescript
interface Story {
  id?: string
  title?: string
  url?: string
  hackerNewsUrl?: string  // 改為可選
  source?: 'hacker-news' | 'github-trending' | 'product-hunt' | 'dev-to'
  sourceUrl?: string      // 原始來源 URL
  description?: string    // 描述文字
  stars?: number         // GitHub stars
  votes?: number         // Product Hunt votes
}
```

### 2. 爬蟲函數 (`workflow/utils.ts`)

新增了四個核心函數：

#### `getGitHubTrendingStories()`
- 爬取 GitHub Trending 頁面
- **特色功能**: 將 GitHub URL 轉換為 DeepWiki URL 以獲取更豐富的內容
- 原始：`https://github.com/user/repo`
- 轉換：`https://deepwiki.com/user/repo`
- 使用 Jina AI 作為前綴：`https://r.jina.ai/https://deepwiki.com/user/repo`

#### `getProductHuntStories()`
- 爬取 Product Hunt 首頁熱門產品
- 提取產品名稱、描述、投票數
- 限制取前 5 個產品

#### `getDevToStories()`
- 爬取 Dev.to 週熱門文章
- 提取文章標題、作者、標籤
- 限制取前 10 篇文章

#### `getAllStories()`
- 聚合所有來源的內容
- 並行獲取所有來源，單一來源失敗不影響整體
- 內容分配：HN 15個 + GitHub 10個 + PH 5個 + Dev.to 10個

### 3. 內容處理更新

#### 智能內容獲取 (`getHackerNewsStory()`)
根據來源類型採用不同的內容處理策略：

- **Hacker News**: 獲取文章 + 評論
- **其他來源**: 獲取文章內容 + 描述 + 來源標識

#### AI 提示詞更新 (`workflow/prompt.ts`)
- 更新 `summarizeStoryPrompt` 以處理多種來源類型
- 針對不同來源調整介紹方式：
  - 文章：話題 + 要點 + 觀點
  - 開源專案：功能 + 技術亮點 + 社群反應
  - 新產品：特色 + 市場定位 + 創新點
  - 技術文章：核心概念 + 實用價值

### 4. 工作流程整合 (`workflow/index.ts`)

將主要的故事獲取邏輯從 `getHackerNewsTopStories()` 切換到 `getAllStories()`，實現多來源內容聚合。

## 🚀 使用方式

### 自動運行
系統會在每日 23:30 UTC 自動執行，無需手動介入。

### 手動測試
使用提供的測試文件：

```bash
node test-new-sources.js
```

### 配置選項
可以在環境變數中設定：
- `JINA_KEY`: Jina AI API 金鑰（可選）
- `FIRECRAWL_KEY`: Firecrawl API 金鑰（備用）

## 🔧 系統特色

### 1. 容錯設計
- 每個來源獨立運行，單一失敗不影響整體
- Jina AI 主要，Firecrawl 備用
- 詳細的錯誤日誌記錄

### 2. 內容品質
- GitHub 專案使用 DeepWiki 獲得更詳細的專案介紹
- 智能限制各來源的內容數量，平衡多樣性
- AI 針對不同內容類型調整處理方式

### 3. 擴展性
- 模組化設計，新增來源只需添加對應函數
- 統一的 Story 介面，易於整合
- 配置化的內容數量控制

## 📊 預期效果

更新後的播客將涵蓋：
- **技術討論**: Hacker News 熱門文章與評論
- **開源動態**: GitHub 上的創新專案  
- **產品發現**: Product Hunt 的新產品發布
- **技術文章**: Dev.to 社群的優質內容

這將為聽眾提供更全面、多元的科技資訊視角。