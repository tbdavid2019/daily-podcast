#!/bin/bash

# 設定明文環境變數到 wrangler.jsonc (不推薦 - 安全性低)
# 此腳本會將敏感資訊寫入設定檔，可能被意外提交到 Git

echo "⚠️  警告：此腳本會將敏感資訊以明文寫入 wrangler.jsonc"
echo "   這些檔案可能被意外提交到版本控制系統"
echo "   建議只在開發環境使用，或確保 .gitignore 正確設定"
echo ""

read -p "確定要繼續嗎？(y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

ENV_FILE=".env.production"
WORKER_ENV_FILE="worker/.env.production"

# 檢查檔案是否存在
if [[ ! -f "$WORKER_ENV_FILE" ]]; then
    echo "❌ 找不到 Worker 環境變數檔案: $WORKER_ENV_FILE"
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ 找不到 Web 應用環境變數檔案: $ENV_FILE"
    exit 1
fi

# 產生主要應用程式 vars
echo "產生主要應用程式 vars..."
VARS=""
while IFS='=' read -r key value; do
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    value=$(echo $value | sed 's/^"//' | sed 's/"$//')
    VARS="${VARS}    \"$key\": \"$value\",\n"
done < $ENV_FILE

# 更新主應用 wrangler.jsonc
if grep -q '"vars":' wrangler.jsonc; then
    # 如果已存在 vars，替換內容
    sed -i '' '/"vars": {/,/}/c\
  "vars": {\
'"$VARS"'  },' wrangler.jsonc
else
    # 新增 vars 欄位
    sed -i '' '/"keep_vars": true,/a\
  "vars": {\
'"$VARS"'  },' wrangler.jsonc
fi

# 產生 Worker vars
echo "產生 Worker vars..."
WORKER_VARS=""
while IFS='=' read -r key value; do
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    value=$(echo $value | sed 's/^"//' | sed 's/"$//')
    WORKER_VARS="${WORKER_VARS}    \"$key\": \"$value\",\n"
done < $WORKER_ENV_FILE

# 更新 Worker wrangler.jsonc
if grep -q '"vars":' worker/wrangler.jsonc; then
    sed -i '' '/"vars": {/,/}/c\
  "vars": {\
'"$WORKER_VARS"'  },' worker/wrangler.jsonc
else
    sed -i '' '/"keep_vars": true,/a\
  "vars": {\
'"$WORKER_VARS"'  },' worker/wrangler.jsonc
fi

echo "✅ 已設定為明文 vars"
echo "⚠️  記得檢查 .gitignore 確保 wrangler.jsonc 不被提交"
