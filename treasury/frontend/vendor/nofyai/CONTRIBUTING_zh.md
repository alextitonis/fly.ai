# 贡献指南

感谢你考虑为 NofyAI 做出贡献！

**Languages:** [English](CONTRIBUTING.md) | [中文](CONTRIBUTING_zh.md)

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请在 GitHub Issues 中报告，包含以下信息：

- **标题**：简明扼要的描述
- **环境**：Node.js 版本、操作系统、浏览器等
- **重现步骤**：详细的步骤说明
- **期望行为**：你期望发生什么
- **实际行为**：实际发生了什么
- **截图**：如果适用，添加截图帮助解释问题
- **日志**：相关的控制台输出或错误日志

### 提出新功能

如果你有新功能的想法，请先在 Issues 中讨论：

1. 检查是否已有相关的 Issue
2. 创建新 Issue 并打上 `enhancement` 标签
3. 清楚描述功能的用途和预期行为
4. 等待维护者反馈后再开始编码

### 提交代码

#### 开发流程

1. **Fork 仓库**
   ```bash
   # 在 GitHub 上点击 Fork 按钮
   git clone https://github.com/你的用户名/nofyai.git
   cd nofyai
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/amazing-feature
   # 或
   git checkout -b fix/bug-description
   ```

3. **安装依赖**
   ```bash
   npm install
   ```

4. **配置开发环境**
   ```bash
   cp config.json.example config.json
   cp .env.local.example .env.local
   # 编辑配置文件
   ```

5. **进行开发**
   - 编写代码
   - 确保遵循代码规范
   - 添加必要的注释

6. **测试**
   ```bash
   npm run lint        # 检查代码风格
   npm run build       # 确保构建成功
   npm run dev         # 本地测试
   ```

7. **提交改动**
   ```bash
   git add .
   git commit -m "feat: 添加某某功能"
   # 提交信息格式请参考下方说明
   ```

8. **推送分支**
   ```bash
   git push origin feature/amazing-feature
   ```

9. **创建 Pull Request**
   - 在 GitHub 上打开你的 Fork 仓库
   - 点击 "New Pull Request"
   - 填写 PR 描述，说明你的改动

#### 提交信息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<类型>(<范围>): <描述>

[可选的正文]

[可选的脚注]
```

**类型：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不是新功能也不是 Bug 修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

**示例：**
```
feat(ai): 添加 Claude AI 模型支持

- 实现 Anthropic API 集成
- 添加模型配置选项
- 更新 AI 提示词模板

Closes #123
```

```
fix(aster): 修复 Aster DEX 签名错误

- 修正私钥格式处理
- 更新 ethers.js 钱包签名逻辑
- 添加错误提示

Fixes #456
```

### 代码规范

#### TypeScript

- **严格模式**：启用 TypeScript strict mode
- **类型定义**：为所有函数和变量提供明确的类型
- **避免 `any`**：尽量使用具体类型
- **接口优先**：使用 `interface` 而非 `type`（除非需要联合类型）

#### React

- **函数组件**：使用函数组件和 Hooks
- **Props 类型**：为所有组件定义 Props 接口
- **命名规范**：组件使用 PascalCase，文件名与组件名一致
- **避免内联样式**：使用 Tailwind CSS 类名

#### 样式

- **Tailwind CSS**：优先使用 Tailwind 工具类
- **响应式设计**：使用 `sm:`、`md:`、`lg:` 前缀
- **自定义类**：必要时在 `globals.css` 中定义
- **避免 `!important`**：除非绝对必要

#### 文件组织

- **路径别名**：使用 `@/` 导入模块（如 `@/lib/api`）
- **相对路径**：避免深层相对路径（`../../../`）
- **单一职责**：每个文件只做一件事
- **合理命名**：文件名清晰描述其内容

#### 项目特定规范

##### 添加新的 AI 模型

如果你想添加对新 AI 模型的支持：

1. **在 `/lib/ai.ts` 中添加模型处理函数**
   ```typescript
   async function getNewModelDecision(
     context: TradingContext,
     apiKey: string,
     customUrl?: string
   ): Promise<AIResponse> {
     // 实现 API 调用逻辑
   }
   ```

2. **在 `getFullDecision()` 中添加分支**
   ```typescript
   case 'newmodel':
     return await getNewModelDecision(context, config.newmodel_api_key);
   ```

3. **更新类型定义 `/types/index.ts`**
   ```typescript
   export interface TraderConfig {
     // ... 其他字段
     newmodel_api_key?: string;
     newmodel_model_name?: string;
   }
   ```

4. **更新配置文件示例 `config.json.example`**

5. **更新文档**：README.md 和 CLAUDE.md

##### 添加新的交易所

当前系统仅支持 Aster DEX。如需添加其他交易所：

1. **创建交易所客户端** `/lib/exchanges/newexchange.ts`
   ```typescript
   export class NewExchangeTrader {
     async getBalance(): Promise<AccountInfo> { }
     async getPositions(): Promise<Position[]> { }
     async openPosition(params: OpenPositionParams): Promise<any> { }
     async closePosition(params: ClosePositionParams): Promise<any> { }
   }
   ```

2. **在 `/lib/trading-engine.ts` 中集成**
   - 在构造函数中初始化交易所客户端
   - 更新 `getAccount()` 和交易执行逻辑

3. **更新配置类型**：添加新交易所所需的凭证字段

4. **测试脚本**：创建 `scripts/test-newexchange-connection.ts`

5. **文档更新**：详细说明新交易所的配置方法

##### 修改决策日志格式

决策日志系统位于 `/lib/decision-logger.ts`：

- **不要**随意修改已有字段，这会破坏向后兼容性
- **可以**添加新的可选字段
- **必须**在类型定义中同步更新
- **建议**提供数据迁移脚本（参考 `scripts/migrate-closed-positions.ts`）

##### 市场数据源

系统使用 Binance API 获取市场数据，相关逻辑在 `/lib/market-data.ts`：

- 如需添加新数据源（如 CoinGecko），实现相同的接口
- 确保返回的数据格式一致
- 处理 API 限流和错误重试
- 更新配置以支持数据源选择

### 测试

目前项目暂无自动化测试，但请确保：

#### 基础功能测试

- [ ] 所有页面能正常加载
- [ ] API 端点返回正确数据
- [ ] 无控制台错误或警告
- [ ] 在不同浏览器测试（Chrome、Firefox、Safari）
- [ ] 响应式设计在移动端正常显示

#### 交易系统测试

如果你的改动涉及交易逻辑：

- [ ] **配置测试**：使用 `config.json.example` 验证配置加载
- [ ] **API 连接测试**：
  ```bash
  # 测试 Aster DEX 连接
  npx tsx scripts/test-aster-connection.ts

  # 测试 AI 模型连接
  npx tsx scripts/test-kimi.ts  # 或其他 AI 模型测试脚本
  ```
- [ ] **交易流程测试**：在测试环境小额运行完整交易周期
- [ ] **决策日志验证**：检查 `decision_logs/` 下生成的 JSON 文件格式正确
- [ ] **边界情况**：测试余额不足、网络错误、API 限流等情况

#### 性能测试

- [ ] 多个交易员同时运行时的性能表现
- [ ] SWR 数据刷新不会造成页面卡顿
- [ ] 大量决策日志时的加载速度
- [ ] 净值图表渲染大数据集的性能

#### 安全测试

- [ ] API 密钥不会泄露到前端
- [ ] 管理员认证功能正常工作
- [ ] 敏感配置正确脱敏显示
- [ ] 无 XSS 或注入漏洞

### 安全性最佳实践

在贡献代码时，请注意：

#### API 密钥保护

```typescript
// ❌ 错误：直接在前端暴露 API 密钥
const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_KEY;

// ✅ 正确：API 密钥仅在服务端使用
const config = await loadConfig(); // 在 API Route 中
const apiKey = config.traders[0].deepseek_api_key;
```

#### 输入验证

```typescript
// ✅ 验证所有外部输入
export async function POST(request: Request) {
  const body = await request.json();

  // 验证必需字段
  if (!body.trader_id || typeof body.trader_id !== 'string') {
    return NextResponse.json({ error: 'Invalid trader_id' }, { status: 400 });
  }

  // 验证数值范围
  if (body.amount && (body.amount <= 0 || body.amount > MAX_AMOUNT)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
}
```

#### 错误处理

```typescript
// ✅ 不要暴露敏感错误信息
try {
  await executeTrader(traderId);
} catch (error) {
  console.error('Trader execution failed:', error); // 服务端日志
  return NextResponse.json(
    { error: 'Failed to execute trader' }, // 用户看到的
    { status: 500 }
  );
}
```

#### 配置文件安全

- 确保 `config.json` 在 `.gitignore` 中
- 不要在代码示例中使用真实 API 密钥
- 使用环境变量或配置文件，避免硬编码敏感信息

### 文档

如果你的改动涉及：

- **新功能**：更新 README.md
- **API 变化**：更新 API 文档
- **配置变更**：更新 config.json.example
- **架构调整**：更新 CLAUDE.md

### Pull Request 检查清单

提交 PR 前，请确保：

- [ ] 代码遵循项目的代码规范
- [ ] 提交信息遵循 Conventional Commits
- [ ] 已在本地测试所有改动
- [ ] 构建成功（`npm run build`）
- [ ] 无 ESLint 错误（`npm run lint`）
- [ ] 更新了相关文档
- [ ] PR 描述清晰说明了改动内容
- [ ] 添加了必要的代码注释
- [ ] 没有引入新的安全风险
- [ ] 测试了边界情况和错误处理

## 开发工具和技巧

### 推荐的开发工具

- **VS Code**：推荐的代码编辑器
  - ESLint 扩展
  - Prettier 扩展
  - Tailwind CSS IntelliSense 扩展
  - TypeScript and JavaScript Language Features

- **浏览器扩展**
  - React Developer Tools
  - Redux DevTools（如果使用）

### 调试技巧

#### 调试 API 路由

```typescript
// 在 API Route 中添加日志
export async function GET(request: Request) {
  console.log('[API] Request URL:', request.url);
  console.log('[API] Request headers:', request.headers);

  try {
    const result = await someOperation();
    console.log('[API] Result:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

#### 调试交易引擎

在 `lib/trading-engine.ts` 中启用详细日志：

```typescript
async runCycle(): Promise<void> {
  console.log(`[${this.traderId}] Starting trading cycle...`);
  const account = await this.getAccount();
  console.log(`[${this.traderId}] Account balance:`, account.total_equity);
  // ... 更多日志
}
```

#### 查看决策日志

```bash
# 查看最新的决策日志
cat decision_logs/aster_deepseek/$(ls -t decision_logs/aster_deepseek/ | head -1) | jq .

# 查看特定周期的决策
cat decision_logs/aster_deepseek/50.json | jq '.decisions'

# 提取所有交易决策
find decision_logs/aster_deepseek -name "*.json" | xargs jq -r '.decisions[] | "\(.symbol) \(.action)"'
```

#### 监控实时日志

```bash
# Docker 环境
docker compose logs -f nofyai

# 本地开发
npm run dev
```

### 常见开发问题

#### 热重载不工作

```bash
# 清除 Next.js 缓存
rm -rf .next
npm run dev
```

#### TypeScript 类型错误

```bash
# 重新生成类型定义
npm run build
```

#### 端口被占用

```bash
# 查找占用 3000 端口的进程
lsof -ti:3000

# 杀死进程
kill -9 $(lsof -ti:3000)

# 或使用其他端口
PORT=3001 npm run dev
```

## 发布流程

### 版本号规范

遵循 [Semantic Versioning](https://semver.org/)：

- **主版本号**（Major）：不兼容的 API 修改
- **次版本号**（Minor）：向下兼容的功能新增
- **修订号**（Patch）：向下兼容的问题修正

### 发布检查清单

维护者在发布新版本时应：

- [ ] 更新 `package.json` 中的版本号
- [ ] 更新 `CHANGELOG.md`（如果有）
- [ ] 确保所有测试通过
- [ ] 更新文档（README、CLAUDE.md 等）
- [ ] 创建 Git tag
- [ ] 发布 Release Notes

### 行为准则

#### 我们的承诺

为了营造开放和友好的环境，我们承诺：

- 使用友好和包容的语言
- 尊重不同的观点和经验
- 优雅地接受建设性批评
- 关注对社区最有利的事情
- 对其他社区成员表示同理心

#### 不可接受的行为

- 使用性化的语言或图像
- 侮辱性或贬损性评论
- 人身攻击
- 骚扰行为
- 发布他人的私人信息
- 其他在专业环境中不适当的行为

## 问题和讨论

- **Bug 报告**：使用 GitHub Issues
- **功能请求**：使用 GitHub Issues（标签：`enhancement`）
- **一般问题**：使用 GitHub Discussions
- **安全问题**：请私下联系维护者

## 有用的资源

### 项目文档

- [README.md](README.md) - 项目概览和快速开始
- [CLAUDE.md](CLAUDE.md) - AI 开发助手指南
- [config.json.example](config.json.example) - 配置文件示例

### 技术文档

- [Next.js Documentation](https://nextjs.org/docs) - Next.js 官方文档
- [React Documentation](https://react.dev/) - React 官方文档
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript 手册
- [Tailwind CSS](https://tailwindcss.com/docs) - Tailwind CSS 文档
- [SWR Documentation](https://swr.vercel.app/) - SWR 数据获取库

### 交易所 API

- [Aster DEX Documentation](https://www.asterdex.com/) - Aster DEX 官方文档
- [Binance API Documentation](https://binance-docs.github.io/apidocs/) - Binance API（市场数据）

### AI 模型 API

- [DeepSeek API](https://platform.deepseek.com/api-docs/) - DeepSeek API 文档
- [Qwen API](https://help.aliyun.com/zh/dashscope/) - 通义千问 API 文档
- [Kimi API](https://platform.moonshot.cn/docs) - Moonshot AI API 文档

## 许可

提交代码即表示你同意将你的贡献按照 [MIT License](LICENSE) 授权。

---

再次感谢你的贡献！🎉

<div align="center">

**如果你有任何问题，欢迎在 GitHub Issues 或 Discussions 中提问！**

Made with ❤️ by NofyAI Community

</div>
