#!/bin/bash
# ========================================
# NofyAI 快速部署脚本
# ========================================
# 用途：一键部署 NofyAI 到服务器
# 使用：./scripts/deploy.sh

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "========================================="
echo "  NofyAI Docker 快速部署脚本"
echo "========================================="
echo -e "${NC}"

# 1. 检查 Docker 和 Docker Compose
echo -e "${YELLOW}🔍 检查环境...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装！请先安装 Docker${NC}"
    echo "安装文档: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose 未安装！请先安装 Docker Compose${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker 已安装: $(docker --version)${NC}"
echo -e "${GREEN}✅ Docker Compose 已安装: $(docker compose version)${NC}"

# 2. 检查配置文件
echo -e "\n${YELLOW}📝 检查配置文件...${NC}"

if [ ! -f "config.json" ]; then
    if [ -f "config.json.example" ]; then
        echo -e "${YELLOW}⚠️  config.json 不存在，从示例复制...${NC}"
        cp config.json.example config.json
        echo -e "${RED}⚠️  请先编辑 config.json 填入你的 API 密钥和凭证！${NC}"
        echo "编辑完成后重新运行此脚本"
        exit 1
    else
        echo -e "${RED}❌ config.json 和 config.json.example 都不存在！${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ config.json 存在${NC}"

# 验证 JSON 格式
if command -v jq &> /dev/null; then
    if ! jq empty config.json 2>/dev/null; then
        echo -e "${RED}❌ config.json 格式错误！${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ config.json 格式正确${NC}"
fi

# 3. 创建必要的目录
echo -e "\n${YELLOW}📁 创建数据目录...${NC}"
mkdir -p decision_logs
mkdir -p data
chmod 755 decision_logs data
echo -e "${GREEN}✅ 数据目录已创建${NC}"

# 4. 停止旧容器（如果存在）
if docker ps -a | grep -q nofyai; then
    echo -e "\n${YELLOW}🛑 停止旧容器...${NC}"
    docker compose down
    echo -e "${GREEN}✅ 旧容器已停止${NC}"
fi

# 5. 构建镜像
echo -e "\n${YELLOW}🔨 构建 Docker 镜像...${NC}"
echo "这可能需要几分钟..."

if docker compose build; then
    echo -e "${GREEN}✅ 镜像构建成功${NC}"
else
    echo -e "${RED}❌ 镜像构建失败！${NC}"
    exit 1
fi

# 6. 启动容器
echo -e "\n${YELLOW}🚀 启动容器...${NC}"

if docker compose up -d; then
    echo -e "${GREEN}✅ 容器已启动${NC}"
else
    echo -e "${RED}❌ 容器启动失败！${NC}"
    exit 1
fi

# 7. 等待容器就绪
echo -e "\n${YELLOW}⏳ 等待容器就绪...${NC}"
sleep 10

# 8. 健康检查
echo -e "\n${YELLOW}🏥 健康检查...${NC}"

MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过！${NC}"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "尝试 $RETRY_COUNT/$MAX_RETRIES..."
        sleep 3
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}⚠️  健康检查失败，但容器可能正在启动中${NC}"
    echo "请稍后运行以下命令检查状态："
    echo "  docker compose logs -f"
fi

# 9. 显示状态
echo -e "\n${BLUE}=========================================${NC}"
echo -e "${GREEN}🎉 部署完成！${NC}"
echo -e "${BLUE}=========================================${NC}"

echo -e "\n📊 容器状态:"
docker compose ps

echo -e "\n🌐 访问地址:"
echo "  本地: http://localhost:3000"
if command -v hostname &> /dev/null; then
    HOSTNAME=$(hostname -I | awk '{print $1}')
    if [ ! -z "$HOSTNAME" ]; then
        echo "  远程: http://$HOSTNAME:3000"
    fi
fi

echo -e "\n📝 常用命令:"
echo "  查看日志:     docker compose logs -f"
echo "  停止服务:     docker compose stop"
echo "  重启服务:     docker compose restart"
echo "  查看状态:     docker compose ps"
echo "  进入容器:     docker compose exec nofyai sh"

echo -e "\n📚 完整文档:"
echo "  docs/DEPLOYMENT.md"

echo -e "\n${GREEN}✨ 祝交易愉快！${NC}"
