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
import { getTokenAddress, TokenName, TOKENS } from "@/lib/tokens";
import { useTransactionToast, type TransactionToastConfig } from "@/hooks/use-transaction-toast";
import MockERC20Abi from "@/abis/MockERC20";

interface MintTestnetShitModalProps {
  trigger: React.ReactElement;
  token?: TokenName.SHIT | TokenName.WSTSHIT;
}

export function MintTestnetShitModal({ trigger, token = TokenName.SHIT }: MintTestnetShitModalProps) {
  const [amount, setAmount] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { address } = useConnectedAddress();
  const chainId = useChainId();

  const tokenInfo = TOKENS[token];
  const tokenAddress = getTokenAddress(token, chainId);

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

  const toastConfig: TransactionToastConfig = {
    pending: {
      title: `Minting testnet ${tokenInfo.symbol}...`,
      description: "Please wait while your transaction is confirmed.",
    },
    success: {
      title: `${tokenInfo.symbol} minted successfully!`,
      description: `${amount} testnet ${tokenInfo.symbol} has been minted to your wallet.`,
    },
    error: {
      title: "Minting failed",
      description: `There was an error minting testnet ${tokenInfo.symbol}. Please try again.`,
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

  const { reset: resetToast } = useTransactionToast({
    hash,
    isWritePending,
    isConfirmed,
    writeError,
    confirmError,
    config: toastConfig,
  });

  const handleMint = async () => {
    if (!address || !amount || !tokenAddress) return;

    const amountBigInt = parseUnits(amount, tokenInfo.decimals);

    resetWrite();
    resetToast();

    try {
      await writeContractAsync({
        address: tokenAddress,
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
          <DialogTitle>Mint Testnet {tokenInfo.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="amount" className="text-sm font-medium">
              Amount
            </label>
            <Input
              id="amount"
              type="number"
              placeholder={`Enter amount to mint`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            onClick={handleMint}
            disabled={!address || !amount || isPending || !tokenAddress}
            className="w-full"
          >
            {isPending ? "Minting..." : `Mint ${tokenInfo.symbol}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
