# SoundOn Podcast 整合方案

本文整理三種將 SoundOn 節目整合到既有每日 Podcast 專案的作法，供後續討論與選擇。

## 方案 A：新增 Workflow + 內容落地 R2/KV

- **流程**：建立與 `HackerNewsWorkflow` 類似的工作流程，定時抓取 SoundOn RSS → 解析節目 →（可選）下載音訊 → 上傳 R2 → 落地節目資訊到 KV/D1。
- **優點**：
  - 內容與音訊都掌握在自己手中，可離線備份、應對 RSS/MP3 失效。
  - 與現有 Hacker News 管線一致，部署與權限管理較單純。
  - 可彈性設定抓取數量、補舊集、緩存策略等。
- **缺點**：
  - 第一次同步大量音檔時要注意 subrequest / timeout，可需分批或減量。
  - 佔用 R2 儲存空間，音訊多時會產生費用。

## 方案 B：落地節目資訊，但音訊仍指向 SoundOn

- **流程**：Workflow 只拉 RSS → 將節目標題、摘要、原始 MP3 URL 寫到 KV；前端直接播放 SoundOn 的音檔。
- **優點**：
  - KV 中保留節目資訊，前端顯示一致，流程簡化。
  - 不需儲存音訊，省下 R2 成本，也降低 subrequest。
  - 若未來想改成備份音訊，只要補上下載流程即可。
- **缺點**：
  - 播放仍依賴 SoundOn 服務，若對方故障會無法播放。
  - 仍需 Workflow 在背景維護節目清單。

## 方案 C：前端直接抓取 RSS，動態合併顯示

- **流程**：Next.js Server Component（例如 `app/page.tsx`）在渲染時直接 fetch SoundOn RSS → 解析最新幾集 → 與 KV 中的 Hacker News 內容合併排序 → 顯示。
- **優點**：
  - 無需新增 Workflow，也不必儲存任何額外資料。
  - 資訊最新，重新 validate 即可取得 SoundOn 最新節目。
- **缺點**：
  - 每次頁面 revalidate 都要打 SoundOn RSS，需注意頻率與第三方流量。
  - 若 SoundOn RSS/MP3 一時故障，頁面會少內容；沒有本地備份。
  - 播放與資料皆依賴外部來源，無法離線使用。
- **錯誤處理建議**：
  - `fetch` 失敗（網路錯誤 / timeout）時應捕捉例外，記錄 log，並回傳空陣列讓頁面正常渲染，同時顯示「SoundOn 資料暫時不可用」的提示。
  - 服務回傳 4xx/5xx 時檢查 `response.ok`，若為 false 則跳過解析，同樣回傳空陣列。
  - 可視需求將最後一次成功的 RSS 內容暫存於 KV 供離線 fallback，避免 SoundOn offline 時整段內容消失。

---

> 建議先視需求選擇方案：若要長期備份、可控播放，採 A；若只想快速整合並可接受外部播放，B 是折衷；若想最快呈現，又接受完全依賴 RSS，C 是最簡單的實作。
