// ========================================
// AI Trading Decision Engine
// ========================================
//
// This file serves as the main entry point for the AI module.
// All implementation has been modularized into ./ai/* directory.
//
// For implementation details, see:
// - ./ai/types.ts - Type definitions
// - ./ai/formatters.ts - Data formatting functions
// - ./ai/validators.ts - Decision validation logic
// - ./ai/parsers.ts - Response parsing functions
// - ./ai/prompts.ts - Prompt building logic
// - ./ai/client.ts - AI API client
// - ./ai/index.ts - Unified exports and main decision function

// Re-export everything from the modularized AI module
export * from './ai/index';
