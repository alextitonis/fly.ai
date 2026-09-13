// ========================================
// Prompt Building Functions
// ========================================

import * as fs from 'fs';
import * as path from 'path';

import type { TradingContext } from './types';
import { formatMarketData } from './formatters';

// ========================================
// Template Constants
// ========================================

// 统一的账户信息说明模板（所有提示词共用）
const ACCOUNT_INFO_TEMPLATE = `

# 📊 账户信息

你会在每次决策时收到当前账户信息：

**账户**: 净值XX.XX | 余额YY.YY (占比%) | 盈亏±W.WW% | 保证金MM.M% | 持仓N个

- 保证金使用率应控制在60%以内，超过80%时禁止开新仓
- 余额充足（>30%）时才能考虑开新仓

---

`;

// 统一的可用动作模板（所有提示词共用）
const ACTIONS_TEMPLATE = `
# 可用动作 (Actions)

## 开平仓动作

1. **open_long**: 开多仓（看涨）
   - 用于: 看涨信号强烈时
   - 必须设置: leverage, position_size_usd, stop_loss, take_profit, confidence, risk_usd

2. **open_short**: 开空仓（看跌）
   - 用于: 看跌信号强烈时
   - 必须设置: leverage, position_size_usd, stop_loss, take_profit, confidence, risk_usd

3. **close_long** / **close_short**: 完全平仓
   - 用于: 止盈、止损、或趋势反转

4. **wait**: 观望，不持仓
   - 用于: 没有明确信号，或资金不足

5. **hold**: 持有当前仓位
   - 用于: 持仓表现符合预期，继续等待

## 动态调整动作 (可选)

6. **update_stop_loss**: 调整止损价格
   - 用于: 持仓盈利后追踪止损（锁定利润）
   - 建议: 盈利 >3% 时，将止损移至成本价或更高

7. **update_take_profit**: 调整止盈价格
   - 用于: 优化目标位，适应技术位变化

8. **partial_close**: 部分平仓
   - 用于: 分批止盈，降低风险
   - 建议: 盈利达到第一目标时先平仓 50-70%

---

`;

// 统一的输出格式模板（所有提示词共用）
const OUTPUT_FORMAT_TEMPLATE = `

# 📤 输出格式

**第一步: 思维链（纯文本）**
简洁分析你的思考过程（100字以内）输出示例：当前BTC处于上涨趋势，EMA20在EMA50之上，MACD显示买入信号。我持有6个多头持仓，总账户价值xxx，回报率+7.8%。所有持仓的止损和止盈计划都已设置且未触发。市场短期内看涨，保持现有持仓。

**第二步: JSON 决策数组（此步输出时不要包含此标题）**
\`\`\`json
[
  {"symbol": "BTCUSDT", "action": "open_short", "leverage": \${btcEthLeverage}, "position_size_usd": \${accountEquity_sample}, "stop_loss": 97000, "take_profit": 91000, "confidence": 85, "risk_usd": 300, "reasoning": "下跌趋势+MACD死叉"},
  {"symbol": "ETHUSDT", "action": "close_long", "reasoning": "止盈离场"}
]
\`\`\`

**字段说明**:
- \`action\`: open_long | open_short | close_long | close_short | hold | wait
- \`confidence\`: 0-100（开仓建议≥85，使用客观评分公式）
- 开仓时必填: leverage, position_size_usd, stop_loss, take_profit, confidence, risk_usd, reasoning

现在，分析下面提供的市场数据并做出交易决策。
`;

// ========================================
// System Prompt Builder
// ========================================

/**
 * Build system prompt from template file
 * @param accountEquity - Current account equity
 * @param btcEthLeverage - Max leverage for BTC/ETH
 * @param altcoinLeverage - Max leverage for altcoins
 * @param promptTemplate - Prompt template name (default: 'adaptive')
 * @returns System prompt string
 */
export function buildSystemPrompt(
  accountEquity: number,
  btcEthLeverage: number,
  altcoinLeverage: number,
  promptTemplate: string = 'adaptive'
): string {
  // 读取提示词模板文件
  const promptFilePath = path.join(process.cwd(), 'lib', 'prompts', `${promptTemplate}.txt`);

  if (!fs.existsSync(promptFilePath)) {
    console.warn(`Prompt template file not found: ${promptFilePath}, using adaptive.txt as fallback`);
    const fallbackPath = path.join(process.cwd(), 'lib', 'prompts', 'adaptive.txt');
    if (!fs.existsSync(fallbackPath)) {
      throw new Error('Default prompt template (adaptive.txt) not found');
    }
    return fs.readFileSync(fallbackPath, 'utf-8');
  }

  // 读取提示词内容
  let promptContent = fs.readFileSync(promptFilePath, 'utf-8');

  // 移除末尾可能存在的输出格式部分（如果有的话）
  // 确保提示词文件只包含策略和规则，不包含输出格式
  promptContent = promptContent.replace(/---\s*\n*#\s*📤\s*输出格式[\s\S]*$/i, '');

  // 移除可能存在的可用动作部分（如果有的话）
  promptContent = promptContent.replace(/---\s*\n*#\s*可用动作[\s\S]*?---\s*\n/i, '');
  promptContent = promptContent.replace(/---\s*\n*#\s*ACTION\s+SPACE\s+DEFINITION[\s\S]*?---\s*\n/i, '');

  promptContent = promptContent.trim();

  // 构建完整提示词: 策略内容 + 账户信息说明 + 可用动作 + 输出格式
  let fullPrompt = promptContent + ACCOUNT_INFO_TEMPLATE + ACTIONS_TEMPLATE + '\n' + OUTPUT_FORMAT_TEMPLATE;

  // 替换动态参数（如果提示词中包含占位符）
  // 例如：${btcEthLeverage}, ${altcoinLeverage}, ${accountEquity}
  const accountEquitySample = Math.floor(accountEquity * 5); // 示例仓位大小
  fullPrompt = fullPrompt
    .replace(/\$\{btcEthLeverage\}/g, btcEthLeverage.toString())
    .replace(/\$\{altcoinLeverage\}/g, altcoinLeverage.toString())
    .replace(/\$\{accountEquity\}/g, accountEquity.toFixed(0))
    .replace(/\$\{accountEquity_sample\}/g, accountEquitySample.toFixed(0));

  return fullPrompt;
}

// ========================================
// User Prompt Builder
// ========================================

/**
 * Build user prompt with dynamic trading context
 * @param ctx - Trading context with account, positions, market data
 * @returns User prompt string
 */
export function buildUserPrompt(ctx: TradingContext): string {
  const parts: string[] = [];

  // 系统状态
  parts.push(
    `**时间**: ${ctx.current_time} | **周期**: #${ctx.call_count} | **运行**: ${ctx.runtime_minutes}分钟\n\n`
  );

  // BTC市场（关键 - 用于第5步BTC状态确认）
  const btcData = ctx.market_data_map['BTCUSDT'];
  if (btcData) {
    parts.push('## 🔴 BTC 市场（市场领导者）\n\n');
    parts.push(formatMarketData(btcData));
    parts.push('\n');
  }

  // 账户
  const availableBalancePct = (ctx.account.available_balance / ctx.account.total_equity) * 100;
  parts.push(
    `**账户**: 净值${ctx.account.total_equity.toFixed(2)} | 余额${ctx.account.available_balance.toFixed(2)} (${availableBalancePct.toFixed(1)}%) | 盈亏${ctx.account.total_pnl_pct >= 0 ? '+' : ''}${ctx.account.total_pnl_pct.toFixed(2)}% | 保证金${ctx.account.margin_used_pct.toFixed(1)}% | 持仓${ctx.account.position_count}个\n\n`
  );

  // 持仓
  if (ctx.positions.length > 0) {
    parts.push('## 当前持仓\n\n');
    ctx.positions.forEach((pos, i) => {
      // 计算持仓时长
      let holdingDuration = '';
      if (pos.update_time > 0) {
        const durationMs = Date.now() - pos.update_time;
        const durationMin = Math.floor(durationMs / (1000 * 60));
        if (durationMin < 60) {
          holdingDuration = ` | 持仓时长${durationMin}分钟`;
        } else {
          const durationHour = Math.floor(durationMin / 60);
          const durationMinRemainder = durationMin % 60;
          holdingDuration = ` | 持仓时长${durationHour}小时${durationMinRemainder}分钟`;
        }
      }

      parts.push(
        `${i + 1}. ${pos.symbol} ${pos.side.toUpperCase()} | 入场价${pos.entry_price.toFixed(4)} 当前价${pos.mark_price.toFixed(4)} | 盈亏${pos.unrealized_pnl_pct >= 0 ? '+' : ''}${pos.unrealized_pnl_pct.toFixed(2)}% | 杠杆${pos.leverage}x | 保证金${pos.margin_used.toFixed(0)} | 强平价${pos.liquidation_price.toFixed(4)}${holdingDuration}\n\n`
      );

      // 市场数据
      const marketData = ctx.market_data_map[pos.symbol];
      if (marketData) {
        parts.push(formatMarketData(marketData));
        parts.push('\n');
      }
    });
  } else {
    parts.push('**当前持仓**: 无\n\n');
  }

  // 候选币种（排除BTC和已持仓币种）
  const heldSymbols = new Set(ctx.positions.map(p => p.symbol));
  const candidateSymbols = Object.keys(ctx.market_data_map).filter(
    s => s !== 'BTCUSDT' && !heldSymbols.has(s)
  );
  if (candidateSymbols.length > 0) {
    parts.push(`## 候选币种 (${candidateSymbols.length}个)\n\n`);
    candidateSymbols.forEach((symbol, i) => {
      const marketData = ctx.market_data_map[symbol];
      parts.push(`### ${i + 1}. ${symbol}\n\n`);
      parts.push(formatMarketData(marketData));
      parts.push('\n');
    });
  }

  // 性能指标（历史表现 - 用于自我优化）
  if (ctx.performance && ctx.performance.total_trades > 0) {
    parts.push('## 📊 历史表现（绩效分析）\n\n');

    const perf = ctx.performance;

    // 基本统计
    parts.push(`**总交易数**: ${perf.total_trades} 笔 | **盈利**: ${perf.winning_trades} 笔 | **亏损**: ${perf.losing_trades} 笔\n`);
    parts.push(`**胜率**: ${perf.win_rate.toFixed(1)}% | **平均盈利**: $${perf.avg_profit.toFixed(2)} | **平均亏损**: $${perf.avg_loss.toFixed(2)}\n`);

    // 关键指标
    parts.push(`**盈亏比**: ${perf.profit_factor.toFixed(2)} | **夏普比率**: ${perf.sharpe_ratio.toFixed(2)} | **最大回撤**: ${perf.max_drawdown.toFixed(2)}%\n`);
    parts.push(`**平均持仓时长**: ${perf.avg_holding_time_minutes.toFixed(0)} 分钟\n\n`);
  } else if (ctx.sharpe_ratio !== undefined) {
    // 向后兼容：如果没有完整性能数据但有夏普比率
    parts.push(`## 📊 夏普比率: ${ctx.sharpe_ratio.toFixed(2)}\n\n`);
  }

  parts.push('---\n\n');
  parts.push('分析并输出决策（思维链 + JSON）\n');

  return parts.join('');
}
