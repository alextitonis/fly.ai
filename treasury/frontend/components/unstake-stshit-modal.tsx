import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useChainId } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui-dialog";
import {
  TransactionStepperDialog,
  TransactionSuccessDialog,
  type TransactionStep,
} from "@/components/transaction-steps";
import { Button } from "@/components/ui-button";
import { TokenBigInput } from "@/components/ui-token-big-input";
import { useToken } from "@/hooks/use-token";
import { useTokenAllowance } from "@/hooks/use-token-allowance";
import { useTokenApproval } from "@/hooks/use-token-approval";
import { useUnstakeV1 } from "@/hooks/use-unstake-v1";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TokenName, getTokenAddress } from "@/lib/tokens";

interface UnstakeStShitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHIT_DECIMALS = 9;

export function UnstakeStShitModal({ isOpen, onClose }: UnstakeStShitModalProps) {
  const { address } = useConnectedAddress();
  const chainId = useChainId();
  const [amount, setAmount] = useState("");
  const [showSteps, setShowSteps] = useState(false);

  const stakingV1 = getContractAddress(ContractName.STAKING_V1, chainId);
  const sshitV1Address = getTokenAddress(TokenName.V1_SSHIT, chainId);

  const sshitToken = useToken(TokenName.V1_SSHIT, address);
  const shitToken = useToken(TokenName.SHIT);
  // sSHIT v1 has no price feed; show value using the SHIT price (1:1 with SHIT v1).
  const inputToken = useMemo(
    () => ({ ...sshitToken, price: shitToken.price }),
    [sshitToken, shitToken.price],
  );

  const balance = sshitToken.balance ?? 0n;

  const amountBigInt = useMemo(() => {
    if (!amount) return 0n;
    try {
      return parseUnits(amount, SHIT_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  // Unstaking is 1:1 — you receive the same amount of SHIT v1.
  const receiveAmount = amount || "0";

  const { allowance, queryKey } = useTokenAllowance(
    sshitV1Address ?? zeroAddress,
    address,
    stakingV1,
  );
  const hasSufficientAllowance = allowance !== undefined && allowance >= amountBigInt;

  const {
    approve,
    isPending: isApproving,
    isSuccess: approvalSuccess,
    hash: approvalHash,
    reset: resetApproval,
  } = useTokenApproval();

  const {
    unstake,
    isPending: isUnstaking,
    isSuccess: unstakeSuccess,
    hash: unstakeHash,
    reset: resetUnstake,
  } = useUnstakeV1();

  const currentStep = hasSufficientAllowance || approvalSuccess ? 2 : 1;

  const inputButton = useMemo(() => {
    if (!address) return { disabled: true, label: "Sign In" };
    if (!amount || amountBigInt === 0n) return { disabled: true, label: "Enter Amount" };
    if (amountBigInt > balance) return { disabled: true, label: "Insufficient sSHIT v1 Balance" };
    return { disabled: false, label: "Unstake to SHIT v1" };
  }, [address, amount, amountBigInt, balance]);

  const handleMax = () => setAmount(formatUnits(balance, SHIT_DECIMALS));

  const handleApprove = () => {
    if (!sshitV1Address || !stakingV1) return;
    approve({ tokenAddress: sshitV1Address, spender: stakingV1, amount: amountBigInt, queryKey });
  };

  const handleUnstake = () => {
    unstake({ amount: amountBigInt, queryKey });
  };

  const handleClose = () => onClose();

  // Reset all state once the modal is closed so reopening starts fresh (not on success).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset fns are stable enough; only re-run on open/close
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setShowSteps(false);
      resetApproval();
      resetUnstake();
    }
  }, [isOpen]);

  const steps: TransactionStep[] = [
    {
      number: 1,
      title: "Approve sSHIT v1",
      isActive: currentStep === 1,
      isCompleted: currentStep > 1,
      isLoading: currentStep === 1 && isApproving,
      hash: approvalSuccess ? approvalHash : undefined,
    },
    {
      number: 2,
      title: "Unstake to SHIT v1",
      badges: [{ label: `-${amount} sSHIT v1` }, { label: `+${receiveAmount} SHIT v1` }],
      isActive: currentStep === 2,
      isCompleted: unstakeSuccess,
      isLoading: currentStep === 2 && isUnstaking,
      hash: unstakeSuccess ? unstakeHash : undefined,
    },
  ];

  // Success state.
  if (unstakeSuccess) {
    return (
      <TransactionSuccessDialog
        isOpen={isOpen}
        onClose={handleClose}
        title="Congrats, all done!"
        description="Your sSHIT v1 has been unstaked to SHIT v1 — you can now migrate it."
        steps={steps}
      />
    );
  }

  // Stepper phase.
  if (showSteps) {
    return (
      <TransactionStepperDialog
        isOpen={isOpen}
        onClose={handleClose}
        title="Unstake sSHIT v1"
        currentStep={currentStep}
        steps={steps}
        showBusyNotice={currentStep === 2 && isUnstaking}
        button={{
          label: currentStep === 2 ? "Unstake to SHIT v1" : "Approve sSHIT v1",
          busyLabel: isApproving
            ? "Confirming Approval In Your Wallet"
            : "Confirming Unstake In Your Wallet",
          isBusy: isApproving || isUnstaking,
          onClick: currentStep === 1 ? handleApprove : handleUnstake,
        }}
      />
    );
  }

  // Input phase.
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full sm:max-w-md mx-auto p-6 gap-4">
        <DialogHeader className="text-center !gap-2">
          <DialogTitle className="text-[20px]/[24px] font-semibold text-primary-t">
            Unstake sSHIT v1
          </DialogTitle>
          <p className="text-xs/4 font-normal text-secondary-t">
            Convert sSHIT v1 to SHIT v1 (1:1) so you can migrate it to SHIT v2.
          </p>
        </DialogHeader>

        <TokenBigInput
          label="Unstake"
          token={inputToken}
          value={amount}
          onChange={(val) => setAmount(val)}
          onMax={handleMax}
        />

        <div className="flex justify-between text-sm px-1">
          <span className="text-secondary-t">You receive</span>
          <span className="font-semibold text-primary-t">≈ {receiveAmount} SHIT v1</span>
        </div>

        <Button
          onClick={() => setShowSteps(true)}
          disabled={inputButton.disabled}
          className="w-full"
        >
          {inputButton.label}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
