# 📚 文檔索引

歡迎使用 DAVID888 Daily Podcast！本專案提供完整的文檔系統，幫助您快速上手和深入了解。

## 🗂️ 文檔結構

### 📖 核心文檔

#### [README.md](../README.md) - 專案主文檔

**適合對象**: 所有使用者

**內容概覽**:

- ✨ 專案簡介與特性
- 📊 新聞來源說明
- 🚀 快速開始指南
- ☁️ Cloudflare Workers 部署
- ✅ 部署檢查清單
- 📊 技術架構說明
- ❓ 常見問題解答
- 📝 更新日誌

**何時閱讀**: 首次使用專案、想了解專案功能、準備部署應用

---

### ⚙️ 配置與設定

#### [CONFIG-GUIDE.md](./CONFIG-GUIDE.md) - 配置使用指南

**適合對象**: 部署與維護者

**內容概覽**:

- 📅 天數限制配置（keepDays、sitemapDays、rssDays）
- 🌐 環境變數完整說明
- 🔗 域名對應關係
- 📝 配置方案推薦
- 🔄 完整部署流程
- ⚠️ 常見錯誤排查

**何時閱讀**:

- 遇到 "Too many API requests" 錯誤
- 需要調整首頁顯示天數
- 配置環境變數時
- 理解各個 URL 的用途

**關鍵章節**:

- `天數限制配置` - 解決請求過多問題
- `環境變數用途說明` - 理解每個變數的作用
- `域名對應關係` - 了解 Worker URL、R2 URL 等的設定

---

### 🔒 安全相關

#### [SECURITY.md](./SECURITY.md) - 安全指南

**適合對象**: 系統管理員、注重安全的開發者

**內容概覽**:

- ⚠️ 安全威脅說明
- 🛡️ 四種認證方案（API Token、Cloudflare Access、IP 白名單、速率限制）
- 🔐 API 密鑰管理
- 🔍 監控與檢測
- 🚨 應急響應流程
- 📋 安全檢查清單
- 💡 最佳實踐

**何時閱讀**:

- 部署前安全評估
- Worker URL 已洩露或懷疑洩露
- 需要實施認證機制
- API 密鑰管理
- 定期安全審計

**重要警告**:

- ⚠️ 不要公開 Worker URL
- ⚠️ 不要在 Git 提交中包含密鑰
- ⚠️ 定期輪換 API 密鑰

**關鍵章節**:

- `實施安全措施` - 四種認證方案詳解
- `應急響應` - Worker URL 或密鑰洩露時的處理
- `安全檢查清單` - 部署前後的檢查項目

---

### 📻 RSS Feed 相關

#### [RSS-FIX-GUIDE.md](./RSS-FIX-GUIDE.md) - RSS Feed 修復說明

**適合對象**: 播客開發者、RSS Feed 維護者

**內容概覽**:

- ✅ Byte-range support 實施（串流支援）
- ✅ Podcast namespace 添加（PSP-1 規範）
- 📝 驗證方法與工具
- 📏 播客封面圖規格
- 🎯 播客平台要求
- 🔍 故障排除
- 🚀 未來改進建議

**何時閱讀**:

- RSS 驗證器報錯
- 播客 App 無法串流播放
- 需要提交到 Apple Podcasts
- 封面圖顯示問題

**關鍵章節**:

---

### 🤖 Agent Discovery / SEO for Agents

#### [CHANGELOG-Agent-Discovery-與-robots.txt.md](./CHANGELOG-Agent-Discovery-%E8%88%87-robots.txt.md) - Agent Discovery / robots 變更紀錄

**適合對象**: 維護者、SEO/Agent Readiness 檢查者

**內容概覽**:

- 🤖 `robots.txt` crawler rules
- 🧭 Homepage `Link` discovery headers
- 🔗 `/.well-known/api-catalog`
- 🛠️ `/.well-known/agent-skills/index.json`
- 📝 Markdown for Agents
- 🚀 線上部署與驗證結果

**何時閱讀**:

- Agent Readiness 掃描失敗時
- 想確認站點對 AI crawler 的政策時
- 想驗證 discovery endpoints 是否已上線時

- `Byte-range Support` - 實施串流播放
- `驗證方法` - 使用驗證器檢查 RSS
- `故障排除` - 解決常見 RSS 問題

---

### 📝 更新記錄

#### [CHANGELOG-新聞來源擴充.md](./CHANGELOG-新聞來源擴充.md) - 版本更新記錄

**適合對象**: 開發者、貢獻者

**內容概覽**:

- 📅 版本更新歷史
- ✨ 新功能說明
- 🐛 Bug 修復記錄
- 🔧 改進內容

**何時閱讀**: 想了解專案演進、查看新功能、追蹤 bug 修復

#### [CHANGELOG-RSS-排序修正.md](./CHANGELOG-RSS-排序修正.md) - RSS 日期排序修正記錄

**適合對象**: 播客維護者、RSS Feed 維護者、開發者

**內容概覽**:

- 📅 RSS 排序問題根因
- 🛠️ `pubDate` 與 `enclosure` 穩定化修正
- 🔧 Workflow `generatedAt` 補強
- ☁️ Cloudflare 部署紀錄
- ✅ 驗證建議與後續改善方向

**何時閱讀**: Pocket Casts 等客戶端排序異常、排查 RSS 更新判定、追蹤本次修正內容

#### [CHANGELOG-TTS-與-Workflow-修正.md](./CHANGELOG-TTS-與-Workflow-修正.md) - TTS 引擎與 Workflow 穩定性修復記錄

**適合對象**: 部署與維護者、開發者

**內容概覽**:

- 🎤 TTS 引擎模型代碼校正
- 🔐 API Key 安全更新紀錄
- 🔁 Workflow 重複觸發機制修復 (KV Lock)
- 🌐 API 路由精確化修正

#### [CHANGELOG-Bing背景與Bento視覺優化.md](./CHANGELOG-Bing背景與Bento視覺優化.md) - 背景動畫與視覺升級記錄

**適合對象**: 前端開發者、UI/UX 設計感興趣者

**內容概覽**:

- 🖼️ Bing 動態背景實作（Ken Burns 效果）
- 🔘 右上角切換開關與 localStorage 持久化
- ✨ Bento 風格視覺優化（毛玻璃、Inter 字體）

**何時閱讀**: 想了解如何實現高質感的背景動畫，或需要參考 Bento 設計風格實作時。

---

## 🎯 快速查找指南

### 我想...

#### 🚀 開始使用專案

1. 閱讀 [README.md](../README.md) 的「快速開始」章節
2. 按照步驟安裝依賴和設定環境變數
3. 參考「部署檢查清單」確保一切就緒

#### ⚙️ 修改配置

1. 查看 [CONFIG-GUIDE.md](./CONFIG-GUIDE.md)
2. 找到對應的配置項（天數限制、環境變數等）
3. 按照說明修改並重新部署

#### 🔒 保護我的應用

1. 閱讀 [SECURITY.md](./SECURITY.md)
2. 選擇一種認證方案實施
3. 使用「安全檢查清單」進行檢查

#### 📻 修復 RSS Feed

1. 參考 [RSS-FIX-GUIDE.md](./RSS-FIX-GUIDE.md)
2. 使用驗證器檢查問題
3. 按照修復步驟操作

#### 🗓️ 排查 RSS 日期排序

1. 參考 [CHANGELOG-RSS-排序修正.md](./CHANGELOG-RSS-排序修正.md)
2. 檢查 RSS item 的 `pubDate` 是否穩定
3. 手動 refresh 播客 App 驗證排序結果

#### 🎤 排查 TTS 或 Workflow 啟動問題

1. 參考 [CHANGELOG-TTS-與-Workflow-修正.md](./CHANGELOG-TTS-與-Workflow-修正.md)
2. 檢查 `wrangler.jsonc` 中的模型代碼與 API Key
3. 驗證 KV 鎖定機制與路由設定

#### ❓ 解決問題

1. 先查看 [README.md](../README.md) 的「常見問題」
2. 再查看對應主題的專門文檔
3. 檢查 [CONFIG-GUIDE.md](./CONFIG-GUIDE.md) 的「常見錯誤」章節

---

## 📊 文檔關聯圖

```
README.md (主入口)
    │
    ├─► CONFIG-GUIDE.md (配置詳解)
    │       ├─ 天數限制配置
    │       ├─ 環境變數說明
    │       └─ 域名對應關係
    │
    ├─► SECURITY.md (安全指南)
    │       ├─ 認證機制
    │       ├─ 密鑰管理
    │       └─ 應急響應
    │
    ├─► RSS-FIX-GUIDE.md (RSS 修復)
    │       ├─ Byte-range 支援
    │       ├─ Podcast namespace
    │       └─ 驗證方法
    │
    ├─► CHANGELOG-新聞來源擴充.md (更新記錄)
    │       └─ 版本歷史
    │
    ├─► CHANGELOG-RSS-排序修正.md (RSS 排序修正)
    │       └─ 日期排序與部署紀錄
    │
    ├─► CHANGELOG-TTS-與-Workflow-修正.md (TTS 與 Workflow 修正)
    │       └─ TTS 引擎與 Workflow 穩定性
    │
    └─► CHANGELOG-Bing背景與Bento視覺優化.md (視覺優化)
            └─ 背景動畫與 Bento 風格實作
```

---

## 💡 閱讀建議

### 👶 新手使用者

按以下順序閱讀：

1. [README.md](../README.md) - 了解專案
2. [README.md](../README.md) 快速開始 - 部署應用
3. [CONFIG-GUIDE.md](./CONFIG-GUIDE.md) - 配置調整
4. [SECURITY.md](./SECURITY.md) - 保護應用

### 👨‍💻 開發者

重點閱讀：

1. [README.md](../README.md) - 技術架構
2. [CONFIG-GUIDE.md](./CONFIG-GUIDE.md) - 配置系統
3. [SECURITY.md](./SECURITY.md) - 安全最佳實踐
4. [CHANGELOG-新聞來源擴充.md](./CHANGELOG-新聞來源擴充.md) - 版本歷史
5. [CHANGELOG-RSS-排序修正.md](./CHANGELOG-RSS-排序修正.md) - RSS 排序修正
6. [CHANGELOG-TTS-與-Workflow-修正.md](./CHANGELOG-TTS-與-Workflow-修正.md) - TTS 與 Workflow 修正

### 🎙️ 播客製作者

重點閱讀：

1. [README.md](../README.md) - 專案功能
2. [RSS-FIX-GUIDE.md](./RSS-FIX-GUIDE.md) - RSS 優化
3. [CONFIG-GUIDE.md](./CONFIG-GUIDE.md) - 內容配置
4. [CHANGELOG-RSS-排序修正.md](./CHANGELOG-RSS-排序修正.md) - 排序異常排查

### 🛡️ 系統管理員

重點閱讀：

1. [SECURITY.md](./SECURITY.md) - 全面安全指南
2. [CONFIG-GUIDE.md](./CONFIG-GUIDE.md) - 環境配置
3. [README.md](../README.md) - 部署檢查清單

---

## 🔄 文檔更新

本文檔系統會隨專案演進持續更新。建議：

- ⭐ Star 專案以接收更新通知
- 📌 定期查看文檔是否有新內容
- 💬 發現問題或有建議？歡迎提 Issue

---

## 📞 需要幫助？

1. **查看文檔** - 大多數問題都能在文檔中找到答案
2. **搜尋 Issue** - 查看是否有人遇到類似問題
3. **提交 Issue** - 描述清楚問題，提供錯誤訊息
4. **參與討論** - 在 Discussions 中交流心得

---

**📖 開始閱讀**: [返回 README.md](../README.md)
