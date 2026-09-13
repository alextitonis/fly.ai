import { NextRequest, NextResponse } from 'next/server';
import { getConfigLoader } from '@/lib/config-loader';

/**
 * GET /api/config
 * Returns masked system configuration (hides sensitive API keys)
 */
export async function GET(request: NextRequest) {
  try {
    const configLoader = getConfigLoader();

    // Ensure config is loaded
    let config;
    try {
      config = configLoader.getConfig();
    } catch {
      await configLoader.load();
      config = configLoader.getConfig();
    }

    // Mask sensitive keys for frontend display
    const maskedConfig = {
      traders: config.traders.map(trader => {
        const masked: any = {
          id: trader.id,
          name: trader.name,
          enabled: trader.enabled,
          ai_model: trader.ai_model,
          exchange: trader.exchange,
          initial_balance: trader.initial_balance,
          scan_interval_minutes: trader.scan_interval_minutes,
        };

        // Add exchange-specific fields
        if (trader.exchange === 'aster') {
          masked.aster_user = trader.aster_user;
          masked.aster_signer = trader.aster_signer;
          if (trader.aster_private_key) {
            masked.aster_private_key_masked = `${trader.aster_private_key.substring(0, 4)}...${trader.aster_private_key.slice(-4)}`;
          }
        } else if (trader.exchange === 'binance') {
          if (trader.binance_api_key) {
            masked.binance_api_key_masked = `${trader.binance_api_key.substring(0, 4)}...${trader.binance_api_key.slice(-4)}`;
          }
          if (trader.binance_secret_key) {
            masked.binance_secret_key_masked = `${trader.binance_secret_key.substring(0, 4)}...${trader.binance_secret_key.slice(-4)}`;
          }
        } else if (trader.exchange === 'hyperliquid') {
          masked.hyperliquid_wallet_addr = trader.hyperliquid_wallet_addr;
          masked.hyperliquid_testnet = trader.hyperliquid_testnet;
          if (trader.hyperliquid_private_key) {
            masked.hyperliquid_private_key_masked = `${trader.hyperliquid_private_key.substring(0, 4)}...${trader.hyperliquid_private_key.slice(-4)}`;
          }
        }

        // Add AI model-specific fields
        if (trader.ai_model === 'deepseek' && trader.deepseek_key) {
          masked.deepseek_key_masked = `${trader.deepseek_key.substring(0, 4)}...${trader.deepseek_key.slice(-4)}`;
        } else if (trader.ai_model === 'qwen' && trader.qwen_key) {
          masked.qwen_key_masked = `${trader.qwen_key.substring(0, 4)}...${trader.qwen_key.slice(-4)}`;
        } else if (trader.ai_model === 'kimi') {
          masked.kimi_model_name = trader.kimi_model_name;
          if (trader.kimi_api_key) {
            masked.kimi_api_key_masked = `${trader.kimi_api_key.substring(0, 4)}...${trader.kimi_api_key.slice(-4)}`;
          }
        } else if (trader.ai_model === 'custom') {
          masked.custom_api_url = trader.custom_api_url;
          masked.custom_model_name = trader.custom_model_name;
          if (trader.custom_api_key) {
            masked.custom_api_key_masked = `${trader.custom_api_key.substring(0, 4)}...${trader.custom_api_key.slice(-4)}`;
          }
        }

        return masked;
      }),
      leverage: config.leverage,
      use_default_coins: config.use_default_coins,
      default_coins: config.default_coins,
      coin_pool_api_url: config.coin_pool_api_url || '',
      oi_top_api_url: config.oi_top_api_url || '',
      max_daily_loss: config.max_daily_loss || 10,
      max_drawdown: config.max_drawdown || 20,
      stop_trading_minutes: config.stop_trading_minutes || 60,
      api_server_port: config.api_server_port || 8000,
      // Keep telegram config but mask bot_token if present
      telegram: config.telegram ? {
        ...config.telegram,
        bot_token: config.telegram.bot_token,
        chat_id: config.telegram.chat_id,
      } : undefined,
    };

    return NextResponse.json(maskedConfig);
  } catch (error) {
    console.error('Error loading config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch config' },
      { status: 500 }
    );
  }
}
