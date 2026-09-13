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
import { useMigrate } from "@/hooks/use-migrate";
import { usePreviewMigrate } from "@/hooks/use-preview-migrate";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TokenName, getTokenAddress } from "@/lib/tokens";
import { formatTokenDisplay } from "@/lib/math";
import type { MigrationClaim } from "@/hooks/use-migration-claim";

interface MigrateshitModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: MigrationClaim;
  /** Remaining allocation = allocated − already migrated (raw, 9 decimals). */
  remaining: bigint;
  /** The migrator's global remaining SHIT v2 mint approval (raw, 9 decimals). The
   * contract reverts with CapExceeded when the converted output exceeds this. */
  remainingMintApproval?: bigint;
}

const SHIT_DECIMALS = 9;

function bigMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function formatShit(value: bigint): string {
  return formatTokenDisplay(value, SHIT_DECIMALS, { digits: 4 });
}

export function MigrateshitModal({
  isOpen,
  onClose,
  claim,
  remaining,
  remainingMintApproval,
}: MigrateshitModalProps) {
  const { address } = useConnectedAddress();
  const chainId = useChainId();
  const [amount, setAmount] = useState("");
  const [showSteps, setShowSteps] = useState(false);

  const migrator = getContractAddress(ContractName.SHIT_V1_MIGRATOR, chainId);
  const shitV1Address = getTokenAddress(TokenName.V1_SHIT, chainId);

  const v1Token = useToken(TokenName.V1_SHIT, address);
  const shitToken = useToken(TokenName.SHIT);
  // V1 SHIT has no price feed; show value using the SHIT v2 price.
  const inputToken = useMemo(
    () => ({ ...v1Token, price: shitToken.price }),
    [v1Token, shitToken.price],
  );

  const balance = v1Token.balance ?? 0n;
  const maxMigratable = bigMin(remaining, balance);

  const amountBigInt = useMemo(() => {
    if (!amount) return 0n;
    try {
      return parseUnits(amount, SHIT_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { shitV2Out } = usePreviewMigrate(amountBigInt);
  const receiveAmount = shitV2Out !== undefined ? formatShit(shitV2Out) : "0";

  const { allowance, queryKey } = useTokenAllowance(shitV1Address ?? zeroAddress, address, migrator);
  const hasSufficientAllowance = allowance !== undefined && allowance >= amountBigInt;

  const {
    approve,
    isPending: isApproving,
    isSuccess: approvalSuccess,
    hash: approvalHash,
    reset: resetApproval,
  } = useTokenApproval();

  const {
    migrate,
    isPending: isMigrating,
    isSuccess: migrateSuccess,
    hash: migrateHash,
    reset: resetMigrate,
  } = useMigrate();

  const currentStep = hasSufficientAllowance || approvalSuccess ? 2 : 1;

  // Phase 1 (input) button gating.
  const inputButton = useMemo(() => {
    if (!address) return { disabled: true, label: "Sign In" };
    if (!amount || amountBigInt === 0n) return { disabled: true, label: "Enter Amount" };
    if (amountBigInt > balance) return { disabled: true, label: "Insufficient SHIT v1 Balance" };
    if (amountBigInt > remaining) return { disabled: true, label: "Exceeds Allocation" };
    // The migrator reverts with CapExceeded when the converted SHIT v2 output exceeds
    // its global remaining mint approval — block that here instead of on-chain.
    if (
      remainingMintApproval !== undefined &&
      shitV2Out !== undefined &&
      shitV2Out > remainingMintApproval
    ) {
      return { disabled: true, label: "Exceeds Migrator Capacity" };
    }
    return { disabled: false, label: "Migrate to SHIT v2" };
  }, [address, amount, amountBigInt, balance, remaining, remainingMintApproval, shitV2Out]);

  const handleMax = () => setAmount(formatUnits(maxMigratable, SHIT_DECIMALS));

  const handleApprove = () => {
    if (!shitV1Address || !migrator) return;
    approve({ tokenAddress: shitV1Address, spender: migrator, amount: amountBigInt, queryKey });
  };

  const handleMigrate = () => {
    migrate({
      amount: amountBigInt,
      proof: claim.proof,
      allocatedAmount: claim.allocatedAmount,
      queryKey,
    });
  };

  const handleClose = () => onClose();

  // When the modal is closed, reset all transaction + input state so reopening starts
  // fresh instead of being stuck on the success screen. Runs once closed (content is
  // already unmounted), so there's no success→input flash during the close animation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset fns are stable enough; only re-run on open/close
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setShowSteps(false);
      resetApproval();
      resetMigrate();
    }
  }, [isOpen]);

  const steps: TransactionStep[] = [
    {
      number: 1,
      title: "Approve SHIT v1",
      isActive: currentStep === 1,
      isCompleted: currentStep > 1,
      isLoading: currentStep === 1 && isApproving,
      hash: approvalSuccess ? approvalHash : undefined,
    },
    {
      number: 2,
      title: "Migrate to SHIT v2",
      badges: [{ label: `-${amount} SHIT v1` }, { label: `+${receiveAmount} SHIT v2` }],
      isActive: currentStep === 2,
      isCompleted: migrateSuccess,
      isLoading: currentStep === 2 && isMigrating,
      hash: migrateSuccess ? migrateHash : undefined,
    },
  ];

  // Success state — canonical "congrats" screen.
  if (migrateSuccess) {
    return (
      <TransactionSuccessDialog
        isOpen={isOpen}
        onClose={handleClose}
        title="Congrats, all done!"
        description="Your transactions have been executed."
        steps={steps}
      />
    );
  }

  // Phase 2 — canonical multi-transaction stepper.
  if (showSteps) {
    return (
      <TransactionStepperDialog
        isOpen={isOpen}
        onClose={handleClose}
        title="Migrate SHIT v1 → v2"
        currentStep={currentStep}
        steps={steps}
        showBusyNotice={currentStep === 2 && isMigrating}
        button={{
          label: currentStep === 2 ? "Migrate to SHIT v2" : "Approve SHIT v1",
          busyLabel: isApproving
            ? "Confirming Approval In Your Wallet"
            : "Confirming Migration In Your Wallet",
          isBusy: isApproving || isMigrating,
          onClick: currentStep === 1 ? handleApprove : handleMigrate,
        }}
      />
    );
  }

  // Phase 1 — amount entry.
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full sm:max-w-md mx-auto p-6 gap-4">
        <DialogHeader className="text-center !gap-2">
          <DialogTitle className="text-[20px]/[24px] font-semibold text-primary-t">
            Migrate SHIT v1 → v2
          </DialogTitle>
        </DialogHeader>

        {/* Allocation summary */}
        <div className="rounded-2xl bg-surface-a3 border border-a3-b p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-secondary-t">Total allocation</span>
            <span className="font-semibold text-primary-t">
              {formatShit(claim.allocatedAmount)} SHIT v1
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Remaining to migrate</span>
            <span className="font-semibold text-primary-t">{formatShit(remaining)} SHIT v1</span>
          </div>
        </div>

        <TokenBigInput
          label="Migrate"
          token={inputToken}
          value={amount}
          onChange={(val) => setAmount(val)}
          onMax={handleMax}
        />

        <div className="flex justify-between text-sm px-1">
          <span className="text-secondary-t">You receive</span>
          <span className="font-semibold text-primary-t">≈ {receiveAmount} SHIT v2</span>
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
