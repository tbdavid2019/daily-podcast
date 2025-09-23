#!/bin/bash
# 統一環境變數管理腳本

# 設定共用變數
export OPENAI_API_KEY="your_openai_key_here"
export JINA_KEY="your_jina_key_here"
export NEXT_STATIC_HOST="http://localhost:3000/static"

# 複製到對應位置
echo "NEXTJS_ENV=development" > .dev.vars
echo "NEXT_STATIC_HOST=$NEXT_STATIC_HOST" >> .dev.vars

echo "WORKER_ENV=development" > worker/.dev.vars
echo "HACKER_NEWS_WORKER_URL=http://localhost:8787" >> worker/.dev.vars
echo "HACKER_NEWS_R2_BUCKET_URL=https://your-bucket-url" >> worker/.dev.vars
echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> worker/.dev.vars
echo "OPENAI_BASE_URL=https://api.openai.com/v1" >> worker/.dev.vars
echo "OPENAI_MODEL=gpt-4o-mini" >> worker/.dev.vars
echo "JINA_KEY=$JINA_KEY" >> worker/.dev.vars

echo "✅ 環境變數設定完成！"