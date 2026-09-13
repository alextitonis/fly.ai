import { useState, useEffect } from "react";
import { parseUnits } from "viem";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { formatTokenAmount } from "@/lib/math";
import { useMonoCoolerPosition } from "./cooler-useMonoCoolerPosition";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { WAD, wmul, wdiv, pctToWad } from "@/lib/math";
import { computeLiquidationDate } from "./cooler-cooler-math";

const ZERO = 0n;
const MIN_DEBT = 0n;

interface UseMonoCoolerCalculationsProps {
  loan?: {
    debt: bigint;
    collateral: bigint;
  };
  isRepayMode: boolean;
}

export type MonoCoolerCalculations = ReturnType<typeof useMonoCoolerCalculations>;

export function useMonoCoolerCalculations({ loan, isRepayMode }: UseMonoCoolerCalculationsProps) {
  const { address } = useConnectedAddress();
  const { position } = useMonoCoolerPosition();

  const collateralAddress = position?.collateralAddress;
  const { balance: collateralBalance } = useTokenBalance(collateralAddress, address);

  const hourlyInterestRate = position?.interestRateBps
    ? position.interestRateBps / 10000 / 8760
    : 0;

  const [collateralAmount, setCollateralAmount] = useState(ZERO);
  const [borrowAmount, setBorrowAmount] = useState<bigint>(ZERO);
  const [ltvPercentage, setLtvPercentage] = useState(100);

  // Reset form state when switching between borrow and repay tabs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: isRepayMode is the reset trigger
  useEffect(() => {
    setCollateralAmount(ZERO);
    setBorrowAmount(ZERO);
    setLtvPercentage(100);
  }, [isRepayMode]);

  const currentDebt = loan?.debt ?? ZERO;

  // Max potential borrow amount (includes any new collateral being added)
  let maxPotentialBorrowAmount = ZERO;
  if (position?.maxOriginationLtv) {
    if (loan) {
      const totalCollateral = loan.collateral + collateralAmount;
      maxPotentialBorrowAmount = wmul(totalCollateral, position.maxOriginationLtv);
    } else if (collateralBalance) {
      maxPotentialBorrowAmount = wmul(collateralBalance, position.maxOriginationLtv);
    }
  }

  // Collateral to be released (repay mode only releases proportional to repayment)
  let collateralToBeReleased = ZERO;
  if (loan && position?.maxOriginationLtv) {
    if (isRepayMode) {
      const repaymentRatio = loan.debt > ZERO ? wdiv(borrowAmount, loan.debt) : WAD;
      const maxCollateralToWithdraw = wmul(loan.collateral, repaymentRatio);
      const withdrawRatio = pctToWad(ltvPercentage);
      collateralToBeReleased = wmul(maxCollateralToWithdraw, withdrawRatio);
    } else if (loan.debt === ZERO) {
      collateralToBeReleased = loan.collateral;
    } else {
      const repaymentRatio = wdiv(borrowAmount, loan.debt);
      collateralToBeReleased = wmul(loan.collateral, repaymentRatio);
    }
  }

  // Liquidation threshold reflects collateral after the pending action.
  // In repay mode that's the post-withdraw amount (slider-aware), so reducing
  // debt without withdrawing pushes the liquidation date out.
  let liquidationThreshold = ZERO;
  if (position?.liquidationLtv) {
    if (isRepayMode && loan) {
      const remainingCollateral = loan.collateral - collateralToBeReleased;
      liquidationThreshold = wmul(remainingCollateral, position.liquidationLtv);
    } else {
      const totalCollateral = (loan?.collateral ?? ZERO) + collateralAmount;
      liquidationThreshold = wmul(totalCollateral, position.liquidationLtv);
    }
  }

  let oneHourInterest = ZERO;
  if (currentDebt > ZERO && hourlyInterestRate > 0) {
    const rateWad = parseUnits(hourlyInterestRate.toFixed(18), 18);
    oneHourInterest = wmul(currentDebt, rateWad);
  }

  let projectedDebt: bigint;
  if (isRepayMode) {
    projectedDebt = currentDebt > borrowAmount ? currentDebt - borrowAmount : ZERO;
  } else if (!loan) {
    projectedDebt = borrowAmount;
  } else {
    projectedDebt = currentDebt + borrowAmount;
  }

  let projectedCollateral: bigint;
  if (isRepayMode) {
    if (!loan) {
      projectedCollateral = ZERO;
    } else {
      const remaining = loan.collateral - collateralToBeReleased;
      projectedCollateral = remaining > ZERO ? remaining : ZERO;
    }
  } else if (!loan) {
    projectedCollateral = collateralAmount;
  } else {
    projectedCollateral = loan.collateral + collateralAmount;
  }

  const additionalBorrowingAvailable =
    maxPotentialBorrowAmount > currentDebt ? maxPotentialBorrowAmount - currentDebt : ZERO;

  // Borrow capacity remaining after the pending action (slider-aware in repay).
  const projectedMaxBorrow = position?.maxOriginationLtv
    ? wmul(projectedCollateral, position.maxOriginationLtv)
    : ZERO;
  const remainingBorrowingAvailable =
    projectedMaxBorrow > projectedDebt ? projectedMaxBorrow - projectedDebt : ZERO;

  const projectedLiquidationDate = computeLiquidationDate(
    projectedDebt,
    liquidationThreshold,
    position?.interestRateWad ?? 0n,
  );

  const isBelowMinDebt = projectedDebt > ZERO && projectedDebt < MIN_DEBT;

  const handleLtvChange = (value: number) => {
    if (isRepayMode) {
      handleRepayLtvChange(value);
    } else {
      handleBorrowLtvChange(value);
    }
  };

  const handleRepayLtvChange = (value: number) => {
    if (!position?.maxOriginationLtv || !loan) return;
    setLtvPercentage(value);
  };

  const handleBorrowLtvChange = (value: number) => {
    if (!position?.maxOriginationLtv || hourlyInterestRate === 0) return;

    const maxLtv = position.maxOriginationLtv;

    if (loan) {
      const existingCollateral = loan.collateral;
      const totalCollateral = existingCollateral + collateralAmount;

      const minLtvPct = formatTokenAmount(wdiv(currentDebt, wmul(totalCollateral, maxLtv))) * 100;
      const adjustedValue = Math.max(value, minLtvPct);
      setLtvPercentage(adjustedValue);

      if (adjustedValue <= minLtvPct) {
        setBorrowAmount(ZERO);
        return;
      }

      const pctWad = pctToWad(adjustedValue);
      const maxBorrowAmount = wmul(wmul(totalCollateral, maxLtv), pctWad);
      const additionalBorrowing =
        maxBorrowAmount > currentDebt ? maxBorrowAmount - currentDebt : ZERO;

      if (value === 100) {
        const rateWad = parseUnits(hourlyInterestRate.toFixed(18), 18);
        const hourInterest = wmul(currentDebt, rateWad);
        setBorrowAmount(
          additionalBorrowing > hourInterest ? additionalBorrowing - hourInterest : ZERO,
        );
      } else {
        setBorrowAmount(additionalBorrowing);
      }
    } else {
      setLtvPercentage(value);
      const pctWad = pctToWad(value);
      let newBorrowAmount = wmul(wmul(collateralAmount, maxLtv), pctWad);

      if (value === 100) {
        const rateWad = parseUnits(hourlyInterestRate.toFixed(18), 18);
        const hourInterest = wmul(newBorrowAmount, rateWad);
        newBorrowAmount = newBorrowAmount > hourInterest ? newBorrowAmount - hourInterest : ZERO;
      }

      setBorrowAmount(newBorrowAmount);
    }
  };

  const handleCollateralChange = (value: bigint) => {
    setCollateralAmount(value);
    if (position?.maxOriginationLtv && !isRepayMode) {
      const pctWad = pctToWad(ltvPercentage);
      const newBorrowAmount = wmul(wmul(value, position.maxOriginationLtv), pctWad);
      setBorrowAmount(newBorrowAmount);
    }
  };

  const handleDebtChange = (value: bigint) => {
    if (isRepayMode) {
      const maxRepayment = currentDebt;
      setBorrowAmount(value > maxRepayment ? maxRepayment : value);
      return;
    }

    setBorrowAmount(value);

    if (!position?.maxOriginationLtv) return;
    const maxLtv = position.maxOriginationLtv;

    if (loan) {
      const totalCollateral = loan.collateral + collateralAmount;
      const totalDebt = currentDebt + value;
      const newLtvPct = formatTokenAmount(wdiv(totalDebt, wmul(totalCollateral, maxLtv))) * 100;
      setLtvPercentage(Math.min(newLtvPct, 100));
    } else if (collateralAmount > ZERO) {
      const newLtvPct = formatTokenAmount(wdiv(value, wmul(collateralAmount, maxLtv))) * 100;
      setLtvPercentage(Math.min(newLtvPct, 100));
    }
  };

  const resetState = () => {
    setCollateralAmount(ZERO);
    setBorrowAmount(ZERO);
    setLtvPercentage(100);
  };

  return {
    collateralAmount,
    borrowAmount,
    ltvPercentage,

    currentDebt,
    maxPotentialBorrowAmount,
    liquidationThreshold,
    collateralToBeReleased,
    oneHourInterest,
    projectedDebt,
    projectedCollateral,
    projectedLiquidationDate,
    additionalBorrowingAvailable,
    remainingBorrowingAvailable,
    isBelowMinDebt,

    handleLtvChange,
    handleCollateralChange,
    handleDebtChange,
    resetState,
  };
}
