// ========================================
// AI Module - Unified Export
// ========================================

// Export all types
export type {
  Decision,
  FullDecision,
  PositionInfo,
  MarketData,
  TradingContext,
  AIConfig,
  AccountInfo,
} from './types';

// Export formatters
export { formatMarketData } from './formatters';

// Export validators
export { validateDecision } from './validators';

// Export parsers
export { parseDecisionResponse } from './parsers';

// Export prompt builders
export { buildSystemPrompt, buildUserPrompt } from './prompts';

// Export AI client
export { callAI } from './client';

// ========================================
// Main Decision Function
// ========================================

import type { TradingContext, AIConfig, FullDecision } from './types';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { callAI } from './client';
import { parseDecisionResponse } from './parsers';
import { validateDecision } from './validators';

/**
 * Get full trading decision from AI
 * @param ctx - Trading context with account, positions, market data
 * @param aiConfig - AI API configuration
 * @returns Full decision with CoT trace and decisions array
 */
export async function getFullDecision(
  ctx: TradingContext,
  aiConfig: AIConfig
): Promise<FullDecision> {
  // 1. 构建提示词
  const systemPrompt = buildSystemPrompt(
    ctx.account.total_equity,
    ctx.btc_eth_leverage,
    ctx.altcoin_leverage,
    ctx.prompt_template || 'adaptive' // 使用配置的提示词模板，默认 adaptive
  );
  const userPrompt = buildUserPrompt(ctx);

  // 2. 调用AI
  const aiResponse = await callAI(systemPrompt, userPrompt, aiConfig);

  // 3. 解析响应
  const { cotTrace, decisions } = parseDecisionResponse(aiResponse);

  // 4. 验证决策
  for (let i = 0; i < decisions.length; i++) {
    const error = validateDecision(
      decisions[i],
      ctx.account.total_equity,
      ctx.btc_eth_leverage,
      ctx.altcoin_leverage
    );
    if (error) {
      console.warn(`决策 #${i + 1} 验证失败: ${error}`);
    }
  }

  return {
    user_prompt: userPrompt,
    cot_trace: cotTrace,
    decisions,
    timestamp: new Date(),
  };
}
