// ========================================
// AI Response Parsing Functions
// ========================================

import type { Decision } from './types';

/**
 * Parse AI response into CoT trace and decisions
 * @param aiResponse - Raw AI response string
 * @returns Object with CoT trace and decisions array
 */
export function parseDecisionResponse(aiResponse: string): {
  cotTrace: string;
  decisions: Decision[];
} {
  // 1. 提取思维链（JSON数组之前的内容）
  const jsonStart = aiResponse.indexOf('[');
  const cotTrace = jsonStart > 0 ? aiResponse.substring(0, jsonStart).trim() : aiResponse.trim();

  // 2. 提取JSON决策列表
  if (jsonStart === -1) {
    return { cotTrace, decisions: [] };
  }

  // 找到匹配的右括号
  const jsonEnd = findMatchingBracket(aiResponse, jsonStart);
  if (jsonEnd === -1) {
    throw new Error('无法找到JSON数组结束');
  }

  let jsonContent = aiResponse.substring(jsonStart, jsonEnd + 1).trim();

  // 修复中文引号
  jsonContent = jsonContent
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  // 解析JSON
  try {
    const decisions = JSON.parse(jsonContent) as Decision[];
    return { cotTrace, decisions };
  } catch (error) {
    throw new Error(`JSON解析失败: ${error instanceof Error ? error.message : error}\nJSON内容: ${jsonContent}`);
  }
}

/**
 * Find matching closing bracket
 * @param s - String to search
 * @param start - Start index (should be '[')
 * @returns Index of matching ']', or -1 if not found
 */
function findMatchingBracket(s: string, start: number): number {
  if (start >= s.length || s[start] !== '[') {
    return -1;
  }

  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '[') {
      depth++;
    } else if (s[i] === ']') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
