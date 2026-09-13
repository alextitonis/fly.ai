import { useState, useEffect } from "react";
import { useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { parseUnits, formatUnits, erc20Abi, type Address } from "viem";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { getTokenAddress, TokenName } from "@/lib/tokens";
import { baseSepolia } from "@/lib/chains";
import MockERC20Abi from "@/abis/MockERC20";
import USDCIconUrl from "@/icons/token-AZUSD.webp";

const FAUCET_WORKER_URL = import.meta.env.VITE_ETH_FAUCET_WORKER_URL || "";

interface FaucetToken {
  name: string;
  symbol: string;
  claimAmount: string;
  decimals: number;
  description: string;
  logoUrl?: string;
  iconComponent?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconUrl?: string;
  getAddress: (chainId: number) => Address | undefined;
}

const PROTOCOL_TOKENS: FaucetToken[] = [
  {
    name: "USDC",
    symbol: "USDC",
    claimAmount: "1000",
    decimals: 6,
    description: "Testnet USDC (for bonds)",
    iconUrl: USDCIconUrl,
    getAddress: (chainId) => getTokenAddress(TokenName.USDC, chainId),
  },
];

function getFaucetErrorMessage(tokenSymbol: string, message?: string) {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("max")) {
    return `${tokenSymbol} has reached its testnet mint cap. Try a smaller amount, or the contract may need a new testnet deploy.`;
  }
  if (msg.includes("malicious") || msg.includes("unauthorized") || msg.includes("not authorized") || msg.includes("not a minter")) {
    return `${tokenSymbol} cannot be minted through this faucet. The testnet contract is not configured for public minting.`;
  }
  if (msg.includes("insufficient")) {
    return `You don't have enough testnet ETH for gas.`;
  }
  return message ? message.slice(0, 160) : "The transaction reverted. No tokens were minted.";
}

export function FaucetWidget() {
  const { address, chainId } = useConnectedAddress();

  const isOnBaseSepolia = chainId === baseSepolia.id;

  return (
    <div className="space-y-8">
      {!address && (
        <Card className="p-4 border-yellow/30 bg-yellow/5">
          <p className="text-sm text-secondary-t text-center">
            You need to <span className="font-medium text-primary-t">sign in</span> before you can claim from the faucet.
          </p>
        </Card>
      )}
      {!isOnBaseSepolia && (
        <Card className="p-4 border-yellow/30 bg-yellow/5">
          <p className="text-sm text-secondary-t text-center">
            Switch to <span className="font-medium text-primary-t">Base Sepolia</span> in your wallet to claim tokens.
          </p>
        </Card>
      )}
      <EthFaucetCard address={address} workerUrl={FAUCET_WORKER_URL} />
      <Card className="p-4 border-yellow/30 bg-yellow/5">
        <p className="text-sm text-secondary-t text-center">
          You need testnet ETH for gas fees before claiming tokens or interacting with the protocol. Use the ETH faucet above to get some.
        </p>
      </Card>
      <Card className="p-4 border-yellow/30 bg-yellow/5">
        <p className="text-sm text-secondary-t text-center">
          Click a token to mint it. After your wallet confirms the transaction, return to this page to
          see your balance update. Testnet token contracts may not be verified in your wallet; you can
          proceed.
        </p>
      </Card>
      <div>
        <h3 className="font-serif text-lg mb-4">Protocol testnet tokens</h3>
        <Card className="p-4 mb-4 border-yellow/30 bg-yellow/5">
          <p className="text-sm text-secondary-t">
            <strong className="text-primary-t">5H1T</strong> cannot be minted from the faucet. On testnet, the only way to get SHIT is by purchasing bonds with USDC. Use the faucet above to get USDC, then visit the Bonds page to buy SHIT at a discount.
          </p>
        </Card>
        <div className="grid md:grid-cols-3 gap-4">
          {PROTOCOL_TOKENS.map((token) => (
            <FaucetCard key={token.symbol} token={token} address={address} chainId={chainId ?? baseSepolia.id} />
          ))}
        </div>
      </div>

      <Card className="p-4">
        <p className="text-xs text-tertiary-t text-center">
          These are mock testnet tokens with no real value. Impact token mocks mirror the mainnet contracts for testing purposes.
        </p>
      </Card>
    </div>
  );
}

function EthFaucetCard({ address, workerUrl }: { address: `0x${string}` | undefined; workerUrl: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [faucetInfo, setFaucetInfo] = useState<{ balance: string; dripAmount: string; cooldownHours: string } | null>(null);

  useEffect(() => {
    if (!workerUrl) return;
    fetch(`${workerUrl}/status`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setFaucetInfo({ balance: data.balance, dripAmount: data.dripAmount, cooldownHours: data.cooldownHours });
        }
      })
      .catch(() => {});
  }, [workerUrl]);

  const handleClaim = async () => {
    if (!address || !workerUrl || status === "loading") return;
    setStatus("loading");
    setErrorMsg("");
    setTxHash("");
    try {
      const res = await fetch(`${workerUrl}/drip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("success");
        setTxHash(data.txHash);
        setTimeout(() => setStatus("idle"), 10000);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Failed to claim ETH");
        setTimeout(() => setStatus("idle"), 5000);
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  if (!workerUrl) {
    return (
      <Card className="p-6 border-yellow/30 bg-yellow/5">
        <h3 className="font-serif text-lg mb-2">Testnet ETH Faucet</h3>
        <p className="text-sm text-secondary-t">
          The ETH faucet is being set up. Check back soon to claim testnet ETH for gas fees.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-green/30 bg-green/5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-serif text-lg">Testnet ETH Faucet</h3>
          <p className="text-xs text-secondary-t mt-1">
            {faucetInfo
              ? `Drips ${faucetInfo.dripAmount} ETH every ${faucetInfo.cooldownHours}h`
              : "Loading faucet info..."}
          </p>
        </div>
        {faucetInfo && (
          <div className="text-right">
            <p className="text-xs text-tertiary-t">Faucet balance</p>
            <p className="text-sm font-mono">{parseFloat(faucetInfo.balance).toFixed(4)} ETH</p>
          </div>
        )}
      </div>
      <Button
        onClick={handleClaim}
        disabled={!address || status === "loading"}
        className="w-full"
        variant={status === "success" ? "secondary" : "default"}
      >
        {!address
          ? "Sign in to claim"
          : status === "loading"
            ? "Sending ETH..."
            : status === "success"
              ? "ETH sent! Check your wallet."
              : status === "error"
                ? "Try again"
                : `Claim ${faucetInfo?.dripAmount || "0.001"} testnet ETH`}
      </Button>
      {status === "error" && errorMsg && (
        <p className="text-xs text-red mt-2 text-center">{errorMsg}</p>
      )}
      {status === "success" && txHash && (
        <p className="text-xs text-green mt-2 text-center">
          Transaction:{" "}
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        </p>
      )}
    </Card>
  );
}

function FaucetCard({ token, address, chainId }: { token: FaucetToken; address: `0x${string}` | undefined; chainId: number }) {
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);

  const tokenAddress = token.getAddress(chainId);

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!tokenAddress && !!address },
  });

  const cooldownKey = `faucet-${token.symbol}-${address?.toLowerCase() ?? ""}`;

  useEffect(() => {
    const stored = localStorage.getItem(cooldownKey);
    if (stored) {
      const endsAt = parseInt(stored, 10);
      if (Date.now() < endsAt) {
        setCooldownEndsAt(endsAt);
      } else {
        localStorage.removeItem(cooldownKey);
      }
    }
  }, [cooldownKey]);

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const interval = setInterval(() => {
      if (Date.now() >= cooldownEndsAt) {
        setCooldownEndsAt(null);
        localStorage.removeItem(cooldownKey);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEndsAt, cooldownKey]);

  const remainingMs = cooldownEndsAt ? cooldownEndsAt - Date.now() : 0;
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  const {
    data: hash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = usePrivyWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isReceiptFetched,
  } = useWaitForTransactionReceipt({ hash, confirmations: 1 });
  const txSuccess = isReceiptFetched && receipt?.status === "success";
  const txReverted = isReceiptFetched && receipt?.status === "reverted";

  useEffect(() => {
    if (!txSuccess) return;
    const endsAt = Date.now() + 24 * 60 * 60 * 1000;
    setCooldownEndsAt(endsAt);
    localStorage.setItem(cooldownKey, endsAt.toString());
  }, [txSuccess, cooldownKey]);

  const handleClaim = () => {
    if (!address || !tokenAddress || cooldownEndsAt) return;
    resetWrite();
    const amountBigInt = parseUnits(token.claimAmount, token.decimals);
    writeContract({
      address: tokenAddress,
      abi: MockERC20Abi,
      functionName: "mint",
      args: [address, amountBigInt],
    });
  };

  const handleAddToWallet = async () => {
    if (!tokenAddress) return;
    try {
      // Use wagmi's useWalletClient to get the wallet client from Privy's
      // connection, rather than calling window.ethereum directly (which would
      // bypass Privy and hit the injected wallet like MetaMask).
      const { getWalletClient } = await import("@wagmi/core");
      const { config } = await import("@/lib/wagmi-config");
      const walletClient = await getWalletClient(config);
      if (!walletClient) return;
      await walletClient.watchAsset({
        type: "ERC20",
        options: {
          address: tokenAddress,
          symbol: token.symbol,
          decimals: token.decimals,
          image: token.logoUrl ?? token.iconUrl ?? "",
        },
      });
    } catch {
      // Wallet may not support wallet_watchAsset
    }
  };

  const isPending = isWritePending || isConfirming;
  const balanceFormatted = balance ? formatUnits(balance, token.decimals) : "0";

  return (
    <Card className="p-6 flex flex-col items-center text-center">
      {token.logoUrl || token.iconUrl ? (
        <img src={token.logoUrl ?? token.iconUrl} alt={token.symbol} className="size-12 rounded-full mb-3 object-cover" />
      ) : token.iconComponent ? (
        <div className="size-12 rounded-full bg-surface-a3 flex items-center justify-center mb-3 overflow-hidden">
          {(() => {
            const IconComp = token.iconComponent;
            return <IconComp width={32} height={32} />;
          })()}
        </div>
      ) : (
        <div className="size-12 rounded-full bg-surface-a3 flex items-center justify-center mb-3">
          <span className="text-sm font-bold text-primary-t">{token.symbol.slice(0, 3)}</span>
        </div>
      )}
      <h3 className="font-semibold text-base">{token.name}</h3>
      <p className="text-xs text-tertiary-t mb-1">{token.symbol}</p>
      <p className="text-xs text-tertiary-t mb-1">{token.description}</p>
      <p className="text-xs text-tertiary-t mb-4">
        Balance: <span className="font-mono">{Number(balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
      </p>
      <Button
        onClick={handleClaim}
        disabled={!address || isPending || !tokenAddress || cooldownEndsAt !== null || txSuccess}
        className={txSuccess ? "w-full !text-primary-t" : "w-full"}
        variant={txSuccess ? "secondary" : "default"}
      >
        {!address
          ? "Sign in to claim"
          : isPending
            ? "Claiming..."
            : txSuccess
              ? "Claimed"
              : txReverted
                ? "Mint failed — try again"
                : cooldownEndsAt !== null
                  ? `Cooldown: ${remainingHours}h ${remainingMinutes}m`
                  : `Claim ${token.claimAmount} ${token.symbol}`}
      </Button>
      {txReverted && (
        <p className="text-xs text-red mt-2">{getFaucetErrorMessage(token.symbol, writeError?.message)}</p>
      )}
      {writeError && !txReverted && (
        <p className="text-xs text-red mt-2">{getFaucetErrorMessage(token.symbol, writeError.message)}</p>
      )}
      {txSuccess && (
        <div className="mt-3 w-full space-y-2">
          <p className="text-xs text-primary-t">
            Tokens minted. Add {token.symbol} to your wallet to see it.
          </p>
          <Button onClick={handleAddToWallet} variant="secondary" size="sm" className="w-full">
            Add {token.symbol} to wallet
          </Button>
          <a
            href="#/dashboard"
            onClick={() => window.scrollTo(0, 0)}
            className="block w-full text-center text-xs text-yellow hover:underline"
          >
            Use it in the Dashboard
          </a>
        </div>
      )}
    </Card>
  );
}
