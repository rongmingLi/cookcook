#!/bin/bash

# 模型切换脚本
# 当检测到 gemini-2.5-flash 的 429 错误时，自动切换到 gemini-3-flash-preview
cd /home/cookcook/

# 默认模型
CURRENT_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"
FALLBACK_MODEL="gemini-3-flash-preview"
LOG_DIR="logs"
MODEL_STATE_FILE=".model_state"

# 读取保存的模型状态
if [ -f "$MODEL_STATE_FILE" ]; then
  CURRENT_MODEL=$(cat "$MODEL_STATE_FILE")
fi

echo "🚀 当前使用模型: $CURRENT_MODEL"

# 运行主程序
export GEMINI_MODEL="$CURRENT_MODEL"
/root/.nvm/versions/node/v23.4.0/bin/node main.js "$@"
EXIT_CODE=$?

# 检查日志中是否有 429 错误且当前使用的是 2.5 flash
if [ $EXIT_CODE -ne 0 ] || [ "$CURRENT_MODEL" = "gemini-2.5-flash" ]; then
  # 查找最新的日志文件
  LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)
  
  if [ -n "$LATEST_LOG" ]; then
    # 检查是否有 429 错误且使用的是 2.5 flash
    if grep -q '"code":429' "$LATEST_LOG" && grep -q "gemini-2.5-flash" "$LATEST_LOG"; then
      echo ""
      echo "⚠️  检测到 gemini-2.5-flash 配额已用完 (429 错误)"
      echo "🔄 切换到备用模型: $FALLBACK_MODEL"
      echo "$FALLBACK_MODEL" > "$MODEL_STATE_FILE"
      
      # 使用新模型重新运行
      export GEMINI_MODEL="$FALLBACK_MODEL"
      echo "🚀 使用新模型重新运行..."
      /root/.nvm/versions/node/v23.4.0/bin/node main.js "$@"
      exit $?
    fi
  fi
fi

exit $EXIT_CODE

