# 🚀 NofyAI Docker 部署指南

## 📋 目录

- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [详细步骤](#详细步骤)
- [配置说明](#配置说明)
- [常用命令](#常用命令)
- [故障排除](#故障排除)
- [生产环境建议](#生产环境建议)

---

## 前置要求

### 1. 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 1核 | 2核+ |
| 内存 | 1GB | 2GB+ |
| 磁盘 | 10GB | 20GB+ |
| 操作系统 | CentOS 7+ / RHEL 7+ | CentOS 8 Stream / Rocky Linux 9 |
| 网络 | 可访问外网（AI API、交易所API） | 稳定网络 |

### 2. 软件要求

- **Docker**: >= 20.10
- **Docker Compose**: >= 2.0

### 3. 安装 Docker 和 Docker Compose

#### CentOS/RHEL

```bash
# 安装依赖
sudo yum install -y yum-utils

# 添加 Docker 仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
docker compose version
```

#### 添加当前用户到 docker 组（可选）

```bash
# 添加用户到 docker 组
sudo usermod -aG docker $USER

# 重新登录或运行以下命令使更改生效
newgrp docker

# 验证（不需要 sudo）
docker ps
```

---

## 快速开始

### 1. 克隆或上传项目到服务器

```bash
# 方式一：使用 git 克隆
git clone <your-repo-url> nofyai
cd nofyai

# 方式二：使用 scp 上传
# 在本地执行：
# scp -r /path/to/nofyai user@server:/path/to/

cd nofyai
```

### 2. 配置项目

```bash
# 复制配置示例文件
cp config.json.example config.json

# 编辑配置（填入你的 API 密钥和凭证）
nano config.json
# 或使用 vim
vim config.json
```

**必须配置的字段**：
- `traders[].enabled`: 设置为 `true` 启用交易员
- `traders[].aster_user`: Aster DEX 用户地址
- `traders[].aster_signer`: Aster DEX 签名地址
- `traders[].aster_private_key`: Aster DEX 私钥
- `traders[].deepseek_api_key`: DeepSeek API 密钥（如果使用 DeepSeek）
- `traders[].qwen_api_key`: 千问 API 密钥（如果使用 Qwen）
- `traders[].initial_balance`: 初始余额（与交易所实际余额一致）

### 3. 构建并启动服务

```bash
# 构建镜像并启动容器（首次启动或代码更新后）
docker compose up -d --build

# 查看容器状态
docker compose ps

# 查看实时日志
docker compose logs -f
```

### 4. 验证部署

```bash
# 检查健康状态
curl http://localhost:3000/api/health

# 应该返回：
# {"status":"ok","timestamp":"2025-11-10T...","uptime":12.345,"environment":"production"}

# 访问前端
# 在浏览器打开: http://服务器IP:3000
```

---

## 详细步骤

### Step 1: 准备项目文件

#### 1.1 上传代码到服务器

```bash
# 使用 git（推荐）
cd /opt  # 或其他目录
git clone <your-repo-url> nofyai
cd nofyai

# 或使用 scp（从本地上传）
# 在本地执行：
tar -czf nofyai.tar.gz nofyai/
scp nofyai.tar.gz user@server:/opt/
# 在服务器上：
cd /opt
tar -xzf nofyai.tar.gz
cd nofyai
```

#### 1.2 验证文件结构

```bash
ls -la

# 应该看到：
# - Dockerfile
# - docker-compose.yml
# - .dockerignore
# - config.json.example
# - package.json
# - app/
# - lib/
# - components/
# - ...
```

### Step 2: 配置环境

#### 2.1 创建配置文件

```bash
# 复制示例配置
cp config.json.example config.json

# 编辑配置
nano config.json
```

**config.json 示例**：

```json
{
  "traders": [
    {
      "id": "aster_deepseek",
      "name": "Aster DeepSeek Trader",
      "enabled": true,
      "ai_model": "deepseek",
      "exchange": "aster",

      "aster_user": "0x你的用户地址",
      "aster_signer": "0x你的API钱包地址",
      "aster_private_key": "你的私钥",

      "deepseek_api_key": "sk-你的DeepSeek密钥",

      "initial_balance": 98.6,
      "scan_interval_minutes": 3
    }
  ],
  "leverage": {
    "btc_eth_leverage": 5,
    "altcoin_leverage": 5
  },
  "coins": {
    "btc": ["BTCUSDT"],
    "eth": ["ETHUSDT"],
    "major": ["BNBUSDT", "SOLUSDT", "ADAUSDT"],
    "minor": ["DOGEUSDT", "XRPUSDT"]
  }
}
```

#### 2.2 创建数据目录

```bash
# 创建持久化数据目录
mkdir -p decision_logs
mkdir -p data

# 设置权限（确保容器可以写入）
chmod 755 decision_logs data
```

#### 2.3 配置代理（可选）

如果服务器需要代理访问 Binance API：

```bash
# 创建 .env.local
cat > .env.local << EOF
NODE_ENV=production

# HTTP代理配置（如果需要）
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
EOF
```

然后取消 `docker-compose.yml` 中 `.env.local` 的注释：

```yaml
volumes:
  - ./.env.local:/app/.env.local:ro  # 取消注释这行
```

### Step 3: 构建镜像

```bash
# 构建 Docker 镜像
docker compose build

# 查看构建的镜像
docker images | grep nofyai
```

**构建过程说明**：
1. **Stage 1 (deps)**: 安装生产依赖
2. **Stage 2 (builder)**: 构建 Next.js 应用
3. **Stage 3 (runner)**: 创建最小化运行镜像

**预计时间**：首次构建约 5-10 分钟（取决于网络速度）

### Step 4: 启动服务

```bash
# 启动容器（后台运行）
docker compose up -d

# 查看容器状态
docker compose ps

# 应该看到：
# NAME     IMAGE         STATUS         PORTS
# nofyai   nofyai:latest Up 10 seconds  0.0.0.0:3000->3000/tcp
```

### Step 5: 验证部署

#### 5.1 检查容器健康状态

```bash
# 查看健康检查状态
docker inspect nofyai | grep -A 5 Health

# 或使用 docker compose
docker compose ps
# Status 列应该显示 "healthy"
```

#### 5.2 查看应用日志

```bash
# 查看所有日志
docker compose logs

# 实时跟踪日志
docker compose logs -f

# 只看最近100行
docker compose logs --tail=100

# 查看特定时间的日志
docker compose logs --since 10m  # 最近10分钟
```

#### 5.3 测试 API 端点

```bash
# 健康检查
curl http://localhost:3000/api/health

# 获取配置信息（API密钥会被掩码）
curl http://localhost:3000/api/config

# 获取交易员列表
curl http://localhost:3000/api/traders

# 启动交易员
curl -X POST http://localhost:3000/api/trade/start?trader_id=aster_deepseek
```

#### 5.4 访问 Web 界面

在浏览器打开：`http://服务器IP:3000`

**首次访问检查列表**：
- ✅ 页面正常加载
- ✅ 可以看到交易员列表
- ✅ 可以查看交易员详情
- ✅ Performance Metrics 显示正常

---

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 是否必须 |
|--------|------|--------|---------|
| `NODE_ENV` | 运行环境 | `production` | 是 |
| `PORT` | 应用端口 | `3000` | 否 |
| `TZ` | 时区 | `Asia/Shanghai` | 否 |
| `HTTP_PROXY` | HTTP 代理 | - | 否 |
| `HTTPS_PROXY` | HTTPS 代理 | - | 否 |

### 端口映射

默认映射：`3000:3000`

如果需要修改宿主机端口（例如改为 8080）：

```yaml
# docker-compose.yml
ports:
  - "8080:3000"  # 修改这里
```

### 数据卷挂载

| 容器路径 | 宿主机路径 | 说明 | 是否必须 |
|---------|-----------|------|---------|
| `/app/config.json` | `./config.json` | 配置文件 | ✅ 必须 |
| `/app/decision_logs` | `./decision_logs` | 决策日志 | ✅ 必须 |
| `/app/data` | `./data` | 数据存储 | ⚠️ 推荐 |
| `/app/.env.local` | `./.env.local` | 环境变量 | ❌ 可选 |

### 资源限制（可选）

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  nofyai:
    # ... 其他配置 ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

---

## 常用命令

### 容器管理

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose stop

# 重启服务
docker compose restart

# 停止并删除容器
docker compose down

# 停止并删除容器及卷（⚠️ 会删除数据）
docker compose down -v

# 查看容器状态
docker compose ps

# 查看容器详细信息
docker inspect nofyai
```

### 日志管理

```bash
# 查看所有日志
docker compose logs

# 实时跟踪日志
docker compose logs -f

# 查看最近N行日志
docker compose logs --tail=100

# 查看特定时间范围的日志
docker compose logs --since 1h
docker compose logs --since 2025-11-10T10:00:00

# 导出日志到文件
docker compose logs > nofyai-logs.txt
```

### 镜像管理

```bash
# 重新构建镜像
docker compose build

# 强制重新构建（不使用缓存）
docker compose build --no-cache

# 查看镜像
docker images | grep nofyai

# 删除旧镜像
docker image prune -a
```

### 进入容器调试

```bash
# 进入容器 shell
docker compose exec nofyai sh

# 在容器中执行命令
docker compose exec nofyai ls -la /app
docker compose exec nofyai cat /app/config.json

# 查看容器内进程
docker compose exec nofyai ps aux

# 查看容器资源使用
docker stats nofyai
```

### 更新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker compose up -d --build

# 3. 查看新容器状态
docker compose ps
docker compose logs -f
```

### 备份和恢复

```bash
# 备份决策日志
tar -czf decision_logs_backup_$(date +%Y%m%d).tar.gz decision_logs/

# 备份配置文件
cp config.json config.json.backup_$(date +%Y%m%d)

# 恢复备份
tar -xzf decision_logs_backup_20251110.tar.gz
```

---

## 故障排除

### 问题 1: 容器启动失败

**症状**：`docker compose up -d` 后容器立即退出

**排查步骤**：

```bash
# 1. 查看容器状态
docker compose ps

# 2. 查看错误日志
docker compose logs

# 3. 检查配置文件
cat config.json | jq .  # 验证 JSON 格式

# 4. 尝试前台运行（查看详细错误）
docker compose up
```

**常见原因**：
- ❌ `config.json` 格式错误或缺失
- ❌ 端口 3000 被占用
- ❌ 磁盘空间不足
- ❌ Docker 版本过低

**解决方法**：
```bash
# 检查端口占用
sudo lsof -i :3000
# 或
sudo netstat -tunlp | grep 3000

# 修改端口（如果被占用）
# 编辑 docker-compose.yml: ports: - "8080:3000"

# 检查磁盘空间
df -h

# 清理 Docker 缓存
docker system prune -a
```

### 问题 2: 健康检查失败

**症状**：容器状态显示 "unhealthy"

**排查步骤**：

```bash
# 1. 查看健康检查日志
docker inspect nofyai | grep -A 20 Health

# 2. 手动测试健康端点
docker compose exec nofyai wget -O- http://localhost:3000/api/health

# 3. 检查应用日志
docker compose logs -f
```

**解决方法**：
- 增加健康检查启动延迟：修改 `docker-compose.yml` 中的 `start_period`
- 检查应用是否真正启动（查看日志）

### 问题 3: 无法访问 Web 界面

**症状**：浏览器访问 `http://IP:3000` 失败

**排查步骤**：

```bash
# 1. 确认容器运行
docker compose ps

# 2. 确认端口映射
docker port nofyai

# 3. 测试本地访问
curl http://localhost:3000/api/health

# 4. 检查防火墙
sudo firewall-cmd --list-ports
```

**解决方法**：

```bash
# 开放端口
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 云服务器还需要在安全组开放端口
# 在云控制台（阿里云/腾讯云/AWS）添加入站规则：TCP 3000
```

### 问题 4: API 请求失败（交易所/AI）

**症状**：日志显示网络请求超时或被拒绝

**排查步骤**：

```bash
# 1. 进入容器测试网络
docker compose exec nofyai sh

# 2. 测试 DNS 解析
nslookup api.deepseek.com
nslookup fapi.binance.com

# 3. 测试网络连通性
wget -O- https://api.deepseek.com --timeout=10
wget -O- https://fapi.binance.com/fapi/v1/ping --timeout=10

# 4. 查看代理配置
env | grep PROXY
```

**解决方法**：

如果无法直接访问（被墙）：

```bash
# 方式一：使用代理（需要服务器有代理服务）
# 1. 创建 .env.local
cat > .env.local << EOF
HTTP_PROXY=http://代理地址:端口
HTTPS_PROXY=http://代理地址:端口
EOF

# 2. 取消 docker-compose.yml 中代理挂载的注释
# 3. 重启容器
docker compose restart
```

```yaml
# 方式二：配置 Docker 代理
# 创建 /etc/docker/daemon.json
{
  "proxies": {
    "http-proxy": "http://代理地址:端口",
    "https-proxy": "http://代理地址:端口"
  }
}

# 重启 Docker
sudo systemctl restart docker
```

### 问题 5: 数据持久化失败

**症状**：重启容器后决策日志丢失

**排查步骤**：

```bash
# 1. 检查挂载点
docker inspect nofyai | grep -A 10 Mounts

# 2. 检查宿主机目录权限
ls -la decision_logs/

# 3. 检查容器内目录
docker compose exec nofyai ls -la /app/decision_logs/
```

**解决方法**：

```bash
# 确保目录存在
mkdir -p decision_logs data

# 修正权限
chmod 755 decision_logs data

# 如果使用 SELinux（CentOS）
chcon -Rt svirt_sandbox_file_t decision_logs/
chcon -Rt svirt_sandbox_file_t data/
```

### 问题 6: 内存不足

**症状**：容器频繁重启或 OOM

**排查步骤**：

```bash
# 查看容器资源使用
docker stats nofyai

# 查看系统内存
free -h

# 查看容器日志
docker compose logs | grep -i "memory\|oom"
```

**解决方法**：

```bash
# 方式一：增加服务器内存

# 方式二：限制容器内存使用
# 编辑 docker-compose.yml 添加：
deploy:
  resources:
    limits:
      memory: 1G

# 方式三：优化应用（减少扫描币种数量）
# 编辑 config.json 减少 coins 数量
```

---

## 生产环境建议

### 1. 安全加固

#### 1.1 使用专用用户运行

```bash
# 创建专用用户
sudo useradd -m -s /bin/bash nofyai
sudo usermod -aG docker nofyai

# 切换到专用用户
sudo su - nofyai

# 在专用用户下部署应用
cd /opt/nofyai
docker compose up -d
```

#### 1.2 限制文件权限

```bash
# 配置文件只读
chmod 600 config.json
chmod 600 .env.local  # 如果有

# 目录权限
chmod 755 decision_logs
chmod 755 data
```

#### 1.3 使用 Secrets（推荐）

对于敏感信息，使用 Docker Secrets：

```yaml
# docker-compose.yml
secrets:
  config:
    file: ./config.json

services:
  nofyai:
    secrets:
      - config
```

### 2. 监控和日志

#### 2.1 配置日志轮转

已在 `docker-compose.yml` 中配置：

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

#### 2.2 集成监控

```bash
# 方式一：使用 Prometheus + Grafana（推荐）
# 添加 cAdvisor 到 docker-compose.yml

# 方式二：使用云监控
# 阿里云 ARMS
# 腾讯云云监控
# AWS CloudWatch
```

#### 2.3 告警配置

```bash
# 脚本示例：检查容器健康并发送告警
#!/bin/bash
# /opt/scripts/check_nofyai.sh

CONTAINER_NAME="nofyai"
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_NAME 2>/dev/null)

if [ "$HEALTH" != "healthy" ]; then
    # 发送告警（邮件/Telegram/企业微信）
    echo "⚠️ NofyAI 容器异常: $HEALTH" | mail -s "NofyAI Alert" admin@example.com
fi

# 添加到 crontab
# */5 * * * * /opt/scripts/check_nofyai.sh
```

### 3. 备份策略

#### 3.1 自动备份脚本

```bash
#!/bin/bash
# /opt/scripts/backup_nofyai.sh

BACKUP_DIR="/backup/nofyai"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份配置
cp /opt/nofyai/config.json $BACKUP_DIR/config_$DATE.json

# 备份决策日志
tar -czf $BACKUP_DIR/decision_logs_$DATE.tar.gz -C /opt/nofyai decision_logs/

# 保留最近7天的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "config_*.json" -mtime +7 -delete

echo "✅ 备份完成: $DATE"
```

#### 3.2 定时备份

```bash
# 添加到 crontab
# 每天凌晨2点备份
0 2 * * * /opt/scripts/backup_nofyai.sh >> /var/log/nofyai_backup.log 2>&1
```

### 4. HTTPS 配置（使用 Caddy）

#### 4.1 安装 Caddy

```bash
# CentOS/RHEL
sudo yum install -y yum-plugin-copr
sudo yum copr enable @caddy/caddy -y
sudo yum install -y caddy

# 启动 Caddy
sudo systemctl enable caddy
sudo systemctl start caddy
```

#### 4.2 配置 Caddy

创建 Caddyfile 配置：

```bash
sudo nano /etc/caddy/Caddyfile
```

添加以下内容：

```
nofyai.example.com {
    reverse_proxy localhost:3000
}
```

**说明**：
- 将 `nofyai.example.com` 替换为你的域名
- Caddy 会自动申请和续期 Let's Encrypt 证书
- 自动处理 HTTP 到 HTTPS 的重定向
- 自动配置最佳实践的 TLS 设置

重启 Caddy：

```bash
sudo systemctl reload caddy
```

#### 4.3 配置域名 DNS

在域名服务商添加 A 记录：

```
类型: A
主机: nofyai (或 @)
值: 你的服务器IP
TTL: 600
```

#### 4.4 开放防火墙端口

```bash
# 开放 HTTP (80) 和 HTTPS (443)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

#### 4.5 验证 HTTPS

```bash
# 检查证书
curl -I https://nofyai.example.com

# 查看 Caddy 日志
sudo journalctl -u caddy -f
```

访问 `https://nofyai.example.com`，应该看到：
- ✅ 绿色锁标志
- ✅ 自动从 HTTP 跳转到 HTTPS
- ✅ 证书自动更新（无需手动操作）

### 5. 性能优化

#### 5.1 启用 Docker BuildKit

```bash
# 在构建时使用 BuildKit（更快）
DOCKER_BUILDKIT=1 docker compose build

# 或设置为默认
echo 'export DOCKER_BUILDKIT=1' >> ~/.bashrc
```

#### 5.2 使用多阶段构建缓存

已在 Dockerfile 中实现，无需额外配置。

### 6. 更新策略

#### 6.1 滚动更新（推荐）

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动（会先启动新容器再停止旧容器）
docker compose up -d --build

# 3. 验证新版本
curl http://localhost:3000/api/health
docker compose logs -f
```

---

## 附录

### A. 完整的 docker-compose.yml 示例

查看项目根目录的 `docker-compose.yml` 文件。

### B. 常用脚本

所有脚本可在 `/opt/scripts/` 目录下创建。

### C. 性能调优参数

根据服务器规格调整：

| 参数 | 小型服务器 (1核2G) | 中型服务器 (2核4G) | 大型服务器 (4核8G) |
|------|-------------------|-------------------|-------------------|
| `scan_interval_minutes` | 5 | 3 | 1 |
| `coins.minor` 数量 | 2-3 | 3-5 | 5+ |
| 内存限制 | 1G | 2G | 4G |

### D. 故障恢复流程

1. **容器崩溃** → 自动重启（`restart: unless-stopped`）
2. **数据损坏** → 从备份恢复
3. **配置错误** → 修改配置 → `docker compose restart`
4. **镜像问题** → 重新构建 → `docker compose up -d --build`

---

## 🆘 获取帮助

- **日志查看**: `docker compose logs -f`
- **健康检查**: `curl http://localhost:3000/api/health`
- **进入容器**: `docker compose exec nofyai sh`
- **查看配置**: `curl http://localhost:3000/api/config`

---

**部署成功后**，访问 `http://服务器IP:3000` 查看交易仪表盘！

🚀 祝交易愉快！
