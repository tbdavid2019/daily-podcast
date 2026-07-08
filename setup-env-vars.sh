#!/bin/bash

# Cloudflare Workers 環境變數設定腳本 (明文版本)
# 將環境變數寫入本地文件，然後設定到 Cloudflare

echo "🔐 開始設定 Cloudflare Workers 環境變數..."
echo "請按照提示輸入各項配置值 (值會儲存在本地檔案中)"
echo ""

# 建立環境變數檔案
ENV_FILE=".env.production"
WORKER_ENV_FILE="worker/.env.production"

echo "# 生產環境變數配置" > $ENV_FILE
echo "# Worker 環境變數配置" > $WORKER_ENV_FILE

# Worker 應用環境變數設定
echo "📡 設定 Worker 應用環境變數..."
echo ""

echo "1. 設定 OpenAI API Key (必需)"
echo "   請在 https://platform.openai.com/ 獲取您的 API Key"
read -p "   輸入您的 OpenAI API Key: " openai_key
echo "OPENAI_API_KEY=\"$openai_key\"" >> $WORKER_ENV_FILE

echo ""
echo "2. 設定 OpenAI 基礎 URL"
echo "   通常為: https://api.openai.com/v1"
read -p "   輸入 OpenAI 基礎 URL [https://api.openai.com/v1]: " openai_base
openai_base=${openai_base:-"https://api.openai.com/v1"}
echo "OPENAI_BASE_URL=\"$openai_base\"" >> $WORKER_ENV_FILE

echo ""
echo "3. 設定 OpenAI 模型"
echo "   建議使用: gpt-4o-mini (性價比高)"
read -p "   輸入 OpenAI 模型 [gpt-4o-mini]: " openai_model
openai_model=${openai_model:-"gpt-4o-mini"}
echo "OPENAI_MODEL=\"$openai_model\"" >> $WORKER_ENV_FILE

echo ""
echo "4. 設定工作環境"
echo "   輸入: production"
echo "WORKER_ENV=\"production\"" >> $WORKER_ENV_FILE

echo ""
echo "5. 設定 Worker URL (稍後部署後會知道確切的 URL)"
echo "   暫時可以輸入: https://placeholder.workers.dev"
read -p "   輸入 Worker URL [https://placeholder.workers.dev]: " worker_url
worker_url=${worker_url:-"https://placeholder.workers.dev"}
echo "HACKER_NEWS_WORKER_URL=\"$worker_url\"" >> $WORKER_ENV_FILE

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
    read -p "   請輸入您的 R2 URL: " r2_url
    echo "HACKER_NEWS_R2_BUCKET_URL=\"$r2_url\"" >> $WORKER_ENV_FILE
else
    echo "   暫時設定為佔位符，稍後需要更新"
    echo "HACKER_NEWS_R2_BUCKET_URL=\"https://placeholder.r2.dev\"" >> $WORKER_ENV_FILE
fi

# Web 應用環境變數設定
echo ""
echo "🌐 設定 Web 應用環境變數..."
echo ""

echo "7. 設定 Next.js 環境"
echo "   輸入: production"
echo "NEXTJS_ENV=\"production\"" >> $ENV_FILE

echo ""
echo "8. 設定公開基礎 URL (稍後部署後更新)"
echo "   暫時可以輸入: https://placeholder.workers.dev"
read -p "   輸入公開基礎 URL [https://placeholder.workers.dev]: " base_url
base_url=${base_url:-"https://placeholder.workers.dev"}
echo "NEXT_PUBLIC_BASE_URL=\"$base_url\"" >> $ENV_FILE

echo ""
echo "9. 設定靜態資源主機 (與 R2 URL 相同)"
echo "   暫時可以輸入: https://placeholder.r2.dev"
read -p "   輸入靜態資源主機 [https://placeholder.r2.dev]: " static_host
static_host=${static_host:-"https://placeholder.r2.dev"}
echo "NEXT_STATIC_HOST=\"$static_host\"" >> $ENV_FILE

# 可選環境變數
echo ""
echo "🔧 設定可選環境變數 (可以提高系統穩定性)..."
echo ""

read -p "是否要設定 Jina AI API Key？(y/N): " setup_jina
if [[ $setup_jina =~ ^[Yy]$ ]]; then
    echo "在 https://jina.ai/ 獲取 API Key"
    read -p "   輸入 Jina AI API Key: " jina_key
    echo "JINA_KEY=\"$jina_key\"" >> $WORKER_ENV_FILE
fi

read -p "是否要設定 Firecrawl API Key？(y/N): " setup_firecrawl
if [[ $setup_firecrawl =~ ^[Yy]$ ]]; then
    echo "在 https://firecrawl.dev/ 獲取 API Key"
    read -p "   輸入 Firecrawl API Key: " firecrawl_key
    echo "FIRECRAWL_KEY=\"$firecrawl_key\"" >> $WORKER_ENV_FILE
fi

# 設定其他可選參數
echo ""
echo "設定其他 OpenAI 參數..."
read -p "輸入思考模型 (可選，預設 gpt-4o): " thinking_model
if [[ -n "$thinking_model" ]]; then
    echo "OPENAI_THINKING_MODEL=\"$thinking_model\"" >> $WORKER_ENV_FILE
fi

read -p "輸入最大 token 數 (可選，預設 4096): " max_tokens
max_tokens=${max_tokens:-"4096"}
echo "OPENAI_MAX_TOKENS=\"$max_tokens\"" >> $WORKER_ENV_FILE

echo ""
echo "📝 環境變數已寫入檔案："
echo "   - $ENV_FILE (Web 應用)"
echo "   - $WORKER_ENV_FILE (Worker 應用)"
echo ""

# 批量設定到 Cloudflare
echo "☁️  開始設定到 Cloudflare Workers..."

# 設定 Worker secrets (加密，推薦)
echo "設定 Worker 環境變數..."
while IFS='=' read -r key value; do
    # 跳過註釋和空行
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue

    # 移除引號
    value=$(echo $value | sed 's/^"//' | sed 's/"$//')

    echo "設定 $key..."
    echo "$value" | pnpx wrangler secret put --cwd worker "$key"
done < $WORKER_ENV_FILE

# 設定 Web 應用 secrets (加密，推薦)
echo "設定 Web 應用環境變數..."
while IFS='=' read -r key value; do
    # 跳過註釋和空行
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue

    # 移除引號
    value=$(echo $value | sed 's/^"//' | sed 's/"$//')

    echo "設定 $key..."
    echo "$value" | pnpx wrangler secret put "$key"
done < $ENV_FILE

echo ""
echo "✅ 環境變數設定完成！"
echo ""
echo "📋 接下來的步驟："
echo "1. 執行 'pnpm install' 安裝依賴"
echo "2. 執行 'pnpm run deploy:worker' 部署 Worker (⚠️ 重要：讓 KV/R2 binding 生效)"
echo "3. 執行 'pnpm run deploy' 部署 Web 應用 (⚠️ 重要：讓 KV/R2 binding 生效)"
echo "4. 記錄部署後的 URL 並更新相關環境變數"
echo ""
echo "🔍 檢查設定的環境變數："
echo "pnpx wrangler secret list --cwd worker"
echo "pnpx wrangler secret list"
echo ""
echo "💡 重要提示："
echo "   - 環境變數檔案已儲存在本地，方便日後維護和版本控制"
echo "   - ⚠️  secrets (環境變數) 和 binding (資源綁定) 是不同的！"
echo "   - binding 在 wrangler.jsonc 中配置，部署時才會生效"
echo "   - 如果 binding 沒有生效，請重新執行部署命令"
echo "   - `pnpm deploy` 在 pnpm@10 會被當成 workspace deploy 子命令，請使用 `pnpm run deploy`"
