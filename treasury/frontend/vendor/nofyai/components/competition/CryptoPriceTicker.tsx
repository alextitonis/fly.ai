'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface CryptoPrice {
  symbol: string;
  name: string;
  price: number;
  icon: string;
}

export default function CryptoPriceTicker() {
  const [prices, setPrices] = useState<CryptoPrice[]>([
    { symbol: 'BTC', name: 'Bitcoin', price: 0, icon: '/coins/btc.svg' },
    { symbol: 'ETH', name: 'Ethereum', price: 0, icon: '/coins/eth.svg' },
    { symbol: 'SOL', name: 'Solana', price: 0, icon: '/coins/sol.svg' },
    { symbol: 'BNB', name: 'BNB', price: 0, icon: '/coins/bnb.svg' },
    { symbol: 'DOGE', name: 'Dogecoin', price: 0, icon: '/coins/doge.svg' },
    { symbol: 'XRP', name: 'Ripple', price: 0, icon: '/coins/xrp.svg' },
  ]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Fetch from Binance API (free, no auth required)
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'XRPUSDT'];
        const responses = await Promise.all(
          symbols.map(symbol =>
            fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
              .then(res => res.json())
          )
        );

        const newPrices = prices.map((crypto, index) => ({
          ...crypto,
          price: parseFloat(responses[index].price || '0'),
        }));

        setPrices(newPrices);
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number, decimals: number = 2) => {
    if (price >= 1000) {
      return price.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    return price.toFixed(decimals < 4 ? 4 : decimals);
  };

  return (
    <div className="bg-gray-900 border-b border-gray-800 overflow-hidden">
      <div className="flex items-center gap-8 py-3 px-6 animate-scroll">
        {prices.map((crypto, index) => (
          <div
            key={`${crypto.symbol}-${index}`}
            className="flex items-center gap-2 min-w-fit"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400">
                {crypto.symbol[0]}
              </div>
              <span className="text-sm font-medium text-gray-300">
                {crypto.symbol}
              </span>
            </div>
            <span className="text-sm font-mono text-white">
              ${crypto.price > 0 ? formatPrice(crypto.price, crypto.symbol === 'DOGE' ? 5 : 2) : '---'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
