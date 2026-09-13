#!/bin/bash
# ========================================
# NofyAI 健康检查脚本
# ========================================
# 用途：检查容器健康状态，异常时发送告警
# 使用：./scripts/check_health.sh
# Cron: */5 * * * * /path/to/scripts/check_health.sh

CONTAINER_NAME="nofyai"
LOG_FILE="/var/log/nofyai_health.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# 检查容器是否运行
if ! docker ps | grep -q $CONTAINER_NAME; then
    log "${RED}❌ 容器未运行！${NC}"
    # 这里可以添加告警逻辑（邮件/Telegram/企业微信）
    exit 1
fi

# 检查容器健康状态
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_NAME 2>/dev/null)

if [ "$HEALTH" = "healthy" ]; then
    log "${GREEN}✅ 容器健康${NC}"
    exit 0
elif [ "$HEALTH" = "starting" ]; then
    log "${YELLOW}⏳ 容器启动中...${NC}"
    exit 0
else
    log "${RED}⚠️  容器异常: $HEALTH${NC}"

    # 获取最近的错误日志
    log "最近的错误日志："
    docker logs --tail=20 $CONTAINER_NAME 2>&1 | tee -a $LOG_FILE

    # 这里可以添加告警逻辑
    # 例如：发送邮件、Telegram消息等

    exit 1
fi
