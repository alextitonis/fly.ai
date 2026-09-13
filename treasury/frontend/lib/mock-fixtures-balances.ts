import { parseUnits } from "viem";
import { base } from "@/lib/chains";
import type { MultiChainBalanceResult, ChainBalance } from "@/hooks/use-multi-chain-balance";

function bal(chainId: number, chainName: string, amount: string, decimals: number): ChainBalance {
  const balance = parseUnits(amount, decimals);
  return { chainId, chainName, balance, formattedBalance: amount };
}

function result(balances: ChainBalance[]): MultiChainBalanceResult {
  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0n);
  const totalFormatted = balances.reduce((sum, b) => sum + parseFloat(b.formattedBalance), 0);
  return {
    balances,
    totalBalance,
    formattedTotalBalance: totalFormatted.toString(),
    isLoading: false,
    error: null,
  };
}

const EMPTY: MultiChainBalanceResult = {
  balances: [],
  totalBalance: 0n,
  formattedTotalBalance: "0",
  isLoading: false,
  error: null,
};

// Whale: big balances on Base
export const WHALE_BALANCES: Record<string, MultiChainBalanceResult> = {
  SHIT: result([bal(base.id, "Base", "14.245", 9)]),
  sSHIT: result([bal(base.id, "Base", "2.125", 9)]),
  wstSHIT: result([bal(base.id, "Base", "14.245", 18)]),
  wsSHIT: EMPTY,
  "SHIT v1": EMPTY,
  "sSHIT v1": EMPTY,
};

// Empty: connected but no balances
export const EMPTY_BALANCES: Record<string, MultiChainBalanceResult> = {
  SHIT: EMPTY,
  sSHIT: EMPTY,
  wstSHIT: EMPTY,
  wsSHIT: EMPTY,
  "SHIT v1": EMPTY,
  "sSHIT v1": EMPTY,
};

// Legacy: wallet with old v1 tokens needing migration
export const LEGACY_BALANCES: Record<string, MultiChainBalanceResult> = {
  SHIT: EMPTY,
  sSHIT: EMPTY,
  wstSHIT: EMPTY,
  wsSHIT: result([bal(base.id, "Base", "5.0", 18)]),
  "SHIT v1": result([bal(base.id, "Base", "125.0", 9)]),
  "sSHIT v1": result([bal(base.id, "Base", "50.0", 9)]),
};

// Multi-chain: wstSHIT on Base
export const MULTI_CHAIN_BALANCES: Record<string, MultiChainBalanceResult> = {
  SHIT: result([bal(base.id, "Base", "5.0", 9)]),
  sSHIT: EMPTY,
  wstSHIT: result([bal(base.id, "Base", "5.9", 18)]),
  wsSHIT: EMPTY,
  "SHIT v1": EMPTY,
  "sSHIT v1": EMPTY,
};
