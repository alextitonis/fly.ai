# NofyAI - AI 驱动的算法交易系统

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

一个基于 AI 的多智能体算法交易系统，支持 Aster DEX 交易所。

**Languages:** [English](README.md) | [中文](README_zh.md)

[功能特性](#功能特性) • [快速开始](#快速开始) • [系统架构](#系统架构) • [配置说明](#配置说明) • [API文档](#api文档)

</div>

---

## 📖 项目简介

**NofyAI** 是一个现代化的 AI 驱动算法交易系统，采用 Next.js 16 构建。系统支持多个 AI 模型（DeepSeek、Qwen、Kimi、自定义模型）在 Aster DEX 交易所进行自主交易，并通过可视化仪表盘实时监控性能表现。

> **交易所支持**：目前仅支持 **Aster DEX** 作为交易执行平台
> **市场数据源**：使用 **Binance API** 获取实时市场数据（K线、价格等）

---

## 🖼️ 效果展示

### Web 界面截图

<div align="center">
  <img src="images/image.png" alt="NofyAI 交易系统界面" width="100%">
  <p><em>实时监控多个 AI 交易员的表现，包括净值曲线、持仓信息和决策分析</em></p>
</div>

---

### ✨ 功能特性

#### 🏆 多交易员竞赛模式
- 支持多个 AI 模型同时运行，独立交易账户
- 实时排行榜对比不同 AI 模型的表现
- 独立的资金管理和风险控制

#### 📊 实时性能追踪
- 实时净值曲线图表（支持 1D/1W/1M/3M/All 时间范围）
- 盈亏分析与夏普比率计算
- 持仓监控与保证金使用率
- 自动调整的 Y 轴域计算，优化图表可读性

#### 🤖 AI 决策透明化
- 完整的思维链（Chain of Thought）推理过程
- 每笔交易决策的详细原因说明
- 决策执行结果追踪
- 管理员专属：查看系统提示词和输入提示词

#### 📈 深度性能分析
- 胜率与盈亏比统计
- 最大回撤分析
- 交易历史记录与样本分析
- 智能样本量评级（<10 笔显示"样本较少"警告）

#### 🎨 现代化 UI
- 响应式设计，支持移动端
- 借鉴 CoinMarketCap 的专业风格
- 实时数据自动刷新（SWR）
- 国际化支持（中文/英文）

#### 🔐 安全与管理
- 管理员认证系统（支持 bcrypt 密码哈希）
- 会话管理与自动过期（可配置超时时间）
- 敏感信息保护（API 密钥自动脱敏）
- 配置热重载 API（无需重启容器）

#### 📢 通知系统
- Telegram Bot 集成
- 交易通知（开仓/平仓）
- 风险警报（达到止损/回撤阈值）
- 系统状态通知

---

## 🚀 快速开始

### 方式一：Docker 部署（推荐生产环境）

最快 5 分钟部署到服务器（CentOS/RHEL）：

```bash
# 1. 安装 Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl start docker && sudo systemctl enable docker

# 2. 克隆项目
git clone https://github.com/your-username/nofyai.git
cd nofyai

# 3. 配置
cp config.json.example config.json
nano config.json  # 填入你的 API 密钥

# 4. 一键部署
./scripts/deploy.sh
```

访问 **http://服务器IP:3000** 查看仪表盘。

#### 配置 HTTPS（可选）

使用 Caddy 实现免费 HTTPS：

```bash
# 安装 Caddy
sudo yum install -y yum-plugin-copr
sudo yum copr enable @caddy/caddy -y
sudo yum install -y caddy

# 配置反向代理
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile  # 修改为你的域名

# 启动 Caddy
sudo systemctl enable caddy && sudo systemctl start caddy

# 开放端口
sudo firewall-cmd --permanent --add-service={http,https}
sudo firewall-cmd --reload
```

访问 **https://你的域名** - Caddy 会自动申请和续期 SSL 证书！

### 方式二：本地开发

前置要求：
- **Node.js** 18+ 和 npm
- Aster DEX 交易所账户
- AI API 密钥（DeepSeek / Qwen / Kimi / OpenAI 等）

安装步骤：

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/nofyai.git
cd nofyai

# 2. 安装依赖
npm install

# 3. 配置系统
cp config.json.example config.json
cp .env.local.example .env.local

# 编辑 config.json 填入你的 Aster 交易所和 AI API 凭证
# 编辑 .env.local 配置市场数据源和代理（可选）

# 4. 启动开发服务器
npm run dev
```

访问 **http://localhost:3000** 即可查看仪表盘。

### 生产环境部署（非 Docker）

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm start
```

---

## ⚙️ 配置说明

### 配置文件说明

| 文件 | 用途 | 是否必需 |
|------|------|---------|
| `config.json` | Trader 交易员配置（交易所凭证、AI 密钥、交易参数） | ✅ 必需 |
| `.env.local` | Next.js 环境配置（市场数据源、代理设置） | 可选 |

### 配置 Trader 交易员

编辑 `config.json` 文件：

```json
{
  "traders": [
    {
      "id": "aster_deepseek",
      "name": "Aster DeepSeek 交易员",
      "enabled": true,
      "ai_model": "deepseek",
      "exchange": "aster",  // 目前仅支持 "aster"

      // Aster 交易所配置
      "aster_user": "0x你的主钱包地址",
      "aster_signer": "0xAPI钱包地址",
      "aster_private_key": "API钱包私钥（不含0x前缀）",

      // AI 配置
      "deepseek_api_key": "sk-你的DeepSeek密钥",

      // 交易参数
      "initial_balance": 1000.0,
      "scan_interval_minutes": 3,

      // 提示词模板（可选）
      "prompt_template": "adaptive"  // adaptive/conservative/aggressive
    }
  ],

  // 全局杠杆设置
  "leverage": {
    "btc_eth_leverage": 5,
    "altcoin_leverage": 5
  },

  // 币种池配置
  "use_default_coins": true,
  "default_coins": [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"
  ],

  // 风险管理
  "max_daily_loss": 10.0,
  "max_drawdown": 20.0,
  "stop_trading_minutes": 60,

  // 市场数据配置
  "binance_region": "global",  // "global" 或 "us"（用于获取市场数据）

  // 管理员配置
  "admin": {
    "password": "$2b$10$...",  // bcrypt 哈希或明文（开发环境）
    "session_timeout_minutes": 60
  },

  // Telegram 通知（可选）
  "telegram": {
    "enabled": true,
    "bot_token": "your-bot-token",
    "chat_id": "your-chat-id"
  }
}
```

#### 生成管理员密码哈希

**方式一：在线工具**
访问 [bcrypt-generator.com](https://bcrypt-generator.com/)，输入密码生成哈希

**方式二：使用 Node.js**
```bash
# 安装 bcrypt
npm install bcrypt

# 生成哈希
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('your-password', 10, (e,h)=>console.log(h))"
```

**方式三：开发环境使用明文**
```json
{
  "admin": {
    "password": "admin123"  // 仅供开发环境！
  }
}
```

### 支持的 AI 模型

| AI 模型 | `ai_model` 值 | API 密钥字段 | 备注 |
|---------|--------------|-------------|------|
| DeepSeek | `"deepseek"` | `deepseek_api_key` | 性价比高，推理能力强 |
| Qwen（通义千问） | `"qwen"` | `qwen_api_key` | 阿里云模型，中文支持好 |
| Kimi（月之暗面） | `"kimi"` | `kimi_api_key`、`kimi_model_name` | Moonshot AI，长文本理解 |
| 自定义（OpenAI/本地） | `"custom"` | `custom_api_key`、`custom_api_url`、`custom_model_name` | 支持 OpenAI 兼容接口 |

### 支持的交易所

目前系统仅支持 **Aster DEX** 交易所。

| 交易所 | `exchange` 值 | 凭证字段 |
|--------|--------------|---------|
| Aster DEX | `"aster"` | `aster_user`、`aster_signer`、`aster_private_key` |

### 环境变量配置（可选）

编辑 `.env.local`：

```bash
# HTTP 代理配置（当某些 API 被墙时使用）
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890

# JWT 密钥（生产环境必须修改）
JWT_SECRET=your-super-secret-key-change-this-in-production
```

**代理说明**：
- 系统会自动检测代理配置
- 未配置代理时，自动使用直连
- 代理仅用于访问受限的 API
- 启动时会输出代理状态日志

### Binance 市场数据源配置

**说明**：系统使用 Binance API 获取市场数据（K线、价格等），不同地区需要使用不同的 API 端点。

**问题**：美国地区用户无法访问 `https://fapi.binance.com`

**解决方案**：在 `config.json` 中配置区域

```json
{
  "binance_region": "us"  // 使用 Binance US 端点
}
```

#### API 端点对比

| 配置值 | 基础 URL | 市场类型 | K线路径 | Ticker 路径 |
|--------|----------|---------|---------|-------------|
| `"global"` | `https://fapi.binance.com` | 合约 (Futures) | `/fapi/v1/klines` | `/fapi/v1/ticker/24hr` |
| `"us"` | `https://api.binance.us` | 现货 (Spot) | `/api/v3/klines` | `/api/v3/ticker/24hr` |

#### 功能差异

| 功能 | Global (Futures) | US (Spot) |
|------|-----------------|-----------|
| **K 线数据** | ✅ 支持 | ✅ 支持 |
| **24h Ticker** | ✅ 支持 | ✅ 支持 |
| **持仓量 (OI)** | ✅ 支持 | ❌ 不支持（现货无 OI） |
| **资金费率** | ✅ 支持 | ❌ 不支持（现货无资金费率） |

**重要提示**：
- US 端点使用**现货市场 API**，不支持合约特有功能
- 系统会自动处理功能差异（OI 和资金费率在 US 端点返回 0）
- 配置后会自动切换到对应的 API 路径
- 系统启动时会输出当前使用的端点和市场类型
- 美国用户必须配置 `"binance_region": "us"`

---

## 🔐 管理员功能

### 登录管理

点击右上角"登录"按钮，输入 `config.json` 中配置的管理员密码。

**管理员专属功能**：
- ⚙️ 查看系统提示词（决策详情中）
- 📊 查看完整配置（Config Viewer）
- 🔧 访问配置热重载 API

### 配置热重载（无需重启）

**使用场景**：
- 修改交易员参数（杠杆、扫描间隔等）
- 添加/删除交易员
- 修改风险管理参数

**方式一：使用更新脚本（推荐）**
```bash
# 在生产服务器上
./update-config.sh
```

**方式二：手动重启容器**
```bash
# 编辑 config.json
nano config.json

# 验证 JSON 格式
cat config.json | jq .

# 重启容器
docker compose restart nofyai
```

**方式三：使用热重载 API**
```bash
# 编辑 config.json 后调用
curl -X POST http://localhost:3000/api/config/reload
```

**注意**：热重载会停止所有运行中的交易员，需手动重新启动。

### 权限修复

如果遇到 `EACCES: permission denied` 错误：

```bash
# 使用权限修复脚本
chmod +x fix-permissions.sh
./fix-permissions.sh
```

---

## 🏗️ 系统架构

### 核心架构

**重要**：NofyAI 采用进程内架构，交易引擎直接运行在 Next.js 应用内部，无需独立的后端服务。

```mermaid
graph TB
    subgraph NextJS["Next.js 应用（单一进程）"]
        subgraph Frontend["前端层"]
            UI["前端 UI (React 19)<br/>• 竞赛排行榜<br/>• 交易员详情<br/>• 决策日志"]
        end

        subgraph APILayer["API 层"]
            API["Next.js API Routes<br/>/app/api/*<br/><small>直接调用 TraderManager</small>"]
        end

        subgraph CoreLogic["核心业务逻辑层"]
            TM["TraderManager<br/><small>全局单例</small><br/>管理多个 TradingEngine"]
            TE1["TradingEngine #1<br/>• AI 决策<br/>• 交易执行<br/>• 决策日志"]
            TE2["TradingEngine #2<br/>• AI 决策<br/>• 交易执行<br/>• 决策日志"]
            TE3["TradingEngine #N<br/>• AI 决策<br/>• 交易执行<br/>• 决策日志"]
        end
    end

    subgraph External["外部服务"]
        subgraph AIServices["AI 服务"]
            DeepSeek["DeepSeek API"]
            Qwen["Qwen API"]
            Kimi["Kimi API"]
            Custom["自定义 API"]
        end

        subgraph DataSources["数据与交易"]
            Binance["Binance API<br/><small>市场数据源</small><br/>K线、价格、成交量"]
            Aster["Aster DEX API<br/><small>交易执行</small><br/>开仓、平仓、查询持仓"]
        end
    end

    UI -->|"SWR 自动刷新"| API
    API -->|"直接方法调用"| TM
    TM -->|"管理"| TE1
    TM -->|"管理"| TE2
    TM -->|"管理"| TE3

    TE1 -->|"AI 决策"| AIServices
    TE2 -->|"AI 决策"| AIServices
    TE3 -->|"AI 决策"| AIServices

    TE1 -->|"获取市场数据"| Binance
    TE2 -->|"获取市场数据"| Binance
    TE3 -->|"获取市场数据"| Binance

    TE1 -->|"执行交易"| Aster
    TE2 -->|"执行交易"| Aster
    TE3 -->|"执行交易"| Aster

    style NextJS fill:#f0f7ff,stroke:#1e40af,stroke-width:3px
    style Frontend fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style APILayer fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style CoreLogic fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style External fill:#f0fdf4,stroke:#16a34a,stroke-width:2px
    style AIServices fill:#dcfce7,stroke:#22c55e,stroke-width:1px
    style DataSources fill:#dcfce7,stroke:#22c55e,stroke-width:1px
    style TM fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
```

### 关键设计特点

#### 1. 进程内架构（In-Process）
- **单一应用**：交易引擎与 Web 界面运行在同一进程
- **直接调用**：API Routes 直接调用 TraderManager 方法，无网络开销
- **热重载安全**：使用 `globalThis` 单例模式避免开发模式下的重复初始化

#### 2. 多交易员竞赛模式
- 每个 Trader 完全独立运行，互不干扰
- 独立的配置、资金、交易会话和决策日志
- 支持同时运行多个 AI 模型进行性能对比
- 可动态启动/停止任意交易员

#### 3. 决策日志系统
```
decision_logs/
├── aster_deepseek/
│   ├── 1.json      # 周期 1 的完整决策记录
│   ├── 2.json      # 周期 2 的完整决策记录
│   └── ...
└── aster_qwen/
    └── ...
```

**每个决策记录包含**：
- AI 思维链推理（Chain of Thought）
- 决策意图（买入/卖出/持有）+ 理由
- 执行前账户和持仓快照
- 执行结果（成功/失败详情）
- 候选币种和市场数据
- 完整的输入提示词（管理员可见）

---

## 📚 API 文档

### 核心端点

#### 获取竞赛数据
```http
GET /api/competition
```

**响应示例：**
```json
{
  "count": 2,
  "traders": [
    {
      "trader_id": "aster_deepseek",
      "trader_name": "Aster DeepSeek Trader",
      "ai_model": "deepseek",
      "total_equity": 1250.50,
      "total_pnl": 250.50,
      "total_pnl_pct": 25.05,
      "position_count": 3,
      "margin_used_pct": 45.2,
      "call_count": 120,
      "is_running": true
    }
  ]
}
```

#### 获取账户信息
```http
GET /api/account?trader_id={id}
```

**响应示例：**
```json
{
  "total_equity": 1250.50,
  "available_balance": 685.30,
  "total_pnl": 250.50,
  "total_pnl_pct": 25.05,
  "total_unrealized_pnl": 120.30,
  "margin_used": 565.20,
  "margin_used_pct": 45.2,
  "position_count": 3,
  "initial_balance": 1000.0,
  "daily_pnl": 45.20
}
```

#### 获取持仓信息
```http
GET /api/positions?trader_id={id}
```

#### 获取最新决策
```http
GET /api/decisions/latest?trader_id={id}&limit=10
```

#### 获取净值历史
```http
GET /api/equity-history?trader_id={id}
```

#### 获取性能分析
```http
GET /api/performance?trader_id={id}
```

**响应示例：**
```json
{
  "total_trades": 45,
  "win_rate": 62.22,
  "sharpe_ratio": 1.85,
  "max_drawdown": -8.5,
  "avg_hold_time_hours": 12.5
}
```

---

## 🛠️ 开发指南

### 项目结构

```
nofyai/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由（直接调用 TraderManager）
│   │   ├── auth/             # 认证相关 API
│   │   ├── config/           # 配置管理 API
│   │   ├── trade/            # 交易控制 API
│   │   └── ...
│   ├── trader/[id]/          # 交易员详情页（动态路由）
│   ├── config/               # 配置查看页面
│   ├── layout.tsx            # 根布局（带认证）
│   └── page.tsx              # 竞赛排行榜（首页）
│
├── components/               # React 组件
│   ├── ui/                   # 通用 UI 组件
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── tooltip.tsx
│   │   └── ...
│   ├── auth/                 # 认证组件
│   │   └── LoginModal.tsx
│   ├── config/               # 配置组件
│   │   └── ConfigViewer.tsx
│   ├── competition/          # 竞赛相关组件
│   ├── trader/               # 交易员详情组件
│   │   ├── DecisionDetailModal.tsx  # 决策详情弹窗
│   │   ├── EquityChart.tsx          # 净值曲线图
│   │   └── ...
│   └── layout/               # 布局组件
│       └── Header.tsx
│
├── lib/                      # 核心业务逻辑
│   ├── ai.ts                 # AI 模型集成
│   ├── aster.ts              # Aster 交易所集成
│   ├── auth.ts               # 认证工具（bcrypt、JWT）
│   ├── auth-middleware.ts    # 认证中间件
│   ├── config-loader.ts      # 配置加载器（支持热重载）
│   ├── decision-logger.ts    # 决策日志系统
│   ├── http-client.ts        # HTTP 客户端（代理支持）
│   ├── market-data.ts        # 市场数据获取
│   ├── telegram-notifier.ts  # Telegram 通知
│   ├── trader-manager.ts     # 交易员管理器（单例）
│   └── trading-engine.ts     # 交易引擎核心
│
├── hooks/                    # React Hooks
│   └── useAuth.tsx           # 认证状态管理
│
├── types/                    # TypeScript 类型定义
│   └── index.ts
│
├── scripts/                  # 工具脚本
│   ├── backup.sh                    # 备份脚本
│   ├── check_health.sh              # 健康检查脚本
│   ├── deploy.sh                    # 一键部署脚本（CentOS/RHEL）
│   ├── migrate-closed-positions.ts  # 数据迁移脚本
│   ├── rollback.sh                  # 回滚脚本
│   ├── test-kimi.ts                 # 测试 Kimi API 连接
│   └── update.sh                    # 更新脚本
│
├── decision_logs/            # 决策日志（自动生成）
│   ├── aster_deepseek/
│   └── ...
│
├── config.json.example       # 配置文件示例
├── .env.local.example        # 环境变量示例
├── docker-compose.yml        # Docker Compose 配置
├── Dockerfile                # Docker 镜像配置
├── Caddyfile                 # Caddy 反向代理配置
├── CLAUDE.md                 # AI 开发指南
└── README.md                 # 项目文档
```

### 常用命令

```bash
# 开发
npm run dev                   # 启动开发服务器（Turbopack）
npm run build                 # 构建生产版本
npm start                     # 启动生产服务器
npm run lint                  # 运行 ESLint

# Docker
docker compose up -d          # 启动容器（后台运行）
docker compose down           # 停止并移除容器
docker compose restart        # 重启容器
docker compose logs -f        # 查看实时日志
docker compose build --no-cache  # 重新构建镜像

# 工具脚本
npx tsx scripts/test-kimi.ts                    # 测试 Kimi API 连接
npx tsx scripts/migrate-closed-positions.ts     # 迁移已平仓数据
./scripts/backup.sh                             # 备份决策日志
./scripts/check_health.sh                       # 健康检查
./scripts/deploy.sh                             # 一键部署（CentOS/RHEL）
./scripts/update.sh                             # 更新并重启服务
./scripts/rollback.sh                           # 回滚到上一版本

# 生成密码哈希
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('your-password', 10, (e,h)=>console.log(h))"

# 查看 Docker 卷数据
docker volume ls                            # 列出所有卷
docker volume inspect nofyai_nofyai-decision-logs  # 查看卷详情
```

### 添加新的 Trader

1. 在 `config.json` 的 `traders` 数组中添加新配置
2. 设置 `enabled: true`
3. 填入交易所凭证和 AI 密钥
4. 重启 Next.js 服务器
5. 访问仪表盘，使用 Start 按钮启动交易

### 技术栈

**前端框架：**
- Next.js 16（App Router + Turbopack）
- React 19
- TypeScript 5.9

**UI 和样式：**
- Tailwind CSS 3.4
- Lucide React（图标）
- Recharts（图表）
- 响应式设计（移动端适配）

**数据获取：**
- SWR（实时数据 + 自动刷新）
- Native Fetch API
- undici（代理支持）

**认证与安全：**
- bcrypt（密码哈希）
- jose（JWT 签名与验证）
- 会话管理（Cookie-based）

**AI 集成：**
- DeepSeek API
- Qwen API（通义千问）
- Kimi API（Moonshot AI）
- 自定义 OpenAI 兼容 API

**区块链/交易：**
- ethers.js（Aster DEX 钱包签名）
- Aster DEX REST API（交易执行）
- Binance API（市场数据获取）

**部署：**
- Docker & Docker Compose
- Caddy（反向代理 + 自动 HTTPS）
- CentOS/RHEL 支持

---

## 🔒 安全注意事项

### 敏感信息保护

- ✅ `config.json` 已在 `.gitignore` 中（包含 API 密钥）
- ✅ `.env.local` 已在 `.gitignore` 中
- ✅ `decision_logs/` 已在 `.gitignore` 中（包含交易记录）
- ⚠️ **切勿**将真实凭证提交到 Git 仓库

### 风险管理

- 🔴 **生产环境请使用小额资金测试**
- 设置合理的 `max_daily_loss` 和 `max_drawdown`
- 定期检查 `decision_logs/` 中的 AI 决策质量
- 建议先在 Aster DEX 测试网环境验证策略

### API 密钥权限

- **Aster DEX**：仅需要交易权限，无需提现权限
- **Binance API**：仅用于获取市场数据（K线、价格等），不涉及交易或资金操作
- **AI API**：设置合理的调用频率限制

---

## 🐛 故障排查

### 常见问题

#### 1. "Trader not found" 错误

**原因：** Trader 未初始化（`config.json` 中未配置或 `enabled: false`）

**解决：** 检查 `config.json`，确保 Trader 已启用，然后重启服务器

#### 2. 热重载导致重复交易会话

**原因：** 开发模式下 Next.js 热重载可能导致问题

**解决：** 系统已使用 `globalThis` 单例模式处理，正常情况不应出现

#### 3. 性能数据显示"无数据"

**原因：** 尚未完成任何交易（至少需要 1 笔已平仓交易）

**解决：** 等待至少一笔持仓平仓，性能指标会自动计算

#### 4. 市场数据获取失败

**原因：** Binance API 被墙、区域限制或代理配置错误

**症状：**
- 美国用户访问 `fapi.binance.com` 被拒绝
- 其他地区 Binance API 被防火墙拦截

**解决方案：**

**美国用户（区域限制）：**
```json
// config.json
{
  "binance_region": "us"  // 切换到 Binance US 端点
}
```

**其他地区（被墙）：**
```bash
# .env.local
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

**验证：**
- 查看启动日志确认 Binance 端点和代理状态
- 日志示例：`🌍 [Binance] Using US endpoint: https://api.binance.us`

#### 5. Aster 交易失败

**原因：** 私钥格式错误或余额不足

**解决：**
- 确保 `aster_private_key` 不含 `0x` 前缀
- 运行 `npx tsx scripts/test-aster-connection.ts` 测试连接
- 检查账户 USDT 余额

#### 6. Docker 容器权限错误（EACCES）

**原因：** Docker 卷挂载权限与容器用户不匹配

**症状：**
```
Error: EACCES: permission denied, mkdir 'decision_logs/aster_deepseek'
```

**解决方案：**

**方式一：修复宿主机权限**
```bash
# 运行权限修复脚本
chmod +x fix-permissions.sh
./fix-permissions.sh

# 重启容器
docker compose restart
```

**方式二：使用 Docker 命名卷**
```bash
# 已在 docker-compose.yml 中配置
# 无需手动干预，Docker 自动处理权限
docker compose up -d
```

#### 7. 配置更新不生效

**原因：** 配置在内存中缓存，未重新加载

**解决：**
```bash
# 方式一：使用更新脚本
./update-config.sh

# 方式二：手动重启
docker compose restart nofyai

# 方式三：热重载 API（管理员）
curl -X POST http://localhost:3000/api/config/reload
```

#### 8. Cloudflare DNS 配置错误

**症状：** 域名无法解析，返回 `NXDOMAIN`

**原因：** 错误使用 CNAME 记录指向 IP 地址

**解决：**
- **错误配置**：`类型: CNAME, 内容: 162.252.199.156` ❌
- **正确配置**：`类型: A, 内容: 162.252.199.156` ✅
- 在 Cloudflare 删除 CNAME 记录，添加 A 记录
- 启用代理（橙色云朵）以获得 DDoS 防护

#### 9. Telegram 通知发送失败

**原因：** Bot Token 或 Chat ID 配置错误

**解决：**
```bash
# 测试 Telegram 配置
curl -X POST http://localhost:3000/api/telegram/test
```

检查 `config.json` 中的 `telegram` 配置是否正确。

#### 10. 管理员登录失败

**原因：** 密码错误或 JWT 密钥配置问题

**解决：**
- 检查 `config.json` 中的 `admin.password` 是否正确
- 如果使用 bcrypt 哈希，确保哈希格式正确（以 `$2a$`、`$2b$` 或 `$2y$` 开头）
- 开发环境可临时使用明文密码测试
- 生产环境设置 `.env.local` 中的 `JWT_SECRET`

---

## 📦 Docker 部署最佳实践

### 数据持久化

系统支持两种数据持久化方案：

#### 方案 1：Docker 命名卷（推荐）

**优点**：
- Docker 自动管理权限
- 无需手动配置 UID/GID
- 跨平台兼容性好

**配置**（已默认启用）：
```yaml
volumes:
  - nofyai-decision-logs:/app/decision_logs
  - nofyai-data:/app/data
```

**数据访问**：
```bash
# 查看卷位置
docker volume inspect nofyai_nofyai-decision-logs

# 备份数据
docker run --rm -v nofyai_nofyai-decision-logs:/data -v $(pwd):/backup alpine tar czf /backup/decision_logs.tar.gz /data
```

#### 方案 2：绑定挂载

**优点**：
- 数据直接存储在宿主机
- 便于直接访问和备份

**配置**：
```yaml
volumes:
  - ./decision_logs:/app/decision_logs
  - ./data:/app/data
```

**注意**：需要修复权限
```bash
sudo chown -R 1001:1001 decision_logs data
```

### 容器管理

```bash
# 查看容器状态
docker compose ps

# 查看资源使用
docker stats nofyai

# 进入容器调试
docker compose exec nofyai sh

# 查看容器日志（带时间戳）
docker compose logs -f --timestamps nofyai

# 限制日志大小（在 docker-compose.yml 中已配置）
logging:
  options:
    max-size: "10m"
    max-file: "3"
```

### 健康检查

系统已配置健康检查，自动监控容器状态：

```bash
# 查看健康状态
docker inspect --format='{{.State.Health.Status}}' nofyai

# 查看健康检查日志
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' nofyai
```

### 更新部署

```bash
# 1. 备份配置和数据（使用命名卷）
docker run --rm -v nofyai_nofyai-decision-logs:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz /data

# 2. 拉取最新代码
git pull

# 3. 重新构建并启动
docker compose down
docker compose up -d --build

# 4. 验证
docker compose logs -f nofyai
```

---

## 📊 性能指标说明

### 夏普比率（Sharpe Ratio）

系统根据交易样本量自动调整评级标准：

| 样本量 | 评级标准 |
|--------|---------|
| < 10 笔 | 显示"样本较少"警告，不做严格评级 |
| ≥ 10 笔 | 正常评级（优异 > 良好 > 正收益 > 轻微亏损 > 需改进 > 持续亏损） |

### 其他指标

- **胜率**：盈利交易 / 总交易次数
- **盈亏比**：平均盈利 / 平均亏损
- **最大回撤**：净值峰值到谷底的最大跌幅
- **平均持仓时间**：所有已平仓交易的平均持有时长

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！我们期待你的贡献。

### 快速开始贡献

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交改动（`git commit -m 'feat: Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 开启 Pull Request

### 详细指南

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 获取完整的贡献指南，包括：

- 🐛 如何报告 Bug
- ✨ 如何提出新功能
- 💻 开发流程和代码规范
- 🔒 安全性最佳实践
- 🧪 测试指南
- 🛠️ 调试技巧

### 代码规范

- 使用 TypeScript 编写所有新代码
- 遵循现有的代码风格（使用 Tailwind CSS，避免内联样式）
- 为新功能添加适当的类型定义（定义在 `/types/index.ts`）
- 运行 `npm run lint` 确保代码通过检查
- 运行 `npm run build` 确保构建成功

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

- [Next.js](https://nextjs.org/) - 强大的 React 框架
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架
- [SWR](https://swr.vercel.app/) - React 数据获取库
- [Recharts](https://recharts.org/) - 可组合的 React 图表库
- [DeepSeek](https://www.deepseek.com/) - 高性价比 AI 推理模型
- [Qwen](https://tongyi.aliyun.com/) - 阿里云通义千问大模型
- [Kimi](https://www.moonshot.cn/) - Moonshot AI 长文本理解模型
- [Aster DEX](https://www.asterdex.com/) - 链上永续合约交易所

---

## ⚠️ 免责声明

本项目仅供学习和研究使用。AI 自动化交易存在重大风险，可能导致资金损失。使用者应当：

- 充分理解加密货币交易风险
- 仅使用可承受损失的资金
- 不依赖 AI 决策进行重大投资
- 遵守所在地区的法律法规

**开发者不对使用本软件造成的任何损失负责。**

---

<div align="center">

**如果这个项目对你有帮助，请给个 ⭐ Star 支持一下！**

Made with ❤️ by NofyAI Team

</div>
