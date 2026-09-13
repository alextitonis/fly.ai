import { useState } from "react";
import { useChainId, useWaitForTransactionReceipt } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { parseUnits } from "viem";

import { Button } from "@/components/ui-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-dialog";
import { Input } from "@/components/ui-input";
import { requireTokenAddress, TokenName, TOKENS } from "@/lib/tokens";
import { useTransactionToast, type TransactionToastConfig } from "@/hooks/use-transaction-toast";
import MockERC20Abi from "@/abis/MockERC20";

interface MintTestnetUsdsModalProps {
  trigger: React.ReactElement;
}

export function MintTestnetUsdsModal({ trigger }: MintTestnetUsdsModalProps) {
  const [amount, setAmount] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { address } = useConnectedAddress();
  const chainId = useChainId();

  const {
    data: hash,
    writeContractAsync,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = usePrivyWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  // Toast configuration for minting transactions
  const toastConfig: TransactionToastConfig = {
    pending: {
      title: "Minting testnet USDC...",
      description: "Please wait while your transaction is confirmed.",
    },
    success: {
      title: "USDC minted successfully!",
      description: `${amount} testnet USDC has been minted to your wallet.`,
    },
    error: {
      title: "Minting failed",
      description: "There was an error minting testnet USDC. Please try again.",
      userRejected: {
        title: "Transaction cancelled",
        description: "You cancelled the minting transaction.",
      },
      insufficientFunds: {
        title: "Insufficient funds",
        description: "You don't have enough ETH for gas fees.",
      },
    },
  };

  // Handle toast notifications
  const { reset: resetToast } = useTransactionToast({
    hash,
    isWritePending,
    isConfirmed,
    writeError,
    confirmError,
    config: toastConfig,
  });

  const handleMint = async () => {
    if (!address || !amount) return;

    const usdsAddress = requireTokenAddress(TokenName.USDC, chainId);
    const amountBigInt = parseUnits(amount, TOKENS[TokenName.USDC].decimals);

    // Reset states for new transaction
    resetWrite();
    resetToast();

    try {
      await writeContractAsync({
        address: usdsAddress,
        abi: MockERC20Abi,
        functionName: "mint",
        args: [address, amountBigInt],
      });
      setAmount("");
      setIsOpen(false);
    } catch {
      // Error is already set in state by the hook
    }
  };

  const isPending = isWritePending || isConfirming;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint Testnet USDC</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="amount" className="text-sm font-medium">
              Amount
            </label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount to mint"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            onClick={handleMint}
            disabled={!address || !amount || isPending}
            className="w-full"
          >
            {isPending ? "Minting..." : "Mint USDC"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
