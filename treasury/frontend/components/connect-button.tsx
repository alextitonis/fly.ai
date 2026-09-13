import { useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { Button } from "@/components/ui-button";
import { Icon } from "@/components/icon";
import { ChainIcon } from "@/components/chain-icon";
import { allChains } from "@/lib/chains";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Connect button using Reown AppKit (WalletConnect) for wallet connection.
 * No Privy dependency.
 */
export function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useConnectedAddress();
  const { disconnect } = useDisconnect();

  const activeChain = allChains.find((c) => c.id === chainId);
  const isWrongNetwork = isConnected && !activeChain;
  const connected = address && isConnected;

  const handleDisconnect = () => {
    disconnect();
  };

  if (!connected) {
    return (
      <Button onClick={() => open()} size="md">
        <Icon name="WalletIcon" size={16} className="mr-2" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isWrongNetwork ? (
        <Button onClick={() => open()} variant="destructive" size="md">
          Wrong Network
        </Button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-a10 px-3 py-2">
          {activeChain && <ChainIcon chainId={activeChain.id} />}
          <span className="font-mono text-sm text-primary-t">{shortenAddress(address!)}</span>
        </div>
      )}
      <Button onClick={handleDisconnect} variant="secondary" size="md">
        Disconnect
      </Button>
    </div>
  );
}
