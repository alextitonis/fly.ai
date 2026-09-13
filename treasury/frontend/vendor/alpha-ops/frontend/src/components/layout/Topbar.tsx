import { useWallet } from "../../hooks/useWallet";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function Topbar() {
  const { address, ethBalance, isAvailable, isConnecting, connect, disconnect } =
    useWallet();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
      <h1 className="text-lg font-semibold text-slate-100 tracking-tight">
        AlphaOpsDash
      </h1>

      {!isAvailable && (
        <div className="text-xs text-rose-400">No EVM provider detected</div>
      )}

      {isAvailable && (
        <div className="flex items-center gap-3">
          {address && (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="px-2 py-1 rounded-md bg-slate-800">
                {shortAddr(address)}
              </span>
              {ethBalance && (
                <span className="px-2 py-1 rounded-md bg-slate-900">
                  Ξ {ethBalance} ETH
                </span>
              )}
            </div>
          )}

          {address ? (
            <button
              className="text-xs px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-100"
              onClick={disconnect}
            >
              Disconnect
            </button>
          ) : (
            <button
              disabled={isConnecting}
              className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-slate-100"
              onClick={connect}
            >
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      )}
    </header>
  );
}
