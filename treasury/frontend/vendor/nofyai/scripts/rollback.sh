#!/bin/bash
# ========================================
# NofyAI 回滚脚本
# ========================================
# 用途：回滚到之前的备份版本
# 使用：./scripts/rollback.sh

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKUP_DIR="./backups"

echo -e "${BLUE}"
echo "========================================="
echo "  NofyAI 回滚脚本"
echo "========================================="
echo -e "${NC}"

# 检查备份目录
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}❌ 备份目录不存在: $BACKUP_DIR${NC}"
    exit 1
fi

# 列出可用的备份
echo -e "${YELLOW}📦 可用的备份版本:${NC}\n"

BACKUPS=($(ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -10))

if [ ${#BACKUPS[@]} -eq 0 ]; then
    echo -e "${RED}❌ 没有可用的备份${NC}"
    exit 1
fi

# 显示备份列表
for i in "${!BACKUPS[@]}"; do
    BACKUP_FILE="${BACKUPS[$i]}"
    BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    BACKUP_TIME=$(echo "$BACKUP_NAME" | sed 's/backup_//' | sed 's/_/ /')

    # 查找对应的 commit
    COMMIT_FILE="$BACKUP_DIR/${BACKUP_NAME}.commit"
    if [ -f "$COMMIT_FILE" ]; then
        COMMIT=$(cat "$COMMIT_FILE" | head -c 7)
        COMMIT_INFO=" (commit: $COMMIT)"
    else
        COMMIT_INFO=""
    fi

    echo -e "${GREEN}[$((i+1))]${NC} $BACKUP_TIME - ${BACKUP_SIZE}${COMMIT_INFO}"
done

echo ""

# 选择备份版本
read -p "请选择要回滚的版本 [1-${#BACKUPS[@]}] (按 Ctrl+C 取消): " CHOICE

if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "${#BACKUPS[@]}" ]; then
    echo -e "${RED}❌ 无效的选择${NC}"
    exit 1
fi

SELECTED_BACKUP="${BACKUPS[$((CHOICE-1))]}"
SELECTED_NAME=$(basename "$SELECTED_BACKUP" .tar.gz)
COMMIT_FILE="$BACKUP_DIR/${SELECTED_NAME}.commit"

echo -e "\n${YELLOW}⚠️  即将回滚到: $SELECTED_NAME${NC}"
if [ -f "$COMMIT_FILE" ]; then
    SELECTED_COMMIT=$(cat "$COMMIT_FILE")
    echo -e "Git commit: ${SELECTED_COMMIT:0:7}"
fi
echo ""

read -p "确认回滚？(yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}已取消回滚${NC}"
    exit 0
fi

# ========================================
# 执行回滚
# ========================================
echo -e "\n${YELLOW}🔄 开始回滚...${NC}"

# Step 1: 停止当前容器
echo "停止当前容器..."
docker compose down
echo -e "${GREEN}✅ 容器已停止${NC}"

# Step 2: 恢复代码（如果是 Git 仓库）
if [ -f "$COMMIT_FILE" ] && [ -d ".git" ]; then
    SELECTED_COMMIT=$(cat "$COMMIT_FILE")
    echo "恢复代码到 commit: ${SELECTED_COMMIT:0:7}..."
    git reset --hard "$SELECTED_COMMIT"
    echo -e "${GREEN}✅ 代码已恢复${NC}"
fi

# Step 3: 恢复配置文件和决策日志
echo "恢复配置文件和决策日志..."
tar -xzf "$SELECTED_BACKUP"
echo -e "${GREEN}✅ 文件已恢复${NC}"

# Step 4: 重新构建并启动
echo -e "\n${YELLOW}🔨 重新构建并启动...${NC}"
docker compose up -d --build

# Step 5: 健康检查
echo -e "\n${YELLOW}🏥 健康检查...${NC}"
sleep 10

RETRY_COUNT=0
MAX_RETRIES=20

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过！${NC}"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -n "."
        sleep 3
    fi
done

echo ""

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ 健康检查失败！${NC}"
    echo "请检查日志: docker compose logs -f"
    exit 1
fi

# ========================================
# 回滚成功
# ========================================
echo -e "\n${BLUE}=========================================${NC}"
echo -e "${GREEN}🎉 回滚成功！${NC}"
echo -e "${BLUE}=========================================${NC}"

echo -e "\n📊 容器状态:"
docker compose ps

echo -e "\n📝 最近日志:"
docker compose logs --tail=20

echo -e "\n${GREEN}✨ 已回滚到: $SELECTED_NAME${NC}"
