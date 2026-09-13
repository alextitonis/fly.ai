import type { MockScenario } from "./mock-types";
import { DEFAULT_PRICES } from "./mock-fixtures-prices";
import {
  WHALE_BALANCES,
  EMPTY_BALANCES,
  LEGACY_BALANCES,
  MULTI_CHAIN_BALANCES,
} from "./mock-fixtures-balances";

export const SCENARIOS: Record<string, MockScenario> = {
  whale: {
    name: "whale",
    description: "Large SHIT + wstSHIT balances across multiple chains",
    isConnected: true,
    prices: DEFAULT_PRICES,
    balances: WHALE_BALANCES,
  },
  empty: {
    name: "empty",
    description: "Connected wallet with zero balances",
    isConnected: true,
    prices: DEFAULT_PRICES,
    balances: EMPTY_BALANCES,
  },
  legacy: {
    name: "legacy",
    description: "Wallet with v1 SHIT, v1 sSHIT, wsSHIT needing migration",
    isConnected: true,
    prices: DEFAULT_PRICES,
    balances: LEGACY_BALANCES,
  },
  "multi-chain": {
    name: "multi-chain",
    description: "wstSHIT spread across 6 chains",
    isConnected: true,
    prices: DEFAULT_PRICES,
    balances: MULTI_CHAIN_BALANCES,
  },
  disconnected: {
    name: "disconnected",
    description: "No wallet connected",
    isConnected: false,
    prices: DEFAULT_PRICES,
    balances: EMPTY_BALANCES,
  },
};

export function getScenarioFromUrl(): MockScenario {
  const params = new URLSearchParams(window.location.search);
  // Also check hash params for hash-based routing
  const hashSearch = window.location.hash.split("?")[1];
  const hashParams = hashSearch ? new URLSearchParams(hashSearch) : null;

  const scenarioName = params.get("scenario") ?? hashParams?.get("scenario") ?? "whale";

  return SCENARIOS[scenarioName] ?? SCENARIOS.whale;
}
