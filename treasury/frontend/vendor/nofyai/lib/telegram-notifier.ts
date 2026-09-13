/**
 * Telegram Notification System
 * Sends trading alerts and notifications to Telegram
 */

import { fetchWithProxy } from './http-client';

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
  notify_on_trade: boolean;
  notify_on_error: boolean;
  notify_on_daily_summary: boolean;
  notify_on_performance_warning: boolean;
}

export interface TradeNotification {
  trader_id: string;
  trader_name: string;
  symbol: string;
  action: string;
  side?: string;
  entry_price?: number;
  quantity?: number;
  leverage?: number;
  pnl?: number;
  pnl_pct?: number;
  success: boolean;
  error?: string;
}

export interface PerformanceWarning {
  trader_id: string;
  trader_name: string;
  warning_type: 'max_daily_loss' | 'max_drawdown' | 'low_sharpe';
  current_value: number;
  threshold_value: number;
  message: string;
}

export interface DailySummary {
  trader_id: string;
  trader_name: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_pnl: number;
  total_pnl_pct: number;
  sharpe_ratio: number;
  win_rate: number;
}

export class TelegramNotifier {
  private config: TelegramConfig;
  private baseUrl: string;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.baseUrl = `https://api.telegram.org/bot${config.bot_token}`;
  }

  /**
   * Send a message to Telegram
   */
  private async sendMessage(text: string, parse_mode: 'Markdown' | 'HTML' = 'Markdown'): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const response = await fetchWithProxy(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: this.config.chat_id,
        text: text,
        parse_mode: parse_mode,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      throw new Error(`Telegram API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    console.log('[Telegram] Message sent successfully:', result.ok);
  }

  /**
   * Send trade execution notification
   */
  async notifyTrade(notification: TradeNotification): Promise<void> {
    if (!this.config.notify_on_trade || !this.config.enabled) {
      return;
    }

    try {
      const emoji = notification.success ? '✅' : '❌';
      const actionEmoji = this.getActionEmoji(notification.action);

      let message = `${emoji} *${actionEmoji} ${notification.action.toUpperCase()}*\n\n`;
      message += `📊 Trader: ${notification.trader_name}\n`;
      message += `💱 Symbol: *${notification.symbol}*\n`;

      if (notification.action.includes('open')) {
        message += `💰 Entry: $${notification.entry_price?.toFixed(4)}\n`;
        message += `📦 Quantity: ${notification.quantity?.toFixed(4)}\n`;
        message += `⚡ Leverage: ${notification.leverage}x\n`;
        message += `📈 Side: ${notification.side?.toUpperCase()}\n`;
      } else if (notification.action.includes('close')) {
        if (notification.pnl !== undefined) {
          const pnlEmoji = notification.pnl >= 0 ? '🟢' : '🔴';
          message += `${pnlEmoji} PnL: $${notification.pnl.toFixed(2)} (${notification.pnl_pct?.toFixed(2)}%)\n`;
        }
      }

      if (!notification.success && notification.error) {
        message += `\n⚠️ Error: ${notification.error}`;
      }

      message += `\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

      await this.sendMessage(message);
    } catch (error) {
      console.error('Failed to send trade notification:', error);
    }
  }

  /**
   * Send error notification
   */
  async notifyError(trader_id: string, trader_name: string, error: string, context?: string): Promise<void> {
    if (!this.config.notify_on_error || !this.config.enabled) {
      return;
    }

    try {
      let message = `🚨 *ERROR ALERT*\n\n`;
      message += `📊 Trader: ${trader_name}\n`;
      message += `🆔 ID: ${trader_id}\n`;

      if (context) {
        message += `📍 Context: ${context}\n`;
      }

      message += `\n❌ Error:\n\`\`\`\n${error}\n\`\`\`\n`;
      message += `\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

      await this.sendMessage(message);
    } catch (error) {
      console.error('Failed to send error notification:', error);
    }
  }

  /**
   * Send performance warning
   */
  async notifyPerformanceWarning(warning: PerformanceWarning): Promise<void> {
    if (!this.config.notify_on_performance_warning || !this.config.enabled) {
      return;
    }

    try {
      let message = `⚠️ *PERFORMANCE WARNING*\n\n`;
      message += `📊 Trader: ${warning.trader_name}\n`;
      message += `🔔 Type: ${this.getWarningTypeText(warning.warning_type)}\n`;
      message += `📉 Current: ${warning.current_value.toFixed(2)}%\n`;
      message += `🎯 Threshold: ${warning.threshold_value.toFixed(2)}%\n`;
      message += `\n💬 ${warning.message}\n`;
      message += `\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

      await this.sendMessage(message);
    } catch (error) {
      console.error('Failed to send performance warning:', error);
    }
  }

  /**
   * Send daily summary
   */
  async notifyDailySummary(summary: DailySummary): Promise<void> {
    if (!this.config.notify_on_daily_summary || !this.config.enabled) {
      return;
    }

    try {
      const pnlEmoji = summary.total_pnl >= 0 ? '🟢' : '🔴';
      const sharpeEmoji = this.getSharpeEmoji(summary.sharpe_ratio);

      let message = `📊 *DAILY SUMMARY*\n\n`;
      message += `🤖 Trader: ${summary.trader_name}\n`;
      message += `📈 Total Trades: ${summary.total_trades}\n`;
      message += `✅ Winning: ${summary.winning_trades} | ❌ Losing: ${summary.losing_trades}\n`;
      message += `🎯 Win Rate: ${summary.win_rate.toFixed(2)}%\n`;
      message += `\n${pnlEmoji} *Total PnL: $${summary.total_pnl.toFixed(2)} (${summary.total_pnl_pct.toFixed(2)}%)*\n`;
      message += `${sharpeEmoji} Sharpe Ratio: ${summary.sharpe_ratio.toFixed(3)}\n`;
      message += `\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

      await this.sendMessage(message);
    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  /**
   * Send custom message
   */
  async sendCustomMessage(message: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      await this.sendMessage(message);
    } catch (error) {
      console.error('Failed to send custom message:', error);
    }
  }

  /**
   * Test notification (for setup verification)
   */
  async testNotification(): Promise<boolean> {
    try {
      const message = `✅ *Telegram Bot Connected Successfully!*\n\nNofyAI Trading System is ready to send notifications.\n\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
      await this.sendMessage(message);
      return true;
    } catch (error) {
      console.error('Telegram test failed:', error);
      return false;
    }
  }

  /**
   * Helper: Get action emoji
   */
  private getActionEmoji(action: string): string {
    if (action.includes('open_long')) return '📈';
    if (action.includes('open_short')) return '📉';
    if (action.includes('close')) return '🔄';
    return '📊';
  }

  /**
   * Helper: Get warning type text
   */
  private getWarningTypeText(type: string): string {
    switch (type) {
      case 'max_daily_loss':
        return 'Max Daily Loss Exceeded';
      case 'max_drawdown':
        return 'Max Drawdown Exceeded';
      case 'low_sharpe':
        return 'Low Sharpe Ratio';
      default:
        return 'Unknown Warning';
    }
  }

  /**
   * Helper: Get Sharpe ratio emoji
   */
  private getSharpeEmoji(sharpe: number): string {
    if (sharpe > 1.5) return '🌟';
    if (sharpe > 0.5) return '✨';
    if (sharpe > 0) return '💫';
    if (sharpe > -0.5) return '⚠️';
    return '🔴';
  }
}

/**
 * Create a Telegram notifier instance
 */
export function createTelegramNotifier(config: TelegramConfig): TelegramNotifier {
  return new TelegramNotifier(config);
}
