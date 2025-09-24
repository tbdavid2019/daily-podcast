#!/bin/bash

# 從環境變數檔案重新設定 Cloudflare Workers secrets
# 用於更新已存在的環境變數配置

echo "🔄 從環境變數檔案重新設定 Cloudflare Workers secrets..."
echo ""

ENV_FILE=".env.production"
WORKER_ENV_FILE="worker/.env.production"

# 檢查檔案是否存在
if [[ ! -f "$WORKER_ENV_FILE" ]]; then
    echo "❌ 找不到 Worker 環境變數檔案: $WORKER_ENV_FILE"
    echo "請先執行 ./setup-env-vars.sh 建立環境變數檔案"
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ 找不到 Web 應用環境變數檔案: $ENV_FILE"
    echo "請先執行 ./setup-env-vars.sh 建立環境變數檔案"
    exit 1
fi

# 設定 Worker secrets
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

# 設定 Web 應用 secrets
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
echo "✅ 環境變數重新設定完成！"
