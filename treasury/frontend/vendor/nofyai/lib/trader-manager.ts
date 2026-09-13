import { TradingEngine, TradingSession } from './trading-engine';
import { ConfigLoader, TraderConfig } from './config-loader';

// ========================================
// Trader Manager
// ========================================

export class TraderManager {
  private traders: Map<string, TradingEngine> = new Map();
  private configLoader: ConfigLoader;

  constructor(configLoader: ConfigLoader) {
    this.configLoader = configLoader;
  }

  /**
   * Initialize all enabled traders from configuration
   */
  async initialize(): Promise<void> {
    const enabledTraders = this.configLoader.getEnabledTraders();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Initializing ${enabledTraders.length} trader(s)...`);
    console.log(`${'='.repeat(60)}\n`);

    for (const traderConfig of enabledTraders) {
      try {
        await this.addTrader(traderConfig);
      } catch (error) {
        console.error(`❌ Failed to initialize trader ${traderConfig.id}:`, error);
        // Continue with other traders
      }
    }

    console.log(`\n✅ Initialized ${this.traders.size} trader(s)\n`);
  }

  /**
   * Add a new trader
   */
  async addTrader(traderConfig: TraderConfig): Promise<TradingEngine> {
    if (this.traders.has(traderConfig.id)) {
      throw new Error(`Trader ${traderConfig.id} already exists`);
    }

    console.log(`📊 Adding trader: ${traderConfig.name} (${traderConfig.id})`);
    console.log(`   Exchange: ${traderConfig.exchange}`);
    console.log(`   AI Model: ${traderConfig.ai_model}`);

    const engineConfig = this.configLoader.toEngineConfig(traderConfig);
    const engine = new TradingEngine(engineConfig);

    this.traders.set(traderConfig.id, engine);

    console.log(`   ✓ Trader ${traderConfig.id} initialized`);

    return engine;
  }

  /**
   * Start a specific trader
   */
  startTrader(traderId: string): void {
    const engine = this.traders.get(traderId);
    if (!engine) {
      throw new Error(`Trader ${traderId} not found`);
    }

    engine.start();
    console.log(`✅ Started trader: ${traderId}`);
  }

  /**
   * Stop a specific trader
   */
  stopTrader(traderId: string): void {
    const engine = this.traders.get(traderId);
    if (!engine) {
      throw new Error(`Trader ${traderId} not found`);
    }

    engine.stop();
    console.log(`🛑 Stopped trader: ${traderId}`);
  }

  /**
   * Start all traders
   */
  startAll(): void {
    console.log(`\n🚀 Starting all traders...`);

    for (const [traderId, engine] of this.traders.entries()) {
      try {
        engine.start();
        console.log(`   ✓ Started: ${traderId}`);
      } catch (error) {
        console.error(`   ✗ Failed to start ${traderId}:`, error);
      }
    }

    console.log(`\n✅ All traders started\n`);
  }

  /**
   * Stop all traders
   */
  stopAll(): void {
    console.log(`\n🛑 Stopping all traders...`);

    for (const [traderId, engine] of this.traders.entries()) {
      try {
        engine.stop();
        console.log(`   ✓ Stopped: ${traderId}`);
      } catch (error) {
        console.error(`   ✗ Failed to stop ${traderId}:`, error);
      }
    }

    console.log(`\n✅ All traders stopped\n`);
  }

  /**
   * Emergency stop: Stop all traders and close all positions
   */
  async emergencyStopAll(): Promise<void> {
    console.log(`\n🚨 EMERGENCY STOP: Stopping all traders and closing all positions...`);

    const results: Array<{
      trader_id: string;
      stopped: boolean;
      positions_closed: boolean;
      error?: string;
    }> = [];

    for (const [traderId, engine] of this.traders.entries()) {
      const result: {
        trader_id: string;
        stopped: boolean;
        positions_closed: boolean;
        error?: string;
      } = {
        trader_id: traderId,
        stopped: false,
        positions_closed: false,
      };

      try {
        // Stop the trading engine first
        try {
          engine.stop();
          result.stopped = true;
          console.log(`   ✓ Stopped: ${traderId}`);
        } catch (error) {
          console.error(`   ✗ Failed to stop ${traderId}:`, error);
        }

        // Close all positions
        try {
          await engine.closeAllPositions();
          result.positions_closed = true;
          console.log(`   ✓ Closed all positions: ${traderId}`);
        } catch (error) {
          console.error(`   ✗ Failed to close positions for ${traderId}:`, error);
          result.error = error instanceof Error ? error.message : String(error);
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
      }

      results.push(result);
    }

    const successCount = results.filter(r => r.stopped && r.positions_closed).length;
    console.log(`\n✅ Emergency stop completed: ${successCount}/${this.traders.size} traders fully stopped\n`);

    return;
  }

  /**
   * Get trader by ID
   */
  getTrader(traderId: string): TradingEngine | null {
    return this.traders.get(traderId) || null;
  }

  /**
   * Get all traders
   */
  getAllTraders(): Map<string, TradingEngine> {
    return new Map(this.traders);
  }

  /**
   * Get trader IDs
   */
  getTraderIds(): string[] {
    return Array.from(this.traders.keys());
  }

  /**
   * Get status of all traders
   */
  getAllStatus(): Array<{
    trader_id: string;
    trader_name: string;
    ai_model: string;
    exchange: string;
    is_running: boolean;
    session: TradingSession;
  }> {
    const statuses: Array<{
      trader_id: string;
      trader_name: string;
      ai_model: string;
      exchange: string;
      is_running: boolean;
      session: TradingSession;
    }> = [];

    for (const [traderId, engine] of this.traders.entries()) {
      const traderConfig = this.configLoader.getTrader(traderId);
      const session = engine.getSession();

      statuses.push({
        trader_id: traderId,
        trader_name: traderConfig?.name || traderId,
        ai_model: traderConfig?.ai_model || 'unknown',
        exchange: traderConfig?.exchange || 'unknown',
        is_running: session.isRunning,
        session,
      });
    }

    return statuses;
  }

  /**
   * Get count of traders
   */
  getCount(): { total: number; running: number; stopped: number } {
    let running = 0;
    let stopped = 0;

    for (const engine of this.traders.values()) {
      const session = engine.getSession();
      if (session.isRunning) {
        running++;
      } else {
        stopped++;
      }
    }

    return {
      total: this.traders.size,
      running,
      stopped,
    };
  }
}

// ========================================
// Singleton Instance (Hot-reload safe)
// ========================================

// Use globalThis to persist across hot reloads in development
const globalForTraderManager = globalThis as unknown as {
  traderManager: TraderManager | undefined;
};

export async function getTraderManager(): Promise<TraderManager> {
  if (!globalForTraderManager.traderManager) {
    // Load configuration
    const { getConfigLoader } = await import('./config-loader');
    const configLoader = getConfigLoader();

    try {
      await configLoader.load();
      globalForTraderManager.traderManager = new TraderManager(configLoader);
      await globalForTraderManager.traderManager.initialize();
    } catch (error) {
      console.error('❌ Failed to initialize TraderManager:', error);
      throw error;
    }
  }

  return globalForTraderManager.traderManager;
}
