#!/bin/bash
# ========================================
# NofyAI 生产环境更新脚本
# ========================================
# 用途：安全地更新线上服务（支持自动回滚）
# 使用：./scripts/update.sh

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
BACKUP_DIR="./backups"
MAX_BACKUPS=10  # 保留最近10次备份
HEALTH_CHECK_URL="http://localhost:3000/api/health"
HEALTH_CHECK_RETRIES=20
HEALTH_CHECK_INTERVAL=3

echo -e "${BLUE}"
echo "========================================="
echo "  NofyAI 生产环境更新脚本"
echo "========================================="
echo -e "${NC}"

# 检查是否在项目根目录
if [ ! -f "package.json" ] || [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 获取当前时间戳
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${TIMESTAMP}"

# ========================================
# Step 1: 备份当前版本
# ========================================
echo -e "\n${YELLOW}📦 Step 1/6: 备份当前版本...${NC}"

# 备份当前 Git commit
if git rev-parse HEAD > /dev/null 2>&1; then
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "$CURRENT_COMMIT" > "$BACKUP_DIR/${BACKUP_NAME}.commit"
    echo -e "${GREEN}✅ 当前 commit: ${CURRENT_COMMIT:0:7}${NC}"
else
    echo -e "${YELLOW}⚠️  警告: 不是 Git 仓库，无法记录 commit${NC}"
    CURRENT_COMMIT=""
fi

# 备份关键文件和目录
echo "备份配置文件和决策日志..."
tar -czf "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" \
    --exclude=node_modules \
    --exclude=.next \
    --exclude=backups \
    config.json decision_logs/ 2>/dev/null || true

if [ -f "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | cut -f1)
    echo -e "${GREEN}✅ 备份完成: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})${NC}"
else
    echo -e "${YELLOW}⚠️  备份部分完成（某些文件可能不存在）${NC}"
fi

# 清理旧备份（保留最近的 MAX_BACKUPS 个）
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    echo "清理旧备份..."
    ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
    ls -1t "$BACKUP_DIR"/*.commit | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
    echo -e "${GREEN}✅ 已清理旧备份（保留最近 ${MAX_BACKUPS} 个）${NC}"
fi

# ========================================
# Step 2: 拉取最新代码
# ========================================
echo -e "\n${YELLOW}⬇️  Step 2/6: 拉取最新代码...${NC}"

if [ -d ".git" ]; then
    # 保存本地修改（如果有）
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}⚠️  检测到本地修改，正在暂存...${NC}"
        git stash push -m "Auto stash before update at $TIMESTAMP"
        STASHED=true
    else
        STASHED=false
    fi

    # 拉取最新代码
    echo "从远程拉取最新代码..."
    if git pull; then
        NEW_COMMIT=$(git rev-parse HEAD)
        echo -e "${GREEN}✅ 代码已更新到: ${NEW_COMMIT:0:7}${NC}"

        # 显示更新内容
        if [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ] && [ -n "$CURRENT_COMMIT" ]; then
            echo -e "\n${BLUE}📝 更新内容:${NC}"
            git log --oneline --graph --decorate "${CURRENT_COMMIT}..${NEW_COMMIT}" | head -10
        else
            echo -e "${GREEN}✅ 已是最新版本${NC}"
        fi
    else
        echo -e "${RED}❌ 拉取失败！${NC}"
        if [ "$STASHED" = true ]; then
            git stash pop
        fi
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  非 Git 仓库，跳过代码拉取${NC}"
    echo "如需更新代码，请手动上传文件后运行此脚本"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# ========================================
# Step 3: 检查配置文件
# ========================================
echo -e "\n${YELLOW}📝 Step 3/6: 检查配置文件...${NC}"

if [ ! -f "config.json" ]; then
    echo -e "${RED}❌ config.json 不存在！${NC}"
    exit 1
fi

# 验证 JSON 格式
if command -v jq &> /dev/null; then
    if ! jq empty config.json 2>/dev/null; then
        echo -e "${RED}❌ config.json 格式错误！${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ config.json 格式正确${NC}"
else
    echo -e "${YELLOW}⚠️  jq 未安装，跳过 JSON 验证${NC}"
fi

# ========================================
# Step 4: 停止旧容器
# ========================================
echo -e "\n${YELLOW}🛑 Step 4/6: 停止旧容器...${NC}"

if docker compose ps | grep -q "nofyai"; then
    echo "停止现有容器..."
    docker compose down
    echo -e "${GREEN}✅ 旧容器已停止${NC}"
else
    echo -e "${YELLOW}⚠️  没有运行的容器${NC}"
fi

# ========================================
# Step 5: 构建并启动新容器
# ========================================
echo -e "\n${YELLOW}🔨 Step 5/6: 构建并启动新容器...${NC}"
echo "这可能需要几分钟，请耐心等待..."

# 构建镜像
if docker compose build --no-cache; then
    echo -e "${GREEN}✅ 镜像构建成功${NC}"
else
    echo -e "${RED}❌ 镜像构建失败！正在回滚...${NC}"
    rollback
    exit 1
fi

# 启动容器
if docker compose up -d; then
    echo -e "${GREEN}✅ 容器已启动${NC}"
else
    echo -e "${RED}❌ 容器启动失败！正在回滚...${NC}"
    rollback
    exit 1
fi

# ========================================
# Step 6: 健康检查
# ========================================
echo -e "\n${YELLOW}🏥 Step 6/6: 健康检查...${NC}"
echo "等待服务就绪（最多 ${HEALTH_CHECK_RETRIES} 次尝试）..."

RETRY_COUNT=0
HEALTH_OK=false

while [ $RETRY_COUNT -lt $HEALTH_CHECK_RETRIES ]; do
    if curl -sf "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过！${NC}"
        HEALTH_OK=true
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -n "."
        sleep $HEALTH_CHECK_INTERVAL
    fi
done

echo ""

if [ "$HEALTH_OK" = false ]; then
    echo -e "${RED}❌ 健康检查失败！正在回滚...${NC}"
    rollback
    exit 1
fi

# ========================================
# 回滚函数
# ========================================
rollback() {
    echo -e "\n${RED}🔄 开始回滚...${NC}"

    # 停止新容器
    docker compose down

    # 恢复代码
    if [ -n "$CURRENT_COMMIT" ] && [ -d ".git" ]; then
        echo "恢复代码到 commit: ${CURRENT_COMMIT:0:7}"
        git reset --hard "$CURRENT_COMMIT"
    fi

    # 恢复备份文件
    if [ -f "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" ]; then
        echo "恢复配置文件和决策日志..."
        tar -xzf "$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    fi

    # 重新启动旧版本
    echo "重新启动旧版本..."
    docker compose up -d --build

    echo -e "${YELLOW}⚠️  已回滚到更新前的版本${NC}"
}

# ========================================
# 更新成功
# ========================================
echo -e "\n${BLUE}=========================================${NC}"
echo -e "${GREEN}🎉 更新成功！${NC}"
echo -e "${BLUE}=========================================${NC}"

echo -e "\n📊 容器状态:"
docker compose ps

echo -e "\n📝 最近日志:"
docker compose logs --tail=30

echo -e "\n🌐 访问地址:"
echo "  本地: http://localhost:3000"
if command -v hostname &> /dev/null; then
    HOSTNAME=$(hostname -I | awk '{print $1}' 2>/dev/null)
    if [ ! -z "$HOSTNAME" ]; then
        echo "  远程: http://$HOSTNAME:3000"
    fi
fi

echo -e "\n💾 备份信息:"
echo "  备份文件: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
if [ -n "$CURRENT_COMMIT" ]; then
    echo "  原版本: ${CURRENT_COMMIT:0:7}"
    echo "  新版本: ${NEW_COMMIT:0:7}"
fi

echo -e "\n📚 常用命令:"
echo "  查看日志:     docker compose logs -f"
echo "  重启服务:     docker compose restart"
echo "  查看状态:     docker compose ps"
echo "  手动回滚:     ./scripts/rollback.sh"

echo -e "\n${GREEN}✨ 更新完成！${NC}"
