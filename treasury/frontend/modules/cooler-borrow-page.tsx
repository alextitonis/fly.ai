import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { parseUnits, formatUnits } from "viem";
import { CheckIcon, Loader2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui-tabs";
import { Button } from "@/components/ui-button";
import { Slider } from "@/components/ui-slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui-dialog";
import { TokenBigInput } from "@/components/ui-token-big-input";
import { NumberFlow } from "@/components/ui-number-flow";
import { Icon } from "@/components/icon";
import { TooltipInfo } from "@/components/ui-tooltip";
import { useMonoCoolerPosition } from "@/hooks/cooler-useMonoCoolerPosition";
import { useMonoCoolerCalculations } from "@/hooks/cooler-useMonoCoolerCalculations";
import { useMonoCoolerCapacity } from "@/hooks/cooler-useMonoCoolerCapacity";
import { useMonoCoolerDebt, calculateRepayAmount } from "@/hooks/cooler-useMonoCoolerDebt";
import { useMonoCoolerAuthorization } from "@/hooks/cooler-useMonoCoolerAuthorization";
import { useIsSmartContractWallet } from "@/hooks/cooler-useIsSmartContractWallet";
import { getContractAddress, ContractName } from "@/lib/contracts";
import { formatTokenAmount } from "@/lib/math";
import { trackCoolerBorrow, trackCoolerRepay } from "@/lib/analytics";
import { useToken } from "@/hooks/use-token";
import { useTokenAllowance } from "@/hooks/use-token-allowance";
import { useTokenApproval } from "@/hooks/use-token-approval";
import { TokenName } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { blockExplorerTxBaseUrl } from "@/lib/helpers";
import { DashboardActions } from "@/components/dashboard-actions";
import type { Format } from "@number-flow/react";
import type { MonoCoolerCalculations } from "@/hooks/cooler-useMonoCoolerCalculations";

const ZERO = 0n;

// ─── Borrow stats bar ───

type Stat = {
  label: string;
  value: number | null;
  format: Format;
  suffix?: string;
  loading?: boolean;
};

function bigintToNumber(value: bigint): number {
  return formatTokenAmount(value);
}

function BorrowStatsBar() {
  const { position, isLoading } = useMonoCoolerPosition();
  const { globalCapacity, isLoading: capacityLoading } = useMonoCoolerCapacity();

  const stats: Stat[] = [
    {
      label: "Capacity Remaining",
      value: globalCapacity !== undefined ? bigintToNumber(globalCapacity) : null,
      format: { style: "decimal", maximumFractionDigits: 0 },
      suffix: "USDC",
      loading: capacityLoading,
    },
    {
      label: "Borrow per wstSHIT",
      value: position ? bigintToNumber(position.maxOriginationLtv) : null,
      format: { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 },
      suffix: "USDC",
    },
    {
      label: "Borrow Rate",
      value: position ? position.interestRateBps / 100 : null,
      format: { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 },
      suffix: "%",
    },
    {
      label: "Amount Borrowed",
      value: position ? bigintToNumber(position.currentDebt) : null,
      format: { style: "decimal", maximumFractionDigits: 0 },
      suffix: "USDC",
    },
  ];

  return (
    <div data-slot="stats-bar" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="flex flex-col gap-1 px-6 py-5">
          <p className="text-base font-normal text-secondary-t">{stat.label}</p>
          <NumberFlow
            className="text-xl/[24px] font-semibold tracking-[0.2px]"
            value={(stat.loading ?? isLoading) || stat.value === null ? "-" : stat.value}
            format={stat.format}
            suffix={stat.suffix}
            suffixNoSpace={stat.suffix === "%"}
          />
        </Card>
      ))}
    </div>
  );
}

// ─── LTV slider ───

function BorrowLtvSlider({ ltvPercentage, onLtvChange, isRepayMode }: { ltvPercentage: number; onLtvChange: (value: number) => void; isRepayMode: boolean }) {
  return (
    <div data-slot="ltv-slider" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {isRepayMode ? "Collateral to Withdraw" : "Loan to Collateral"}
        </p>
        <p className="text-sm font-semibold">{ltvPercentage.toFixed(0)}%</p>
      </div>
      <Slider
        value={[ltvPercentage]}
        onValueChange={([value]) => onLtvChange(value)}
        min={0}
        max={100}
        step={1}
      />
    </div>
  );
}

// ─── Position info ───

interface PositionInfoProps {
  projectedCollateral: bigint;
  projectedDebt: bigint;
  liquidationThreshold: bigint;
  projectedLiquidationDate: Date | null;
  availableToBorrow: bigint;
  currentDebt: bigint;
}

function formatGshit(value: bigint): string {
  return formatTokenAmount(value).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatUsds(value: bigint): string {
  return formatTokenAmount(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateLtv(debt: bigint, liquidationThreshold: bigint): string {
  if (liquidationThreshold === 0n) return "0.00";
  const ltv = (formatTokenAmount(debt) / formatTokenAmount(liquidationThreshold)) * 100;
  return ltv.toFixed(2);
}

function formatLiquidationDate(date: Date | null): string {
  if (!date) return "—";
  if (date.getTime() <= Date.now()) return "Now";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BorrowPositionInfo({
  projectedCollateral,
  projectedDebt,
  liquidationThreshold,
  projectedLiquidationDate,
  availableToBorrow,
  currentDebt,
}: PositionInfoProps) {
  const hasPosition = projectedCollateral > 0n || projectedDebt > 0n || currentDebt > 0n;
  const bufferToLiquidation =
    liquidationThreshold > projectedDebt ? liquidationThreshold - projectedDebt : 0n;

  return (
    <div
      data-slot="position-info"
      className="rounded-2xl bg-surface-a3 border border-a3-b px-4 py-4 flex flex-col h-full"
    >
      <h3 className="mb-4 text-sm font-semibold">Projected Position</h3>

      {!hasPosition ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-sm/5 font-semibold text-secondary-t">No position</p>
          <p className="text-xs/4 font-normal text-secondary-t mt-1">
            Add collateral and borrow to open a position.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <InfoRow label="Collateral">
            <div className="flex items-center gap-1.5">
              <Icon name="WSTSHITTokenIcon" className="size-4" />
              <span className="font-medium">{formatGshit(projectedCollateral)} wstSHIT</span>
            </div>
          </InfoRow>

          <InfoRow label="Debt">
            <div className="flex items-center gap-1.5">
              <Icon name="USDCTokenIcon" className="size-4" />
              <span className="font-medium">{formatUsds(projectedDebt)} USDC</span>
            </div>
          </InfoRow>

          <InfoRow label="LTV">
            <span
              className={cn(
                "font-medium",
                Number(calculateLtv(projectedDebt, liquidationThreshold)) > 80
                  ? "text-red"
                  : "text-primary-t",
              )}
            >
              {calculateLtv(projectedDebt, liquidationThreshold)}%
            </span>
          </InfoRow>

          <InfoRow
            label="Buffer to Liquidation"
            tooltip="How much your debt can grow — through accruing interest or new borrows — before the position is liquidated."
          >
            <span className="font-medium">{formatUsds(bufferToLiquidation)} USDC</span>
          </InfoRow>

          <InfoRow
            label="Est. Liquidation Date"
            tooltip='When accruing interest is projected to push your debt to the liquidation threshold, assuming no further actions. "Now" means the position is already past the threshold; "—" means there is no debt or no rate to project from.'
          >
            <span className="font-medium">{formatLiquidationDate(projectedLiquidationDate)}</span>
          </InfoRow>

          <InfoRow label="Available to Borrow">
            <span className="font-medium">{formatUsds(availableToBorrow)} USDC</span>
          </InfoRow>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-a3-b py-2 last:border-b-0">
      {tooltip ? (
        <TooltipInfo title={tooltip} className="text-xs font-normal">
          {label}
        </TooltipInfo>
      ) : (
        <span className="text-xs text-secondary-t">{label}</span>
      )}
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ─── Approval modal ───

interface Step {
  number: number;
  title: string;
  detail?: string;
  isActive: boolean;
  isCompleted: boolean;
  isLoading: boolean;
  hash?: `0x${string}`;
}

interface CoolerApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  steps: Step[];
  currentStep: number;
  totalSteps: number;
  isAllComplete: boolean;
  isPending: boolean;
  onAction: () => void;
  actionLabel: string;
}

function formatTxHash(hash: `0x${string}`) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function BorrowCoolerApprovalModal({
  isOpen,
  onClose,
  title,
  steps,
  currentStep,
  totalSteps,
  isAllComplete,
  isPending,
  onAction,
  actionLabel,
}: CoolerApprovalModalProps) {
  if (isAllComplete) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-full sm:max-w-md mx-auto p-6 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckIcon className="h-8 w-8 text-green" />
            </div>
            <DialogTitle className="text-xl font-semibold mb-2">All done!</DialogTitle>
            <p className="text-sm text-secondary-t mb-6">Your transactions have been executed.</p>
          </div>

          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.number} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-green/20 flex items-center justify-center">
                    <CheckIcon className="h-4 w-4 text-green" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{step.title}</div>
                    {step.detail && <div className="text-xs text-secondary-t">{step.detail}</div>}
                  </div>
                </div>
                {step.hash && (
                  <Link
                    target="_blank"
                    to={`${blockExplorerTxBaseUrl}/${step.hash}`}
                    className="flex items-center gap-1 text-sm text-blue hover:text-blue-800"
                  >
                    {formatTxHash(step.hash)}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>

          <Button onClick={onClose} className="w-full" size="lg">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-md mx-auto p-0 gap-0 !rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-2 text-center !gap-6">
          <DialogTitle className="text-[20px]/[24px] font-semibold text-primary-t">
            {title}
          </DialogTitle>
          <p className="text-xs/4 font-normal text-secondary-t">
            Step {currentStep}/{totalSteps}. Proceed with your wallet.
          </p>
        </DialogHeader>

        <div className="px-6 pb-6">
          <div className="bg-surface-a3 border border-a3-b rounded-3xl">
            {steps.map((step, index) => (
              <div key={step.number}>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-medium ${
                        step.isCompleted
                          ? "text-green border-green"
                          : step.isActive
                            ? "text-primary-t border-primary-t"
                            : "text-secondary-t border-a10-b"
                      }`}
                    >
                      {step.isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : step.isCompleted ? (
                        <CheckIcon className="h-3 w-3" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <div>
                      <div className="text-sm/5 font-semibold text-primary-t">{step.title}</div>
                      {step.detail && (
                        <div className="text-xs text-secondary-t rounded-full border px-2 py-1 text-center border-a10-b">
                          {step.detail}
                        </div>
                      )}
                      {step.isCompleted && step.hash && (
                        <Link
                          target="_blank"
                          to={`${blockExplorerTxBaseUrl}/${step.hash}`}
                          className="flex items-center gap-1 text-xs text-blue hover:text-blue-800 mt-1"
                        >
                          {formatTxHash(step.hash)}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && <div className="border-b border-a5-b mx-4" />}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Button onClick={onAction} disabled={isPending} className="w-full" size="lg">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                actionLabel
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Borrow form ───

interface BorrowFormProps {
  calculations: MonoCoolerCalculations;
  loan?: {
    debt: bigint;
    collateral: bigint;
  };
}

function BorrowForm({ calculations, loan }: BorrowFormProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { address, chainId } = useConnectedAddress();
  const gshitToken = useToken(TokenName.WSTSHIT, address);
  const usdsToken = useToken(TokenName.USDC, address);

  const { isSmartContractWallet } = useIsSmartContractWallet();
  const { isAuthorized, setAuthorization, isSettingAuthorization } = useMonoCoolerAuthorization();

  const monoCoolerAddress = getContractAddress(ContractName.COOLER_V2_MONOCOOLER, chainId ?? 0);
  const compositesAddress = getContractAddress(ContractName.COOLER_V2_COMPOSITES, chainId ?? 0);

  const {
    collateralAmount,
    borrowAmount,
    ltvPercentage,
    projectedDebt,
    additionalBorrowingAvailable,
    isBelowMinDebt,
    handleLtvChange,
    handleCollateralChange,
    handleDebtChange,
  } = calculations;

  const {
    borrow,
    addCollateral,
    addCollateralAndBorrow,
    isBorrowing,
    isAddingCollateral,
    isAddingCollateralAndBorrowing,
    borrowHash,
    addCollateralHash,
    addCollateralAndBorrowHash,
    isBorrowSuccess,
    isAddCollateralSuccess,
    isAddCollateralAndBorrowSuccess,
    signAuthorization,
    resetTxState,
    isSigning,
    isSignSuccess,
  } = useMonoCoolerDebt();

  const isComposite = collateralAmount > ZERO && borrowAmount > ZERO;
  const isBorrowOnly = collateralAmount === ZERO && borrowAmount > ZERO;
  const isCollateralOnly = collateralAmount > ZERO && borrowAmount === ZERO;

  const borrowTxSuccess = isComposite
    ? isAddCollateralAndBorrowSuccess
    : isBorrowOnly
      ? isBorrowSuccess
      : isAddCollateralSuccess;
  const borrowTxHash = isComposite
    ? addCollateralAndBorrowHash
    : isBorrowOnly
      ? borrowHash
      : addCollateralHash;

  useEffect(() => {
    if (!borrowTxSuccess) return;
    trackCoolerBorrow({
      borrowAmount: formatUnits(borrowAmount, 18),
      collateralAmount: formatUnits(collateralAmount, 18),
      txHash: borrowTxHash,
    });
  }, [borrowTxSuccess]);

  const spenderAddress = isComposite ? compositesAddress : monoCoolerAddress;

  const { allowance, queryKey: allowanceQueryKey } = useTokenAllowance(
    gshitToken.address!,
    address,
    spenderAddress,
  );

  const {
    approve,
    isPending: isApproving,
    isSuccess: approvalSuccess,
    hash: approvalHash,
  } = useTokenApproval();

  const needsApproval = useMemo(() => {
    if (collateralAmount === ZERO) return false;
    if (allowance === undefined) return true;
    return allowance < collateralAmount;
  }, [allowance, collateralAmount]);

  const hasSufficientAllowance = !needsApproval;

  const needsScwAuthorization = isComposite && isSmartContractWallet && !isAuthorized;
  const needsEoaSignature = isComposite && !isSmartContractWallet;

  const isAnyPending =
    isBorrowing ||
    isAddingCollateral ||
    isAddingCollateralAndBorrowing ||
    isApproving ||
    isSigning ||
    isSettingAuthorization;

  const collateralInputValue = collateralAmount > ZERO ? formatUnits(collateralAmount, 18) : "";
  const borrowInputValue = borrowAmount > ZERO ? formatUnits(borrowAmount, 18) : "";

  const handleCollateralInputChange = (value: string) => {
    if (!value || value === "0") {
      handleCollateralChange(ZERO);
      return;
    }
    try {
      handleCollateralChange(parseUnits(value, 18));
    } catch {
      // invalid input, ignore
    }
  };

  const handleBorrowInputChange = (value: string) => {
    if (!value || value === "0") {
      handleDebtChange(ZERO);
      return;
    }
    try {
      handleDebtChange(parseUnits(value, 18));
    } catch {
      // invalid input, ignore
    }
  };

  const validationState = useMemo(() => {
    if (!address) return { label: "Sign In", disabled: true };
    if (collateralAmount === ZERO && borrowAmount === ZERO)
      return { label: "Enter Amount", disabled: true };
    if (
      collateralAmount > ZERO &&
      gshitToken.balance !== undefined &&
      collateralAmount > gshitToken.balance
    )
      return { label: "Insufficient wstSHIT Balance", disabled: true };
    if (!loan && borrowAmount > ZERO && collateralAmount === ZERO)
      return { label: "Enter Collateral Amount", disabled: true };
    if (borrowAmount > ZERO && borrowAmount > additionalBorrowingAvailable)
      return { label: "Exceeds Available Borrow", disabled: true };
    return { label: getActionLabel(), disabled: false };
  }, [
    address,
    collateralAmount,
    borrowAmount,
    gshitToken.balance,
    additionalBorrowingAvailable,
    isBelowMinDebt,
    projectedDebt,
    isComposite,
    isBorrowOnly,
    isCollateralOnly,
    loan,
  ]);

  function getActionLabel() {
    if (isComposite) return "Add Collateral & Borrow";
    if (isBorrowOnly) return "Borrow";
    if (isCollateralOnly) return "Add Collateral";
    return "Enter Amount";
  }

  const handleSubmitClick = () => {
    if (validationState.disabled) return;
    setIsModalOpen(true);
  };

  const executeTransaction = () => {
    if (isComposite) {
      addCollateralAndBorrow(collateralAmount, borrowAmount, isAuthorized);
    } else if (isBorrowOnly) {
      borrow(borrowAmount);
    } else if (isCollateralOnly) {
      addCollateral(collateralAmount);
    }
  };

  const modalSteps = useMemo(() => {
    const steps = [];
    let stepNum = 1;

    steps.push({
      number: stepNum++,
      title: "Approve wstSHIT",
      isActive: needsApproval && !approvalSuccess,
      isCompleted: hasSufficientAllowance || approvalSuccess,
      isLoading: isApproving,
      hash: approvalSuccess ? approvalHash : undefined,
    });

    if (needsScwAuthorization) {
      steps.push({
        number: stepNum++,
        title: "Authorize Composites",
        isActive: (hasSufficientAllowance || approvalSuccess) && !isAuthorized,
        isCompleted: isAuthorized,
        isLoading: isSettingAuthorization,
      });
    }

    if (needsEoaSignature) {
      steps.push({
        number: stepNum++,
        title: "Sign Authorization",
        isActive: (hasSufficientAllowance || approvalSuccess) && !isSignSuccess,
        isCompleted: isSignSuccess,
        isLoading: isSigning,
      });
    }

    const txTitle = isComposite
      ? "Add Collateral & Borrow"
      : isBorrowOnly
        ? "Borrow"
        : "Add Collateral";

    const txSuccess = isComposite
      ? isAddCollateralAndBorrowSuccess
      : isBorrowOnly
        ? isBorrowSuccess
        : isAddCollateralSuccess;

    const txHash = isComposite
      ? addCollateralAndBorrowHash
      : isBorrowOnly
        ? borrowHash
        : addCollateralHash;

    const txPending = isComposite
      ? isAddingCollateralAndBorrowing
      : isBorrowOnly
        ? isBorrowing
        : isAddingCollateral;

    steps.push({
      number: stepNum,
      title: txTitle,
      detail:
        collateralAmount > ZERO && borrowAmount > ZERO
          ? `${formatTokenAmount(collateralAmount).toFixed(4)} wstSHIT → ${formatTokenAmount(borrowAmount).toFixed(2)} USDC`
          : undefined,
      isActive:
        (hasSufficientAllowance || approvalSuccess) &&
        (!needsScwAuthorization || isAuthorized) &&
        (!needsEoaSignature || isSignSuccess),
      isCompleted: txSuccess,
      isLoading: txPending,
      hash: txSuccess ? txHash : undefined,
    });

    return steps;
  }, [
    needsApproval,
    approvalSuccess,
    hasSufficientAllowance,
    isApproving,
    approvalHash,
    needsScwAuthorization,
    isAuthorized,
    isSettingAuthorization,
    needsEoaSignature,
    isSignSuccess,
    isSigning,
    isComposite,
    isBorrowOnly,
    isCollateralOnly,
    isAddCollateralAndBorrowSuccess,
    isBorrowSuccess,
    isAddCollateralSuccess,
    addCollateralAndBorrowHash,
    borrowHash,
    addCollateralHash,
    isAddingCollateralAndBorrowing,
    isBorrowing,
    isAddingCollateral,
    collateralAmount,
    borrowAmount,
  ]);

  const modalCurrentStep = useMemo(() => {
    for (const step of modalSteps) {
      if (!step.isCompleted) return step.number;
    }
    return modalSteps.length;
  }, [modalSteps]);

  const isAllComplete = modalSteps.every((s) => s.isCompleted);

  const handleModalAction = () => {
    const activeStep = modalSteps.find((s) => s.isActive && !s.isCompleted);
    if (!activeStep) return;

    if (activeStep.title === "Approve wstSHIT") {
      if (!gshitToken.address || !spenderAddress) return;
      approve({
        tokenAddress: gshitToken.address,
        spender: spenderAddress,
        amount: collateralAmount,
        queryKey: allowanceQueryKey,
      });
    } else if (activeStep.title === "Authorize Composites") {
      setAuthorization();
    } else if (activeStep.title === "Sign Authorization") {
      signAuthorization();
    } else {
      executeTransaction();
    }
  };

  const modalActionLabel = useMemo(() => {
    const activeStep = modalSteps.find((s) => s.isActive && !s.isCompleted);
    return activeStep?.title || "Continue";
  }, [modalSteps]);

  const usdsTokenWithAvailable = useMemo(
    () => ({
      ...usdsToken,
      balance: additionalBorrowingAvailable,
    }),
    [usdsToken, additionalBorrowingAvailable],
  );

  return (
    <>
      <div data-slot="borrow-form" className="flex flex-col gap-4">
        <TokenBigInput
          label="Add Collateral"
          token={gshitToken}
          value={collateralInputValue}
          onChange={handleCollateralInputChange}
          disabled={isAnyPending}
        />

        <TokenBigInput
          label="Borrow"
          balanceLabel="Available"
          token={usdsTokenWithAvailable}
          value={borrowInputValue}
          onChange={handleBorrowInputChange}
          disabled={isAnyPending}
        />

        <div className="px-1">
          <BorrowLtvSlider
            ltvPercentage={ltvPercentage}
            onLtvChange={handleLtvChange}
            isRepayMode={false}
          />
        </div>

        <Button
          size="lg"
          className="w-full"
          disabled={validationState.disabled || isAnyPending}
          onClick={handleSubmitClick}
        >
          {isAnyPending ? "Processing..." : validationState.label}
        </Button>
      </div>

      <BorrowCoolerApprovalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (isAllComplete) {
            calculations.resetState();
            resetTxState();
          }
        }}
        title={getActionLabel()}
        steps={modalSteps}
        currentStep={modalCurrentStep}
        totalSteps={modalSteps.length}
        isAllComplete={isAllComplete}
        isPending={isAnyPending}
        onAction={handleModalAction}
        actionLabel={modalActionLabel}
      />
    </>
  );
}

// ─── Repay form ───

interface RepayFormProps {
  calculations: MonoCoolerCalculations;
}

function RepayForm({ calculations }: RepayFormProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { address, chainId } = useConnectedAddress();
  const usdsToken = useToken(TokenName.USDC, address);

  const { position } = useMonoCoolerPosition();
  const { isSmartContractWallet } = useIsSmartContractWallet();
  const { isAuthorized, setAuthorization, isSettingAuthorization } = useMonoCoolerAuthorization();

  const monoCoolerAddress = getContractAddress(ContractName.COOLER_V2_MONOCOOLER, chainId ?? 0);
  const compositesAddress = getContractAddress(ContractName.COOLER_V2_COMPOSITES, chainId ?? 0);

  const {
    borrowAmount: repayAmount,
    ltvPercentage,
    projectedDebt,
    currentDebt,
    collateralToBeReleased,
    isBelowMinDebt,
    handleLtvChange,
    handleDebtChange,
  } = calculations;

  const {
    repay,
    repayAndRemoveCollateral,
    isRepaying,
    isWithdrawingCollateral,
    isRepayingAndRemovingCollateral,
    repayHash,
    repayAndRemoveCollateralHash,
    isRepaySuccess,
    isRepayAndRemoveCollateralSuccess,
    signAuthorization,
    resetTxState,
    isSigning,
    isSignSuccess,
  } = useMonoCoolerDebt();

  const isFullRepay = repayAmount > ZERO && repayAmount >= currentDebt;
  const isRepayWithWithdraw = repayAmount > ZERO && collateralToBeReleased > ZERO;
  const isRepayOnly = repayAmount > ZERO && collateralToBeReleased === ZERO;
  const isComposite = isRepayWithWithdraw;

  const repayTxSuccess = isComposite ? isRepayAndRemoveCollateralSuccess : isRepaySuccess;
  const repayTxHash = isComposite ? repayAndRemoveCollateralHash : repayHash;

  useEffect(() => {
    if (!repayTxSuccess) return;
    trackCoolerRepay({ repayAmount: formatUnits(repayAmount, 18), txHash: repayTxHash });
  }, [repayTxSuccess, repayAmount, repayTxHash]);

  const spenderAddress = isComposite ? compositesAddress : monoCoolerAddress;

  const { allowance, queryKey: allowanceQueryKey } = useTokenAllowance(
    usdsToken.address as `0x${string}`,
    address,
    spenderAddress,
  );

  const {
    approve,
    isPending: isApproving,
    isSuccess: approvalSuccess,
    hash: approvalHash,
  } = useTokenApproval();

  const needsApproval = useMemo(() => {
    if (repayAmount === ZERO) return false;
    if (allowance === undefined) return true;
    const requiredAmountWad = calculateRepayAmount(
      repayAmount,
      position?.interestRateBps ?? 0,
      isFullRepay,
    );
    // Convert from 18dp (wad) to 6dp to match raw USDC allowance
    const requiredAmount6dp = requiredAmountWad / 10n ** 12n;
    return allowance < requiredAmount6dp;
  }, [allowance, repayAmount, position?.interestRateBps, isFullRepay]);

  const hasSufficientAllowance = !needsApproval;

  const needsScwAuthorization = isComposite && isSmartContractWallet && !isAuthorized;
  const needsEoaSignature = isComposite && !isSmartContractWallet;

  const isAnyPending =
    isRepaying ||
    isWithdrawingCollateral ||
    isRepayingAndRemovingCollateral ||
    isApproving ||
    isSigning ||
    isSettingAuthorization;

  const repayInputValue = repayAmount > ZERO ? formatUnits(repayAmount, 18) : "";

  const handleRepayInputChange = (value: string) => {
    if (!value || value === "0") {
      handleDebtChange(ZERO);
      return;
    }
    try {
      handleDebtChange(parseUnits(value, 18));
    } catch {
      // invalid input, ignore
    }
  };

  const maxRepayAmount = useMemo(() => {
    const rawBalance = usdsToken.balance ?? ZERO;
    // Convert USDC balance from 6dp to 18dp (wad) to match currentDebt
    const walletBalance = rawBalance * 10n ** 12n;
    return walletBalance < currentDebt ? walletBalance : currentDebt;
  }, [usdsToken.balance, currentDebt]);

  const handleMaxRepay = () => {
    handleDebtChange(maxRepayAmount);
  };

  const validationState = useMemo(() => {
    if (!address) return { label: "Sign In", disabled: true };
    if (currentDebt === ZERO) return { label: "No Debt to Repay", disabled: true };
    if (repayAmount === ZERO) return { label: "Enter Amount", disabled: true };
    if (repayAmount > ZERO && usdsToken.balance !== undefined && repayAmount > (usdsToken.balance * 10n ** 12n))
      return { label: "Insufficient USDC Balance", disabled: true };
    const label = isComposite
      ? "Repay & Withdraw"
      : isRepayOnly
        ? isFullRepay
          ? "Repay All"
          : "Repay"
        : "Enter Amount";
    return { label, disabled: false };
  }, [
    address,
    currentDebt,
    repayAmount,
    usdsToken.balance,
    isBelowMinDebt,
    projectedDebt,
    isComposite,
    isRepayOnly,
    isFullRepay,
  ]);

  const handleSubmitClick = () => {
    if (validationState.disabled) return;
    setIsModalOpen(true);
  };

  const executeTransaction = () => {
    if (isComposite) {
      repayAndRemoveCollateral(repayAmount, collateralToBeReleased, isFullRepay, isAuthorized);
    } else if (isRepayOnly) {
      repay(repayAmount, isFullRepay);
    }
  };

  const modalSteps = useMemo(() => {
    const steps = [];
    let stepNum = 1;

    steps.push({
      number: stepNum++,
      title: "Approve USDC",
      isActive: needsApproval && !approvalSuccess,
      isCompleted: hasSufficientAllowance || approvalSuccess,
      isLoading: isApproving,
      hash: approvalSuccess ? approvalHash : undefined,
    });

    if (needsScwAuthorization) {
      steps.push({
        number: stepNum++,
        title: "Authorize Composites",
        isActive: (hasSufficientAllowance || approvalSuccess) && !isAuthorized,
        isCompleted: isAuthorized,
        isLoading: isSettingAuthorization,
      });
    }

    if (needsEoaSignature) {
      steps.push({
        number: stepNum++,
        title: "Sign Authorization",
        isActive: (hasSufficientAllowance || approvalSuccess) && !isSignSuccess,
        isCompleted: isSignSuccess,
        isLoading: isSigning,
      });
    }

    const txTitle = isComposite ? "Repay & Withdraw" : isFullRepay ? "Repay All" : "Repay";

    const txSuccess = isComposite ? isRepayAndRemoveCollateralSuccess : isRepaySuccess;
    const txHash = isComposite ? repayAndRemoveCollateralHash : repayHash;
    const txPending = isComposite ? isRepayingAndRemovingCollateral : isRepaying;

    steps.push({
      number: stepNum,
      title: txTitle,
      detail: `${formatTokenAmount(repayAmount).toFixed(2)} USDC`,
      isActive:
        (hasSufficientAllowance || approvalSuccess) &&
        (!needsScwAuthorization || isAuthorized) &&
        (!needsEoaSignature || isSignSuccess),
      isCompleted: txSuccess,
      isLoading: txPending,
      hash: txSuccess ? txHash : undefined,
    });

    return steps;
  }, [
    needsApproval,
    approvalSuccess,
    hasSufficientAllowance,
    isApproving,
    approvalHash,
    needsScwAuthorization,
    isAuthorized,
    isSettingAuthorization,
    needsEoaSignature,
    isSignSuccess,
    isSigning,
    isComposite,
    isFullRepay,
    isRepayAndRemoveCollateralSuccess,
    isRepaySuccess,
    repayAndRemoveCollateralHash,
    repayHash,
    isRepayingAndRemovingCollateral,
    isRepaying,
    repayAmount,
  ]);

  const modalCurrentStep = useMemo(() => {
    for (const step of modalSteps) {
      if (!step.isCompleted) return step.number;
    }
    return modalSteps.length;
  }, [modalSteps]);

  const isAllComplete = modalSteps.every((s) => s.isCompleted);

  const handleModalAction = () => {
    const activeStep = modalSteps.find((s) => s.isActive && !s.isCompleted);
    if (!activeStep) return;

    if (activeStep.title === "Approve USDC") {
      if (!usdsToken.address || !spenderAddress) return;
      const requiredAmount = calculateRepayAmount(
        repayAmount,
        position?.interestRateBps ?? 0,
        isFullRepay,
      );
      approve({
        tokenAddress: usdsToken.address,
        spender: spenderAddress,
        amount: requiredAmount,
        queryKey: allowanceQueryKey,
      });
    } else if (activeStep.title === "Authorize Composites") {
      setAuthorization();
    } else if (activeStep.title === "Sign Authorization") {
      signAuthorization();
    } else {
      executeTransaction();
    }
  };

  const modalActionLabel = useMemo(() => {
    const activeStep = modalSteps.find((s) => s.isActive && !s.isCompleted);
    return activeStep?.title || "Continue";
  }, [modalSteps]);

  return (
    <>
      <div data-slot="repay-form" className="flex flex-col gap-4">
        {currentDebt === ZERO && (
          <div className="rounded-2xl bg-surface-a3 border border-a3-b px-4 py-3 text-sm text-secondary-t">
            You have no outstanding debt. Go to the Borrow tab to take a loan against your wstSHIT collateral.
          </div>
        )}
        <TokenBigInput
          label="Repay"
          headerRight={
            <p className="text-xs text-secondary-t">
              Debt:{" "}
              <span className="font-medium text-primary-t">
                {formatTokenAmount(currentDebt).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          }
          token={usdsToken}
          value={repayInputValue}
          onChange={handleRepayInputChange}
          onMax={handleMaxRepay}
          disabled={isAnyPending}
        />

        <div className="rounded-2xl bg-surface-a3 border border-a3-b px-4 py-4">
          <p className="text-[15px]/[20px] font-medium mb-3">Withdraw Collateral</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-semibold">
              {collateralToBeReleased > ZERO ? formatGshit(collateralToBeReleased) : "0.0000"}
            </p>
            <div className="bg-surface-a3 border border-a3-b inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2">
              <Icon name="WSTSHITTokenIcon" className="size-5" />
              <p className="text-[15px]/[20px] font-semibold whitespace-nowrap">wstSHIT</p>
            </div>
          </div>
        </div>

        <div className="px-1">
          <BorrowLtvSlider
            ltvPercentage={ltvPercentage}
            onLtvChange={handleLtvChange}
            isRepayMode={true}
          />
        </div>

        <Button
          size="lg"
          className="w-full"
          disabled={validationState.disabled || isAnyPending}
          onClick={handleSubmitClick}
        >
          {isAnyPending ? "Processing..." : validationState.label}
        </Button>
      </div>

      <BorrowCoolerApprovalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (isAllComplete) {
            calculations.resetState();
            resetTxState();
          }
        }}
        title={validationState.label}
        steps={modalSteps}
        currentStep={modalCurrentStep}
        totalSteps={modalSteps.length}
        isAllComplete={isAllComplete}
        isPending={isAnyPending}
        onAction={handleModalAction}
        actionLabel={modalActionLabel}
      />
    </>
  );
}

// ─── Page ───

type Tab = "borrow" | "repay";

export function CoolerBorrowPage() {
  const { chainId } = useConnectedAddress();
  const monoCoolerAddress = getContractAddress(ContractName.COOLER_V2_MONOCOOLER, chainId ?? 0);

  if (!monoCoolerAddress) {
    return (
      <div data-slot="cooler-borrow-page">
        <Card className="p-8 text-center">
          <h3 className="font-serif text-xl mb-2">Borrowing not available</h3>
          <p className="text-sm text-secondary-t">
            The cooler contracts are not deployed on this network. Please switch to a supported network.
          </p>
        </Card>
      </div>
    );
  }

  return <CoolerBorrowPageInner />;
}

function CoolerBorrowPageInner() {
  const [activeTab, setActiveTab] = useState<Tab>("borrow");
  const { position } = useMonoCoolerPosition();

  const loan = useMemo(() => {
    if (!position || (position.collateral === 0n && position.currentDebt === 0n)) return undefined;
    return {
      debt: position.currentDebt,
      collateral: position.collateral,
    };
  }, [position]);

  const isRepayMode = activeTab === "repay";

  const calculations = useMonoCoolerCalculations({ loan, isRepayMode });

  return (
    <div data-slot="cooler-borrow-page" className="">
      <DashboardActions className="mb-6" />
      <BorrowStatsBar />

      {position?.borrowsPaused && (
        <Card className="p-6">
          <div className="text-center py-4">
            <p className="text-secondary-t font-medium">Borrowing is currently paused.</p>
            <p className="text-tertiary-t mt-1 text-sm">
              New borrows are temporarily disabled. You can still repay existing loans.
            </p>
          </div>
        </Card>
      )}

      <Tabs
        variant="primary"
        value={activeTab}
        onValueChange={(val) => val && setActiveTab(val as Tab)}
        className="mt-8"
      >
        <TabsList variant="primary">
          <TabsTrigger variant="primary" value="borrow">
            Borrow
          </TabsTrigger>
          <TabsTrigger variant="primary" value="repay">
            Repay
          </TabsTrigger>
        </TabsList>

        <Card className="p-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <TabsContent variant="primary" value="borrow">
                <BorrowForm calculations={calculations} loan={loan} />
              </TabsContent>
              <TabsContent variant="primary" value="repay">
                <RepayForm calculations={calculations} />
              </TabsContent>
            </div>

            <BorrowPositionInfo
              projectedCollateral={calculations.projectedCollateral}
              projectedDebt={calculations.projectedDebt}
              liquidationThreshold={calculations.liquidationThreshold}
              projectedLiquidationDate={calculations.projectedLiquidationDate}
              availableToBorrow={calculations.remainingBorrowingAvailable}
              currentDebt={calculations.currentDebt}
            />
          </div>
        </Card>
      </Tabs>
    </div>
  );
}
