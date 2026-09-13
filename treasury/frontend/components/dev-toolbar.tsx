import { useState } from "react";
import { useMockControls } from "@/lib/mock-provider";
import { SCENARIOS } from "@/lib/mock-scenarios";
import { ChevronUp, ChevronDown, FlaskConical, Coins } from "lucide-react";
import { MintTestnetShitModal } from "@/components/mint-testnet-shit-modal";
import { MintTestnetUsdsModal } from "@/components/mint-testnet-usds-modal";
import { TokenName } from "@/lib/tokens";
import { isTestnetMode, baseSepolia } from "@/lib/chains";
import { useChainId } from "wagmi";

export function DevToolbar() {
  const controls = useMockControls();
  const [collapsed, setCollapsed] = useState(true);

  const chainId = useChainId();
  const isOnSepolia = chainId === baseSepolia.id;

  if (!controls) return null;

  const { enabled, setEnabled, scenario, setScenario } = controls;
  const scenarioNames = Object.keys(SCENARIOS);

  return (
    <div className="fixed bottom-15 right-3 z-[9999] font-mono text-xs">
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-zinc-300 shadow-lg hover:bg-zinc-800 border border-zinc-700"
        >
          <FlaskConical className="size-3.5" />
          <span>Dev</span>
          {enabled && (
            <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">
              Mock
            </span>
          )}
          {isOnSepolia && (
            <span className="ml-1 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] text-white">
              Testnet
            </span>
          )}
          <ChevronUp className="size-3" />
        </button>
      ) : (
        <div className="w-64 rounded-lg bg-zinc-900 text-zinc-300 shadow-lg border border-zinc-700">
          <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <FlaskConical className="size-3.5" />
              <span className="font-semibold">5H1T Dev Tools</span>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded p-0.5 hover:bg-zinc-700"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>

          <div className="space-y-3 p-3">
            {/* Mock data toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span>Mock Data</span>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  enabled ? "bg-emerald-600" : "bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            {/* Scenario selector */}
            {enabled && (
              <div className="space-y-1.5">
                <span className="text-zinc-400">Scenario</span>
                <select
                  value={scenario.name}
                  onChange={(e) => setScenario(e.target.value)}
                  className="w-full rounded bg-zinc-800 border border-zinc-600 px-2 py-1.5 text-zinc-200 outline-none focus:border-zinc-400"
                >
                  {scenarioNames.map((name) => (
                    <option key={name} value={name}>
                      {name} — {SCENARIOS[name].description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Testnet info */}
            <div className="flex items-center justify-between">
              <span>Chain</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] text-white ${
                  isOnSepolia ? "bg-amber-600" : "bg-zinc-600"
                }`}
              >
                {isOnSepolia ? "Base Sepolia" : "Mainnet"}
              </span>
            </div>
            {isTestnetMode && !isOnSepolia && (
              <p className="text-[10px] text-zinc-500">
                Switch to Base Sepolia in your wallet to use faucets
              </p>
            )}

            {/* Mint buttons (visible when connected to Sepolia) */}
            {isOnSepolia && (
              <div className="space-y-1.5">
                <span className="text-zinc-400">Faucet</span>
                <div className="flex gap-1.5">
                  <MintTestnetShitModal
                    token={TokenName.SHIT}
                    trigger={
                      <button
                        type="button"
                        className="flex-1 flex items-center justify-center gap-1 rounded bg-zinc-800 border border-zinc-600 px-2 py-1.5 text-zinc-200 hover:bg-zinc-700"
                      >
                        <Coins className="size-3" />
                        SHIT
                      </button>
                    }
                  />
                  <MintTestnetUsdsModal
                    trigger={
                      <button
                        type="button"
                        className="flex-1 flex items-center justify-center gap-1 rounded bg-zinc-800 border border-zinc-600 px-2 py-1.5 text-zinc-200 hover:bg-zinc-700"
                      >
                        <Coins className="size-3" />
                        USDC
                      </button>
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
