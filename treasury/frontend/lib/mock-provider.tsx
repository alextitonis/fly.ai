import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { MockData, MockScenario } from "./mock-types";
import { getScenarioFromUrl, SCENARIOS } from "./mock-scenarios";

type MockContextValue = {
  /** Mock data if enabled, undefined if disabled */
  data: MockData | undefined;
  /** Whether mock mode is currently active */
  enabled: boolean;
  /** Toggle mock mode on/off */
  setEnabled: (enabled: boolean) => void;
  /** Current scenario */
  scenario: MockScenario;
  /** Switch to a different scenario */
  setScenario: (name: string) => void;
};

const MockContext = createContext<MockContextValue | undefined>(undefined);

/**
 * Returns mock data if mock mode is enabled, undefined otherwise.
 * Hooks should check this first and return fixture data if present.
 */
export function useMockData(): MockData | undefined {
  const ctx = useContext(MockContext);
  return ctx?.data;
}

/**
 * Returns dev toolbar controls. Only available inside DevMockProvider.
 */
export function useMockControls() {
  return useContext(MockContext);
}

/**
 * Wraps the app in dev mode. Provides mock data controls without
 * requiring any environment variables — controlled via the dev toolbar.
 * Mock mode defaults to OFF (real RPC calls work normally).
 */
export function DevMockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    // Auto-enable if ?scenario= is in the URL
    const params = new URLSearchParams(window.location.search);
    const hashSearch = window.location.hash.split("?")[1];
    const hashParams = hashSearch ? new URLSearchParams(hashSearch) : null;
    return !!(params.get("scenario") ?? hashParams?.get("scenario"));
  });

  const [scenario, setScenarioState] = useState<MockScenario>(getScenarioFromUrl);

  const setScenario = useCallback((name: string) => {
    const next = SCENARIOS[name];
    if (next) setScenarioState(next);
  }, []);

  const value: MockContextValue = {
    data: enabled ? { scenario } : undefined,
    enabled,
    setEnabled,
    scenario,
    setScenario,
  };

  return <MockContext.Provider value={value}>{children}</MockContext.Provider>;
}
