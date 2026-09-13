'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { TraderDetailView } from '@/components/trader/TraderDetailView';
import { useTranslations } from '@/lib/i18n-context';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { MaskedTraderConfig } from '@/types';
import PriceTickerBoard from '@/components/market/PriceTickerBoard';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function HomePage() {
  const t = useTranslations();
  const { data: config, error } = useSWR('/api/config', fetcher);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);

  // Set the first trader as selected by default
  useEffect(() => {
    if (config?.traders && config.traders.length > 0 && !selectedTraderId) {
      setSelectedTraderId(config.traders[0].id);
    }
  }, [config, selectedTraderId]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-danger font-semibold">Failed to load configuration</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="w-full px-6 py-8">
        <SkeletonCard />
      </div>
    );
  }

  const traders: MaskedTraderConfig[] = config.traders || [];
  const hasTraders = traders.length > 0;
  const hasSingleTrader = traders.length === 1;
  const currentTrader = traders.find(t => t.id === selectedTraderId);

  return (
    <div className="w-full px-4 md:px-6 py-4 md:py-8">
      {hasTraders ? (
        <>
          {/* Top row: Trader tabs (left) + Price ticker (right) */}
          <div className="mb-4 md:mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
              {!hasSingleTrader ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {traders.map((trader) => (
                    <button
                      key={trader.id}
                      onClick={() => setSelectedTraderId(trader.id)}
                      className={`px-4 md:px-6 py-2 md:py-3 rounded-lg font-semibold text-xs md:text-sm whitespace-nowrap transition-all ${
                        selectedTraderId === trader.id
                          ? 'bg-gradient-to-r from-primary to-accent-purple text-white shadow-lg'
                          : 'bg-white text-text-secondary hover:bg-background-secondary border border-border'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span className="text-sm md:text-base">🤖</span>
                        <span className="hidden sm:inline">{trader.name}</span>
                        <span className="sm:hidden">{trader.id}</span>
                        {trader.enabled && (
                          <Badge variant="success" className="ml-1 text-[10px] md:text-xs">
                            {t.config.enabled}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div />
              )}
              <div className="w-full md:w-auto md:ml-auto md:max-w-full">
                <PriceTickerBoard symbols={(config as any)?.default_coins || []} />
              </div>
            </div>
          </div>

          {/* Trader Detail View */}
          {selectedTraderId && currentTrader && (
            <TraderDetailView traderId={selectedTraderId} showHeader={true} />
          )}
        </>
      ) : (
        <div className="text-center py-12 md:py-16 px-4">
          <div className="text-4xl md:text-6xl mb-4">🤖</div>
          <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-2">
            {t.competition.noTradersActive}
          </h2>
          <p className="text-sm md:text-base text-text-secondary mb-6">
            {t.competition.startBackend}
          </p>
          <Link
            href="/config"
            className="inline-block px-5 md:px-6 py-2.5 md:py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold text-sm md:text-base"
          >
            {t.competition.config}
          </Link>
        </div>
      )}
    </div>
  );
}
