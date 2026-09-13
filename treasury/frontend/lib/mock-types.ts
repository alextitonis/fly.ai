import type { MultiChainBalanceResult } from "@/hooks/use-multi-chain-balance";

export type MockPrices = {
  shitPrice: number;
  gshitPrice: number;
  currentIndex: number;
};

export type MockBalances = {
  [tokenSymbol: string]: MultiChainBalanceResult;
};


export type MockScenario = {
  name: string;
  description: string;
  isConnected: boolean;
  prices: MockPrices;
  balances: MockBalances;
};

export type MockData = {
  scenario: MockScenario;
};
