import { Routes, Route, Link } from "react-router-dom";
import Markets from "./pages/Markets";
import Market from "./pages/Market";
import CreateMarket from "./pages/CreateMarket";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { useMUSDBalance } from "./hooks/useContracts";

// QueryClient initialization moved to main.jsx

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);

  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: musdBalance } = useMUSDBalance();

  // Sepolia Chain ID
  const SEPOLIA_CHAIN_ID = 11155111;
  const isWrongNetwork = isConnected && chainId !== SEPOLIA_CHAIN_ID;

  const handleWalletConnect = () => {
    if (isConnected) {
      if (isWrongNetwork) {
        switchChain({ chainId: SEPOLIA_CHAIN_ID });
      } else {
        disconnect();
      }
    } else {
      connect({ connector: injected() });
    }
  };

  return (
    <header className="glass-header sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-white font-bold text-lg">LVR Markets</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              to="/markets"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Markets
            </Link>
            <Link
              to="/create"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Create
            </Link>
            <Link
              to="/dashboard"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Profile
            </Link>
          </nav>

          {/* Right side: Wallet */}
          <div className="hidden md:flex items-center gap-4">
            {isConnected && !isWrongNetwork && (
              <div className="hidden md:block text-right">
                <p className="text-xs text-slate-500">Balance</p>
                <p className="text-sm font-medium text-emerald-400">
                  ${Number(musdBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <div className="relative">
              <button
                onClick={handleWalletConnect}
                className={`pill-btn transition-all ${isConnected && !isWrongNetwork
                  ? "text-indigo-400 hover:bg-indigo-500/20"
                  : isWrongNetwork
                    ? "bg-red-500/20 text-red-400 border-red-500/50"
                    : "bg-primary text-black pill-btn-primary"
                  }`}
                style={isConnected && !isWrongNetwork ? { backgroundColor: "rgba(99, 102, 241, 0.1)", borderColor: "rgba(99, 102, 241, 0.3)" } : undefined}
              >
                {isConnected ? (
                  isWrongNetwork ? (
                    "Switch Network"
                  ) : (
                    <span className="flex items-center gap-2">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                      <ChevronDown size={16} />
                    </span>
                  )
                ) : (
                  "Connect Wallet"
                )}
              </button>

              {isConnected && !isWrongNetwork && walletDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-card rounded-lg shadow-lg" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <div className="p-3" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                    <p className="text-xs text-slate-500">Wallet Address</p>
                    <p className="text-sm text-white font-mono break-all">
                      {address}
                    </p>
                  </div>
                  <button
                    onClick={() => disconnect()}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-secondary transition-colors"
                    style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-white/6 py-4 space-y-3">
          <Link
            to="/markets"
            className="block text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Markets
          </Link>
          <Link
            to="/create"
            className="block text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Create
          </Link>
          <Link
            to="/dashboard"
            className="block text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Profile
          </Link>

          {isConnected && !isWrongNetwork && (
            <div className="flex justify-between items-center px-4 py-2 bg-secondary/30 rounded-lg">
              <span className="text-slate-400 text-sm">Balance</span>
              <span className="text-emerald-400 font-medium">
                ${Number(musdBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <button
            onClick={handleWalletConnect}
            className={`w-full pill-btn mt-2 ${isWrongNetwork ? "bg-red-500/20 text-red-400" : "pill-btn-primary"}`}
          >
            {isConnected
              ? (isWrongNetwork ? "Switch to Sepolia" : "Disconnect")
              : "Connect Wallet"
            }
          </button>
        </nav>
      )}
    </header>
  );
};

const Layout = ({ children }) => (
  <div className="min-h-screen bg-background">
    <Header />
    {children}
  </div>
);

const App = () => (
  <Routes>
    <Route
      path="/"
      element={
        <Layout>
          <Markets />
        </Layout>
      }
    />
    <Route
      path="/markets"
      element={
        <Layout>
          <Markets />
        </Layout>
      }
    />
    <Route
      path="/market/:id"
      element={
        <Layout>
          <Market />
        </Layout>
      }
    />
    <Route
      path="/create"
      element={
        <Layout>
          <CreateMarket />
        </Layout>
      }
    />
    <Route
      path="/dashboard"
      element={
        <Layout>
          <Dashboard />
        </Layout>
      }
    />
    <Route
      path="*"
      element={
        <Layout>
          <NotFound />
        </Layout>
      }
    />
  </Routes>
);

export default App;
