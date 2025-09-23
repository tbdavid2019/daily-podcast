#!/bin/bash
# 設定生產環境變數腳本
# 執行前請先填入正確的值

echo "🚀 設定 Worker 環境變數..."

# Worker 基本配置
pnpx wrangler secret put --cwd worker WORKER_ENV # 輸入: production
pnpx wrangler secret put --cwd worker HACKER_NEWS_WORKER_URL # 輸入: https://your-worker-domain.com
pnpx wrangler secret put --cwd worker HACKER_NEWS_R2_BUCKET_URL # 輸入: https://your-r2-domain.com

# OpenAI 配置
pnpx wrangler secret put --cwd worker OPENAI_API_KEY # 輸入你的 OpenAI API Key
pnpx wrangler secret put --cwd worker OPENAI_BASE_URL # 輸入: https://api.openai.com/v1
pnpx wrangler secret put --cwd worker OPENAI_MODEL # 輸入: gpt-4o-mini
pnpx wrangler secret put --cwd worker OPENAI_THINKING_MODEL # 輸入: gpt-4o
pnpx wrangler secret put --cwd worker OPENAI_MAX_TOKENS # 輸入: 4096

# 爬蟲服務 API Keys (可選，提高成功率)
pnpx wrangler secret put --cwd worker JINA_KEY # 輸入你的 Jina AI API Key
pnpx wrangler secret put --cwd worker FIRECRAWL_KEY # 輸入你的 Firecrawl API Key

echo "🌐 設定 Web 應用環境變數..."

# Web 應用配置
pnpx wrangler secret put NEXTJS_ENV # 輸入: production
pnpx wrangler secret put NEXT_PUBLIC_BASE_URL # 輸入: https://your-web-domain.com
pnpx wrangler secret put NEXT_STATIC_HOST # 輸入: https://your-r2-domain.com

echo "✅ 環境變數設定完成！"