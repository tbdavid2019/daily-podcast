#!/bin/bash

# Cloudflare Workers 環境變數設定腳本
# 執行此腳本來逐步設定所有必需的環境變數

echo "🔐 開始設定 Cloudflare Workers 環境變數..."
echo "請按照提示輸入各項配置值"
echo ""

# Worker 應用環境變數設定
echo "📡 設定 Worker 應用環境變數..."
echo ""

echo "1. 設定 OpenAI API Key (必需)"
echo "   請在 https://platform.openai.com/ 獲取您的 API Key"
pnpx wrangler secret put --cwd worker OPENAI_API_KEY

echo ""
echo "2. 設定 OpenAI 基礎 URL"
echo "   通常為: https://api.openai.com/v1"
pnpx wrangler secret put --cwd worker OPENAI_BASE_URL

echo ""
echo "3. 設定 OpenAI 模型"
echo "   建議使用: gpt-4o-mini (性價比高) 或 gpt-4o (效果更好)"
pnpx wrangler secret put --cwd worker OPENAI_MODEL

echo ""
echo "4. 設定工作環境"
echo "   輸入: production"
pnpx wrangler secret put --cwd worker WORKER_ENV

echo ""
echo "5. 設定 Worker URL (稍後部署後會知道確切的 URL)"
echo "   暫時可以輸入: https://placeholder.workers.dev"
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL

echo ""
echo "6. 設定 R2 存儲桶 URL"
echo "   ⚠️  需要先到 Cloudflare Dashboard 設定："
echo "   1. 進入 R2 Object Storage"
echo "   2. 選擇 'hacker-news' 存儲桶"
echo "   3. 啟用 'Public Access' -> 'Allow Access'"
echo "   4. 選擇 'R2.dev subdomain'"
echo "   5. 複製獲得的 URL (如: https://pub-xxxxx.r2.dev)"
echo ""
read -p "   是否已經設定完 R2 公開 URL？(y/N): " r2_ready
if [[ $r2_ready =~ ^[Yy]$ ]]; then
    echo "   請輸入您的 R2 URL:"
    pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL
else
    echo "   暫時設定為佔位符，稍後需要更新"
    echo "https://placeholder.r2.dev" | pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL
fi

# Web 應用環境變數設定
echo ""
echo "🌐 設定 Web 應用環境變數..."
echo ""

echo "7. 設定 Next.js 環境"
echo "   輸入: production"
pnpx wrangler secret put NEXTJS_ENV

echo ""
echo "8. 設定公開基礎 URL (稍後部署後更新)"
echo "   暫時可以輸入: https://placeholder.workers.dev"
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL

echo ""
echo "9. 設定靜態資源主機 (與 R2 URL 相同)"
echo "   暫時可以輸入: https://placeholder.r2.dev"
pnpx wrangler secret put NEXT_STATIC_HOST

# 可選環境變數
echo ""
echo "🔧 設定可選環境變數 (可以提高系統穩定性)..."
echo ""

read -p "是否要設定 Jina AI API Key？(y/N): " setup_jina
if [[ $setup_jina =~ ^[Yy]$ ]]; then
    echo "在 https://jina.ai/ 獲取 API Key"
    pnpx wrangler secret put --cwd worker JINA_KEY
fi

read -p "是否要設定 Firecrawl API Key？(y/N): " setup_firecrawl
if [[ $setup_firecrawl =~ ^[Yy]$ ]]; then
    echo "在 https://firecrawl.dev/ 獲取 API Key"
    pnpx wrangler secret put --cwd worker FIRECRAWL_KEY
fi

# 設定其他可選參數
echo ""
echo "設定其他 OpenAI 參數..."
pnpx wrangler secret put --cwd worker OPENAI_THINKING_MODEL
echo "建議輸入: gpt-4o (用於複雜思考任務)"

pnpx wrangler secret put --cwd worker OPENAI_MAX_TOKENS
echo "建議輸入: 4096"

echo ""
echo "✅ 環境變數設定完成！"
echo ""
echo "📋 接下來的步驟："
echo "1. 執行 'pnpm install' 安裝依賴"
echo "2. 執行 'pnpm deploy:worker' 部署 Worker"
echo "3. 執行 'pnpm deploy' 部署 Web 應用"
echo "4. 記錄部署後的 URL 並更新相關環境變數"
echo ""
echo "🔍 檢查設定的環境變數："
echo "pnpx wrangler secret list --cwd worker"
echo "pnpx wrangler secret list"