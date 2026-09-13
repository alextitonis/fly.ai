'use client';

import { useState } from 'react';
import { useConfig } from '@/hooks/useTrading';
import { useAuth } from '@/hooks/useAuth';
import { LoginModal } from '@/components/auth/LoginModal';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n-context';

export function ConfigViewer() {
  const t = useTranslations();
  const { data: config, error, isLoading } = useConfig();
  const { isAuthenticated } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const testTelegramNotification = async () => {
    setTelegramTesting(true);
    setTelegramTestResult(null);

    try {
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setTelegramTestResult({ success: true, message: data.message });
      } else {
        setTelegramTestResult({ success: false, message: data.error || t.config.testFailed });
      }
    } catch (error) {
      setTelegramTestResult({
        success: false,
        message: error instanceof Error ? error.message : t.config.testFailed,
      });
    } finally {
      setTelegramTesting(false);
    }
  };

  if (error) {
    return (
      <Card className="p-8">
        <div className="text-center text-danger">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="font-semibold mb-2">{t.config.failedToLoadConfig}</div>
          <div className="text-sm text-text-secondary">{error.message}</div>
        </div>
      </Card>
    );
  }

  if (isLoading || !config) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4 md:space-y-6">
      {/* System Configuration */}
      <Card className="p-3 md:p-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 md:gap-3 text-base md:text-lg">
            <span className="text-xl md:text-2xl">⚙️</span>
            <span>{t.config.systemConfiguration}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
            {/* Leverage Configuration */}
            <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
              <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                {t.config.btcEthLeverage}
              </div>
              <div className="text-xl md:text-2xl font-bold text-primary">
                {config.leverage.btc_eth_leverage}x
              </div>
            </div>

            <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
              <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                {t.config.altcoinLeverage}
              </div>
              <div className="text-xl md:text-2xl font-bold text-primary">
                {config.leverage.altcoin_leverage}x
              </div>
            </div>

            {/* Risk Management */}
            <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
              <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                {t.config.maxDailyLoss}
              </div>
              <div className="text-xl md:text-2xl font-bold text-danger">
                {config.max_daily_loss}%
              </div>
            </div>

            <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
              <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                {t.config.maxDrawdown}
              </div>
              <div className="text-xl md:text-2xl font-bold text-danger">
                {config.max_drawdown}%
              </div>
            </div>

            <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
              <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                {t.config.stopTradingDuration}
              </div>
              <div className="text-xl md:text-2xl font-bold text-warning">
                {config.stop_trading_minutes} min
              </div>
            </div>

            {/* Server Configuration */}
            <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
              <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                {t.config.apiServerPort}
              </div>
              <div className="text-xl md:text-2xl font-bold text-text-primary">
                {config.api_server_port}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Telegram Notification Configuration */}
      <Card className="p-3 md:p-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 md:gap-3 text-base md:text-lg">
            <span className="text-xl md:text-2xl">📱</span>
            <span>{t.config.telegramNotifications}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config.telegram ? (
            <div className="space-y-3 md:space-y-4">
              {/* Enable Status */}
              <div className="flex items-center justify-between p-3 md:p-4 bg-background-secondary rounded-lg">
                <div>
                  <div className="text-xs md:text-sm font-semibold text-text-primary mb-1">
                    {t.config.notificationStatus}
                  </div>
                  <div className="text-[10px] md:text-xs text-text-tertiary">
                    {config.telegram.enabled ? t.config.telegramActive : t.config.telegramDisabled}
                  </div>
                </div>
                <Badge variant={config.telegram.enabled ? 'success' : 'secondary'} className="text-[10px] md:text-xs">
                  {config.telegram.enabled ? t.config.enabled : t.config.disabled}
                </Badge>
              </div>

              {config.telegram.enabled && (
                <>
                  {/* Bot Configuration */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
                      <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                        {t.config.botToken}
                      </div>
                      <div className="text-xs md:text-sm font-mono text-text-secondary break-all">
                        {config.telegram.bot_token.substring(0, 10)}...{config.telegram.bot_token.slice(-4)}
                      </div>
                    </div>

                    <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
                      <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1 md:mb-2">
                        {t.config.chatId}
                      </div>
                      <div className="text-xs md:text-sm font-mono text-text-secondary">
                        {config.telegram.chat_id}
                      </div>
                    </div>
                  </div>

                  {/* Notification Types */}
                  <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
                    <div className="text-xs md:text-sm font-semibold text-text-primary mb-2 md:mb-3">
                      {t.config.notificationTypes}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-text-secondary flex items-center gap-2">
                          <span>📊</span>
                          <span>{t.config.tradeNotifications}</span>
                        </div>
                        <Badge variant={config.telegram.notify_on_trade ? 'success' : 'secondary'} className="text-xs">
                          {config.telegram.notify_on_trade ? t.config.on : t.config.off}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-text-secondary flex items-center gap-2">
                          <span>🚨</span>
                          <span>{t.config.errorNotifications}</span>
                        </div>
                        <Badge variant={config.telegram.notify_on_error ? 'success' : 'secondary'} className="text-xs">
                          {config.telegram.notify_on_error ? t.config.on : t.config.off}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-text-secondary flex items-center gap-2">
                          <span>📈</span>
                          <span>{t.config.dailySummary}</span>
                        </div>
                        <Badge variant={config.telegram.notify_on_daily_summary ? 'success' : 'secondary'} className="text-xs">
                          {config.telegram.notify_on_daily_summary ? t.config.on : t.config.off}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-text-secondary flex items-center gap-2">
                          <span>⚠️</span>
                          <span>{t.config.performanceWarnings}</span>
                        </div>
                        <Badge variant={config.telegram.notify_on_performance_warning ? 'success' : 'secondary'} className="text-xs">
                          {config.telegram.notify_on_performance_warning ? t.config.on : t.config.off}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Test Button */}
                  <div className="flex flex-col items-center gap-2 md:gap-3 p-3 md:p-4 bg-gradient-to-r from-primary/10 to-accent-purple/10 border border-primary/30 rounded-lg">
                    <div className="text-center">
                      <div className="text-xs md:text-sm font-semibold text-text-primary mb-1">
                        {t.config.testYourConfiguration}
                      </div>
                      <div className="text-[10px] md:text-xs text-text-secondary">
                        {t.config.sendTestMessage}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!isAuthenticated) {
                          setShowLoginModal(true);
                          return;
                        }
                        testTelegramNotification();
                      }}
                      disabled={telegramTesting}
                      className="w-full sm:w-auto px-4 md:px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {!isAuthenticated ? (
                        <>
                          <span>🔒</span>
                          <span>{t.auth.loginToManage}</span>
                        </>
                      ) : telegramTesting ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          <span>{t.config.sending}</span>
                        </>
                      ) : (
                        <>
                          <span>📱</span>
                          <span>{t.config.sendTestNotification}</span>
                        </>
                      )}
                    </button>

                    {/* Test Result */}
                    {telegramTestResult && (
                      <div className={`w-full p-2 md:p-3 rounded-lg ${telegramTestResult.success ? 'bg-success/10 border border-success/30' : 'bg-danger/10 border border-danger/30'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base md:text-lg">{telegramTestResult.success ? '✅' : '❌'}</span>
                          <div className="text-[10px] md:text-xs">
                            <div className={`font-semibold ${telegramTestResult.success ? 'text-success' : 'text-danger'}`}>
                              {telegramTestResult.success ? t.config.testSuccess : t.config.testFailed}
                            </div>
                            <div className="text-text-secondary break-all">{telegramTestResult.message}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!config.telegram.enabled && (
                <div className="p-4 md:p-6 text-center">
                  <div className="text-3xl md:text-4xl mb-2 md:mb-3 opacity-30">📱</div>
                  <div className="text-xs md:text-sm font-semibold text-text-primary mb-2">
                    {t.config.telegramNotificationsDisabled}
                  </div>
                  <div className="text-[10px] md:text-xs text-text-tertiary mb-4">
                    {t.config.enableTelegramInConfig}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 md:p-6 text-center">
              <div className="text-3xl md:text-4xl mb-2 md:mb-3 opacity-30">📱</div>
              <div className="text-xs md:text-sm font-semibold text-text-primary mb-2">
                {t.config.telegramNotConfigured}
              </div>
              <div className="text-[10px] md:text-xs text-text-tertiary mb-4">
                {t.config.addTelegramToConfig}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="p-3 md:p-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 md:gap-3 text-base md:text-lg">
            <span className="text-xl md:text-2xl">🪙</span>
            <span>{t.config.coinPoolConfiguration}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between p-3 md:p-4 bg-background-secondary rounded-lg">
              <div>
                <div className="text-xs md:text-sm font-semibold text-text-primary mb-1">
                  {t.config.useDefaultCoins}
                </div>
                <div className="text-[10px] md:text-xs text-text-tertiary">
                  {t.config.useDefaultCoinsDesc}
                </div>
              </div>
              <Badge variant={config.use_default_coins ? 'success' : 'secondary'} className="text-[10px] md:text-xs">
                {config.use_default_coins ? t.config.enabled : t.config.disabled}
              </Badge>
            </div>

            {config.use_default_coins && config.default_coins.length > 0 && (
              <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
                <div className="text-xs md:text-sm font-semibold text-text-primary mb-2 md:mb-3">
                  {t.config.defaultCoinList} ({config.default_coins.length} {t.config.coins})
                </div>
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  {config.default_coins.map((coin, i) => (
                    <div key={i} className="px-2 md:px-3 py-1 bg-white rounded-lg text-[10px] md:text-sm font-mono text-text-secondary">
                      {coin}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {config.coin_pool_api_url && (
              <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
                <div className="text-xs md:text-sm font-semibold text-text-primary mb-1">
                  {t.config.ai500CoinPoolApi}
                </div>
                <div className="text-[10px] md:text-xs font-mono text-text-tertiary break-all">
                  {config.coin_pool_api_url}
                </div>
              </div>
            )}

            {config.oi_top_api_url && (
              <div className="p-3 md:p-4 bg-background-secondary rounded-lg">
                <div className="text-xs md:text-sm font-semibold text-text-primary mb-1">
                  {t.config.oiTopApi}
                </div>
                <div className="text-[10px] md:text-xs font-mono text-text-tertiary break-all">
                  {config.oi_top_api_url}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trader Configurations */}
      <Card className="p-3 md:p-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 md:gap-3 text-base md:text-lg">
            <span className="text-xl md:text-2xl">🤖</span>
            <span>{t.config.traderConfigurations} ({config.traders.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:space-y-4">
            {config.traders.map((trader, i) => (
              <div key={trader.id} className="p-3 md:p-5 bg-background-secondary rounded-xl border border-border">
                {/* Trader Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3 md:mb-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-primary to-accent-purple flex items-center justify-center text-xl md:text-2xl flex-shrink-0">
                      🤖
                    </div>
                    <div>
                      <div className="font-bold text-base md:text-lg text-text-primary">{trader.name}</div>
                      <div className="text-[10px] md:text-xs text-text-tertiary">ID: {trader.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                    <Badge variant={trader.enabled ? 'success' : 'secondary'} className="text-[10px] md:text-xs">
                      {trader.enabled ? t.config.enabled : t.config.disabled}
                    </Badge>
                    <Badge variant="primary" className="text-[10px] md:text-xs">
                      {trader.ai_model.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] md:text-xs">
                      {trader.exchange.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {/* Trader Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  <div>
                    <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.initialBalance}</div>
                    <div className="text-base md:text-lg font-semibold text-text-primary">
                      ${trader.initial_balance.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.scanInterval}</div>
                    <div className="text-base md:text-lg font-semibold text-text-primary">
                      {trader.scan_interval_minutes} min
                    </div>
                  </div>

                  {/* Exchange-specific fields */}
                  {trader.exchange === 'binance' && 'binance_api_key_masked' in trader && (
                    <>
                      <div className="col-span-full">
                        <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.binanceApiKey}</div>
                        <div className="text-xs md:text-sm font-mono text-text-secondary break-all">
                          {trader.binance_api_key_masked}
                        </div>
                      </div>
                    </>
                  )}

                  {trader.exchange === 'hyperliquid' && 'hyperliquid_wallet_addr' in trader && (
                    <>
                      <div className="col-span-full">
                        <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.hyperliquidWallet}</div>
                        <div className="text-xs md:text-sm font-mono text-text-secondary break-all">
                          {trader.hyperliquid_wallet_addr}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.testnet}</div>
                        <Badge variant={'hyperliquid_testnet' in trader && trader.hyperliquid_testnet ? 'warning' : 'success'} className="text-[10px] md:text-xs">
                          {'hyperliquid_testnet' in trader && trader.hyperliquid_testnet ? t.config.yes : t.config.no}
                        </Badge>
                      </div>
                    </>
                  )}

                  {trader.exchange === 'aster' && 'aster_user' in trader && (
                    <>
                      <div className="col-span-full">
                        <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.asterUser}</div>
                        <div className="text-xs md:text-sm font-mono text-text-secondary break-all">
                          {trader.aster_user}
                        </div>
                      </div>
                      <div className="col-span-full">
                        <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.asterSigner}</div>
                        <div className="text-xs md:text-sm font-mono text-text-secondary break-all">
                          {trader.aster_signer}
                        </div>
                      </div>
                    </>
                  )}

                  {/* AI-specific fields */}
                  {trader.ai_model === 'custom' && 'custom_api_url' in trader && (
                    <>
                      <div className="col-span-full">
                        <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.customApiUrl}</div>
                        <div className="text-xs md:text-sm font-mono text-text-secondary break-all">
                          {trader.custom_api_url}
                        </div>
                      </div>
                      {'custom_model_name' in trader && trader.custom_model_name && (
                        <div>
                          <div className="text-[10px] md:text-xs text-text-tertiary mb-1">{t.config.modelName}</div>
                          <div className="text-xs md:text-sm font-mono text-text-secondary">
                            {trader.custom_model_name}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Masked Keys Indicator */}
                <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border">
                  <div className="text-[10px] md:text-xs text-text-tertiary flex items-center gap-1.5 md:gap-2">
                    <span>🔐</span>
                    <span>{t.config.apiKeysMasked}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Login Modal */}
    <LoginModal
      isOpen={showLoginModal}
      onClose={() => setShowLoginModal(false)}
      onSuccess={() => {
        setShowLoginModal(false);
      }}
    />
    </>
  );
}
