#!/bin/bash

# Cloudflare Workers 一鍵部署腳本
# 使用前請確保已設定好所有必要的環境變數

set -e

echo "🚀 開始將 Hacker News Podcast 系統部署到 Cloudflare Workers..."
echo ""

# 檢查 Node.js 和 pnpm
if ! command -v node &> /dev/null; then
    echo "❌ 錯誤: Node.js 未安裝"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ 錯誤: pnpm 未安裝"
    exit 1
fi

echo "✅ Node.js 和 pnpm 已安裝"

# 安裝依賴
echo "📦 安裝專案依賴..."
pnpm install

# 檢查是否有必要的環境變數
echo "🔍 檢查環境變數..."

# 檢查 Worker 環境變數
echo "檢查 Worker 環境變數..."
if ! pnpx wrangler secret list --cwd worker | grep -q "OPENAI_API_SECRET"; then
    echo "⚠️  警告: OPENAI_API_SECRET 未設定，這是必需的 Cloudflare Secret"
    echo "請執行: pnpm exec wrangler secret put --cwd worker OPENAI_API_SECRET"
    echo ""
fi

# 部署 Worker 應用
echo "🔧 部署 Worker 應用 (後端處理)..."
pnpm run deploy:worker

if [ $? -eq 0 ]; then
    echo "✅ Worker 應用部署成功"
else
    echo "❌ Worker 應用部署失敗"
    exit 1
fi

echo ""

# 部署 Web 應用
echo "🌐 部署 Web 應用 (前端界面)..."
pnpm run deploy

if [ $? -eq 0 ]; then
    echo "✅ Web 應用部署成功"
else
    echo "❌ Web 應用部署失敗"
    exit 1
fi

echo ""
echo "🎉 部署完成！"
echo ""
echo "📋 接下來的步驟:"
echo "1. 檢查 Worker URL 是否可以存取"
echo "2. 檢查 Web 應用是否正常顯示"
echo "3. 測試手動觸發工作流程"
echo "4. 等待定時任務在 00:30 UTC（台北時間 08:30）自動執行"
echo ""
echo "📖 詳細資訊請參閱：./CLOUDFLARE-DEPLOY.md"
echo ""

# 顯示部署 URL（如果能取得）
echo "🔗 請記錄部署 URL，供後續設定與測試使用"
