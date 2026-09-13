// ========================================
// AI API Client
// ========================================

import type { AIConfig } from './types';

// AI model configuration mappings
const AI_MODEL_CONFIG = {
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
  },
  kimi: {
    baseURL: 'https://api.moonshot.cn',
    defaultModel: 'kimi-k2-turbo-preview',
  },
  custom: {
    baseURL: undefined, // Provided by config
    defaultModel: 'gpt-4',
  },
} as const;

/**
 * Call AI model API
 * @param systemPrompt - System prompt (trading strategy and rules)
 * @param userPrompt - User prompt (current market data and context)
 * @param config - AI API configuration
 * @returns AI response string
 */
export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig
): Promise<string> {
  const modelConfig = AI_MODEL_CONFIG[config.model];
  const baseURL = config.baseURL || modelConfig.baseURL;

  if (!baseURL) {
    throw new Error('AI base URL is required for custom model');
  }

  const modelName = config.modelName || modelConfig.defaultModel;

  const response = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
