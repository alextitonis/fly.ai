import { useState } from "react";
import { useReadContract, useChainId } from "wagmi";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { NumberFlow } from "@/components/ui-number-flow";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { RBS_CONFIG_ABI } from "@/abis/RBSConfig";

// ─── Range data hook ───

interface RangeData {
  active: boolean;
  currentPrice: bigint;
  targetPrice: bigint;
  movingAverage: bigint;
  movingAverageDuration: number;
  lastPrice: bigint;
  nextBeat: number;
  upperWall: { active: boolean; price: bigint; capacity: bigint };
  lowerWall: { active: boolean; price: bigint; capacity: bigint };
  upperCushion: { active: boolean; price: bigint; capacity: bigint };
  lowerCushion: { active: boolean; price: bigint; capacity: bigint };
}

function useRangeData() {
  const chainId = useChainId();
  const rbsAddress = getContractAddress(ContractName.RBS_CONFIG, chainId);

  const { data: rangeData } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "range",
    query: { enabled: !!rbsAddress },
  });

  const { data: currentPrice } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "currentPrice",
    query: { enabled: !!rbsAddress },
  });

  const { data: targetPrice } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "getTargetPrice",
    query: { enabled: !!rbsAddress },
  });

  const { data: movingAverage } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "getMovingAverage",
    query: { enabled: !!rbsAddress },
  });

  const { data: movingAverageDuration } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "movingAverageDuration",
    query: { enabled: !!rbsAddress },
  });

  const { data: lastPrice } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "getLastPrice",
    query: { enabled: !!rbsAddress },
  });

  const { data: nextBeat } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "nextBeat",
    query: { enabled: !!rbsAddress },
  });

  const { data: upperWall } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "upperWall",
    query: { enabled: !!rbsAddress },
  });

  const { data: lowerWall } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "lowerWall",
    query: { enabled: !!rbsAddress },
  });

  const { data: upperCushion } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "upperCushion",
    query: { enabled: !!rbsAddress },
  });

  const { data: lowerCushion } = useReadContract({
    address: rbsAddress,
    abi: RBS_CONFIG_ABI,
    functionName: "lowerCushion",
    query: { enabled: !!rbsAddress },
  });

  if (!rangeData || !currentPrice) {
    return { rangeData: undefined, isLoading: true };
  }

  const data: RangeData = {
    active: (rangeData as readonly [boolean, number])[0],
    currentPrice: currentPrice as bigint,
    targetPrice: (targetPrice ?? 0n) as bigint,
    movingAverage: (movingAverage ?? 0n) as bigint,
    movingAverageDuration: (movingAverageDuration ?? 0) as number,
    lastPrice: (lastPrice ?? 0n) as bigint,
    nextBeat: (nextBeat ?? 0) as number,
    upperWall: upperWall ? { active: (upperWall as readonly [boolean, bigint, bigint])[0], price: (upperWall as readonly [boolean, bigint, bigint])[1], capacity: (upperWall as readonly [boolean, bigint, bigint])[2] } : { active: false, price: 0n, capacity: 0n },
    lowerWall: lowerWall ? { active: (lowerWall as readonly [boolean, bigint, bigint])[0], price: (lowerWall as readonly [boolean, bigint, bigint])[1], capacity: (lowerWall as readonly [boolean, bigint, bigint])[2] } : { active: false, price: 0n, capacity: 0n },
    upperCushion: upperCushion ? { active: (upperCushion as readonly [boolean, bigint, bigint])[0], price: (upperCushion as readonly [boolean, bigint, bigint])[1], capacity: (upperCushion as readonly [boolean, bigint, bigint])[2] } : { active: false, price: 0n, capacity: 0n },
    lowerCushion: lowerCushion ? { active: (lowerCushion as readonly [boolean, bigint, bigint])[0], price: (lowerCushion as readonly [boolean, bigint, bigint])[1], capacity: (lowerCushion as readonly [boolean, bigint, bigint])[2] } : { active: false, price: 0n, capacity: 0n },
  };

  return { rangeData: data, isLoading: false };
}

// ─── RBS page ───

function formatPrice(price: bigint): string {
  return (Number(price) / 1e18).toFixed(6);
}

function formatCountdown(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return "Now";
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function RBSPage() {
  const { rangeData, isLoading } = useRangeData();
  const [sellActive, setSellActive] = useState(false);
  const [amount, setAmount] = useState("");

  if (isLoading || !rangeData) {
    return (
      <div className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-bold mb-6">Range Stability</h1>
        <Card className="p-8 text-center text-secondary-t">Loading Range Stability System data...</Card>
      </div>
    );
  }

  const price = Number(rangeData.currentPrice) / 1e18;
  const target = Number(rangeData.targetPrice) / 1e18;
  const ma = Number(rangeData.movingAverage) / 1e18;
  const upperWallPrice = Number(rangeData.upperWall.price) / 1e18;
  const lowerWallPrice = Number(rangeData.lowerWall.price) / 1e18;
  const upperCushionPrice = Number(rangeData.upperCushion.price) / 1e18;
  const lowerCushionPrice = Number(rangeData.lowerCushion.price) / 1e18;

  const allPrices = [lowerWallPrice, lowerCushionPrice, target, upperCushionPrice, upperWallPrice, price, ma].filter((p) => p > 0);
  const minPrice = Math.min(...allPrices) * 0.9;
  const maxPrice = Math.max(...allPrices) * 1.1;
  const range = maxPrice - minPrice;
  const toPercent = (p: number) => ((p - minPrice) / range) * 100;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Range Stability</h1>
        <p className="text-sm text-secondary-t mt-1">
          The Range Stability System keeps BUCKY's price close to $1. When BUCKY's price drops too low, the protocol buys it back. When the price goes too high, the protocol sells. This keeps the price steady without anyone having to do it manually.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Current Price</p>
          <NumberFlow value={price} format={{ maximumFractionDigits: 6 }} className="text-lg font-semibold" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Target Price</p>
          <NumberFlow value={target} format={{ maximumFractionDigits: 6 }} className="text-lg font-semibold" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Moving Average</p>
          <NumberFlow value={ma} format={{ maximumFractionDigits: 6 }} className="text-lg font-semibold" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Next Beat</p>
          <p className="text-lg font-semibold">{formatCountdown(rangeData.nextBeat)}</p>
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-sm font-semibold mb-4">Price Bands</h3>
        <div className="relative h-64 bg-surface-bg-l1 rounded-lg overflow-hidden">
          <div
            className="absolute left-0 right-0 bg-red-500/10 border-y border-red-500/30"
            style={{
              bottom: `${toPercent(upperCushionPrice)}%`,
              height: `${toPercent(upperWallPrice) - toPercent(upperCushionPrice)}%`,
            }}
          />
          <div
            className="absolute left-0 right-0 bg-green-500/10 border-y border-green-500/30"
            style={{
              bottom: `${toPercent(lowerWallPrice)}%`,
              height: `${toPercent(lowerCushionPrice) - toPercent(lowerWallPrice)}%`,
            }}
          />

          {[
            { val: upperWallPrice, label: "Upper Wall", color: "bg-red-500" },
            { val: upperCushionPrice, label: "Upper Cushion", color: "bg-orange-400" },
            { val: target, label: "Target", color: "bg-blue-400" },
            { val: lowerCushionPrice, label: "Lower Cushion", color: "bg-orange-400" },
            { val: lowerWallPrice, label: "Lower Wall", color: "bg-green-500" },
          ].map((line) => line.val > 0 && (
            <div key={line.label} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${toPercent(line.val)}%` }}>
              <div className={`h-px ${line.color} flex-1`} />
              <span className="text-xs text-tertiary-t ml-2 whitespace-nowrap">{line.label}: {line.val.toFixed(6)}</span>
            </div>
          ))}

          <div className="absolute left-0 right-0 flex items-center z-10" style={{ bottom: `${toPercent(price)}%` }}>
            <div className="h-0.5 bg-primary flex-1" />
            <span className="text-xs font-semibold text-primary ml-2 whitespace-nowrap">Price: {price.toFixed(6)}</span>
          </div>

          {ma > 0 && (
            <div className="absolute left-0 right-0 flex items-center" style={{ bottom: `${toPercent(ma)}%` }}>
              <div className="h-0.5 bg-purple-400 flex-1 border-dashed" />
              <span className="text-xs text-purple-400 ml-2 whitespace-nowrap">MA: {ma.toFixed(6)}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex gap-2 mb-4">
          <Button
            variant={sellActive ? "tertiary" : "default"}
            className="flex-1"
            onClick={() => setSellActive(false)}
          >
            Buy BUCKY
          </Button>
          <Button
            variant={sellActive ? "default" : "tertiary"}
            className="flex-1"
            onClick={() => setSellActive(true)}
          >
            Sell BUCKY
          </Button>
        </div>

        <label className="block text-xs font-medium mb-1">
          Amount {sellActive ? "(BUCKY)" : "(Reserve)"}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          className="w-full px-3 py-2 rounded-lg border border-a10-b bg-surface-bg-l1 text-sm mb-4 focus:outline-none focus:border-primary"
        />

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-tertiary-t">Price</span>
            <span>{formatPrice(sellActive ? rangeData.lowerWall.price : rangeData.upperWall.price)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-tertiary-t">Max Capacity</span>
            <span>
              {formatPrice(sellActive ? rangeData.lowerWall.capacity : rangeData.upperWall.capacity)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-tertiary-t">Status</span>
            <span className={rangeData.active ? "text-green-500" : "text-red-500"}>
              {rangeData.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <Button
          className="w-full"
          disabled={!amount || parseFloat(amount) <= 0 || !rangeData.active}
        >
          {sellActive ? "Sell BUCKY" : "Buy BUCKY"}
        </Button>
      </Card>
    </div>
  );
}
