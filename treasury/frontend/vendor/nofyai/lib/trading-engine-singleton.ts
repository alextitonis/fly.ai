import { TradingEngine, TradingEngineConfig } from './trading-engine';

// Global trading engine instance (singleton)
let engineInstance: TradingEngine | null = null;

export function getTradingEngine(): TradingEngine {
  if (!engineInstance) {
    // Load configuration from environment variables
    const config: TradingEngineConfig = {
      aster: {
        user: process.env.ASTER_USER || '',
        signer: process.env.ASTER_SIGNER || '',
        privateKey: process.env.ASTER_PRIVATE_KEY || '',
      },
      ai: {
        model: (process.env.AI_MODEL as 'deepseek' | 'qwen' | 'custom') || 'deepseek',
        apiKey: process.env.AI_API_KEY || '',
        baseURL: process.env.AI_BASE_URL,
      },
      initialBalance: parseFloat(process.env.INITIAL_BALANCE || '1000'),
      btcEthLeverage: parseInt(process.env.BTC_ETH_LEVERAGE || '5'),
      altcoinLeverage: parseInt(process.env.ALTCOIN_LEVERAGE || '5'),
      scanIntervalMinutes: parseInt(process.env.SCAN_INTERVAL_MINUTES || '3'),
    };

    // Validate required fields
    if (!config.aster.user || !config.aster.signer || !config.aster.privateKey) {
      throw new Error(
        'Missing Aster configuration. Please set ASTER_USER, ASTER_SIGNER, and ASTER_PRIVATE_KEY in .env.local'
      );
    }

    if (!config.ai.apiKey) {
      throw new Error('Missing AI configuration. Please set AI_API_KEY in .env.local');
    }

    engineInstance = new TradingEngine(config);
  }

  return engineInstance;
}

export function resetTradingEngine(): void {
  if (engineInstance) {
    try {
      engineInstance.stop();
    } catch {
      // Ignore if not running
    }
  }
  engineInstance = null;
}
