import { create } from "zustand";

// Generate mock data for the charts
function generateCandleData() {
  const data = [];
  let time = new Date('2025-01-01').getTime() / 1000;
  let o = 1.75;
  for (let i = 0; i < 90; i++) {
    const isUp = Math.random() > 0.45; // slight upward bias
    const c = isUp ? o + Math.random() * 0.05 : o - Math.random() * 0.05;
    const h = Math.max(o, c) + Math.random() * 0.02;
    const l = Math.min(o, c) - Math.random() * 0.02;
    data.push({ time: time + i * 86400, open: o, high: h, low: l, close: c });
    o = c;
  }
  return data;
}

function generateVolumeData() {
  const data = [];
  let time = new Date('2025-04-01').getTime() / 1000;
  let val = 10; // Billions starting point
  data.push({ time: time, value: 10.5, color: 'rgba(34, 197, 94, 0.8)' });
  data.push({ time: time + (30 * 86400), value: 6.8, color: 'rgba(34, 197, 94, 0.8)' });
  data.push({ time: time + (60 * 86400), value: 8.7, color: 'rgba(34, 197, 94, 0.8)' });
  data.push({ time: time + (90 * 86400), value: 3.5, color: 'rgba(34, 197, 94, 0.8)' });
  return data;
}

export const chartData = {
  liquidity: generateCandleData(),
  liquidityVolume: generateCandleData().map(c => ({
    time: c.time,
    value: Math.random() * 50 + 10,
    color: c.close > c.open ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
  })),
  volume: generateVolumeData(),
};

export const topTokens = [
  {
    id: "ETH",
    name: "Ethereum",
    symbol: "ETH",
    liquidity: "$688.41m",
    volume: "US$190,980,899",
    price: "US$2,267",
    change: "+1.42%",
    isPositive: true,
  },
  {
    id: "USDT",
    name: "Tether USD",
    symbol: "USDT",
    liquidity: "US$62,880,160",
    volume: "US$23,049,275",
    price: "US$1.00",
    change: "-0.02%",
    isPositive: false,
  },
  {
    id: "USDC",
    name: "USDC",
    symbol: "USDC",
    liquidity: "US$73,825,043",
    volume: "US$17,572,042",
    price: "US$1.00",
    change: "+12.62%",
    isPositive: true,
  },
  {
    id: "OXT",
    name: "Orchid",
    symbol: "OXT",
    liquidity: "US$7,621,786",
    volume: "US$12,364,368",
    price: "US$5.00",
    change: "+0.12%",
    isPositive: true,
  },
  {
    id: "SOL",
    name: "Solana",
    symbol: "SOL",
    liquidity: "US$15,482,911",
    volume: "US$8,947,520",
    price: "US$8.70",
    change: "+3.12%",
    isPositive: true,
  },
];

// Simple store for time ranges
interface DashboardState {
  liquidityRange: string;
  volumeRange: string;
  setLiquidityRange: (range: string) => void;
  setVolumeRange: (range: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  liquidityRange: '30d',
  volumeRange: '7d',
  setLiquidityRange: (range) => set({ liquidityRange: range }),
  setVolumeRange: (range) => set({ volumeRange: range }),
}));
