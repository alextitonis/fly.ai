import { describe, it, expect, vi } from "vitest";
import { parseUnits } from "viem";
import { render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { wmul, wdiv, pctToWad } from "@/lib/math";
import { mulDiv, mulDivUp } from "@/lib/math-solady-FixedPointMathLib";
import { calculateBorrowAmount, calculateRepayAmount } from "@/hooks/cooler-useMonoCoolerDebt";
import { calculateInterestRateBps, computeLiquidationDate } from "@/hooks/cooler-cooler-math";
import { BorrowPositionInfo } from "@/modules/cooler-borrow-page";

vi.mock("@/components/icon", () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className} />
  ),
}));

// ─── WAD math utilities ───

const ZERO = 0n;
const MIN_DEBT = parseUnits("1000", 18);

describe("WAD math utilities", () => {
  it("wmul: multiplies two WAD values correctly", () => {
    const a = parseUnits("2", 18);
    const b = parseUnits("3", 18);
    const result = wmul(a, b);
    expect(result).toBe(parseUnits("6", 18));
  });

  it("wmul: handles fractional values", () => {
    const a = parseUnits("1.5", 18);
    const b = parseUnits("0.5", 18);
    const result = wmul(a, b);
    expect(result).toBe(parseUnits("0.75", 18));
  });

  it("wdiv: divides two WAD values correctly", () => {
    const a = parseUnits("6", 18);
    const b = parseUnits("3", 18);
    const result = wdiv(a, b);
    expect(result).toBe(parseUnits("2", 18));
  });

  it("wdiv: returns zero when dividing by zero", () => {
    expect(wdiv(parseUnits("1", 18), ZERO)).toBe(ZERO);
  });

  it("pctToWad: converts percentage to WAD fraction", () => {
    const result = pctToWad(100);
    expect(result).toBe(parseUnits("1", 18));
  });

  it("pctToWad: converts 50% correctly", () => {
    const result = pctToWad(50);
    expect(result).toBe(parseUnits("0.5", 18));
  });
});

// ─── Borrow amount calculations ───

describe("Borrow amount calculations", () => {
  const maxOriginationLtv = parseUnits("0.7", 18);

  it("calculates borrow amount from collateral and LTV", () => {
    const collateral = parseUnits("10", 18);
    const ltvPct = 100;
    const pctWad = pctToWad(ltvPct);
    const borrowAmount = wmul(wmul(collateral, maxOriginationLtv), pctWad);
    expect(borrowAmount).toBe(parseUnits("7", 18));
  });

  it("calculates partial LTV borrow amount", () => {
    const collateral = parseUnits("10", 18);
    const ltvPct = 50;
    const pctWad = pctToWad(ltvPct);
    const borrowAmount = wmul(wmul(collateral, maxOriginationLtv), pctWad);
    expect(borrowAmount).toBe(parseUnits("3.5", 18));
  });

  it("calculates zero borrow at 0% LTV", () => {
    const collateral = parseUnits("10", 18);
    const pctWad = pctToWad(0);
    const borrowAmount = wmul(wmul(collateral, maxOriginationLtv), pctWad);
    expect(borrowAmount).toBe(ZERO);
  });
});

// ─── Repay and collateral release calculations ───

describe("Repay and collateral release calculations", () => {
  it("calculates collateral to be released on full repay", () => {
    const existingDebt = parseUnits("7000", 18);
    const existingCollateral = parseUnits("10", 18);
    const repayAmount = existingDebt;
    const repaymentRatio = wdiv(repayAmount, existingDebt);
    const maxCollateralToWithdraw = wmul(existingCollateral, repaymentRatio);
    expect(maxCollateralToWithdraw).toBe(existingCollateral);
  });

  it("calculates partial collateral release", () => {
    const existingDebt = parseUnits("7000", 18);
    const existingCollateral = parseUnits("10", 18);
    const repayAmount = parseUnits("3500", 18);
    const repaymentRatio = wdiv(repayAmount, existingDebt);
    const maxCollateralToWithdraw = wmul(existingCollateral, repaymentRatio);
    expect(maxCollateralToWithdraw).toBe(parseUnits("5", 18));
  });
});

// ─── Projected values ───

describe("Projected values", () => {
  it("projected debt in borrow mode = current + new", () => {
    const currentDebt = parseUnits("5000", 18);
    const borrowAmount = parseUnits("2000", 18);
    const projectedDebt = currentDebt + borrowAmount;
    expect(projectedDebt).toBe(parseUnits("7000", 18));
  });

  it("projected debt in repay mode = current - repay (clamped to 0)", () => {
    const currentDebt = parseUnits("5000", 18);
    const repayAmount = parseUnits("3000", 18);
    const projectedDebt = currentDebt > repayAmount ? currentDebt - repayAmount : ZERO;
    expect(projectedDebt).toBe(parseUnits("2000", 18));
  });

  it("projected debt never goes negative", () => {
    const currentDebt = parseUnits("1000", 18);
    const repayAmount = parseUnits("2000", 18);
    const projectedDebt = currentDebt > repayAmount ? currentDebt - repayAmount : ZERO;
    expect(projectedDebt).toBe(ZERO);
  });

  it("projected collateral in borrow mode = existing + new", () => {
    const existingCollateral = parseUnits("5", 18);
    const newCollateral = parseUnits("3", 18);
    const projectedCollateral = existingCollateral + newCollateral;
    expect(projectedCollateral).toBe(parseUnits("8", 18));
  });
});

// ─── Liquidation threshold ───

describe("Liquidation threshold", () => {
  it("calculates liquidation threshold from collateral and LTV", () => {
    const liquidationLtv = parseUnits("0.85", 18);
    const collateral = parseUnits("10", 18);
    const threshold = wmul(collateral, liquidationLtv);
    expect(threshold).toBe(parseUnits("8.5", 18));
  });
});

// ─── Additional borrowing available ───

describe("Additional borrowing available", () => {
  it("calculates available borrowing correctly", () => {
    const maxPotentialBorrowAmount = parseUnits("7000", 18);
    const currentDebt = parseUnits("3000", 18);
    const available =
      maxPotentialBorrowAmount > currentDebt ? maxPotentialBorrowAmount - currentDebt : ZERO;
    expect(available).toBe(parseUnits("4000", 18));
  });

  it("returns zero when at max capacity", () => {
    const maxPotentialBorrowAmount = parseUnits("7000", 18);
    const currentDebt = parseUnits("7000", 18);
    const available =
      maxPotentialBorrowAmount > currentDebt ? maxPotentialBorrowAmount - currentDebt : ZERO;
    expect(available).toBe(ZERO);
  });

  it("returns zero when over-borrowed", () => {
    const maxPotentialBorrowAmount = parseUnits("7000", 18);
    const currentDebt = parseUnits("8000", 18);
    const available =
      maxPotentialBorrowAmount > currentDebt ? maxPotentialBorrowAmount - currentDebt : ZERO;
    expect(available).toBe(ZERO);
  });
});

// ─── Minimum debt enforcement ───

describe("Minimum debt enforcement", () => {
  it("detects projected debt below minimum", () => {
    const projectedDebt = parseUnits("500", 18);
    const isBelowMinDebt = projectedDebt > ZERO && projectedDebt < MIN_DEBT;
    expect(isBelowMinDebt).toBe(true);
  });

  it("passes when projected debt is at minimum", () => {
    const projectedDebt = parseUnits("1000", 18);
    const isBelowMinDebt = projectedDebt > ZERO && projectedDebt < MIN_DEBT;
    expect(isBelowMinDebt).toBe(false);
  });

  it("passes when projected debt is zero (fully repaid)", () => {
    const projectedDebt = ZERO;
    const isBelowMinDebt = projectedDebt > ZERO && projectedDebt < MIN_DEBT;
    expect(isBelowMinDebt).toBe(false);
  });

  it("passes when projected debt is above minimum", () => {
    const projectedDebt = parseUnits("5000", 18);
    const isBelowMinDebt = projectedDebt > ZERO && projectedDebt < MIN_DEBT;
    expect(isBelowMinDebt).toBe(false);
  });
});

// ─── Interest buffer (calculateBorrowAmount / calculateRepayAmount) ───

describe("calculateBorrowAmount", () => {
  const interestRateBps = 500;

  it("subtracts 1-hour interest buffer from borrow amount", () => {
    const amount = 10000n * 10n ** 18n;
    const result = calculateBorrowAmount(amount, interestRateBps);
    expect(result).toBeLessThan(amount);
    expect(result).toBeGreaterThan(amount - 10n ** 18n);
  });

  it("returns 0 for zero amount", () => {
    expect(calculateBorrowAmount(0n, interestRateBps)).toBe(0n);
  });

  it("handles small amounts correctly", () => {
    const amount = 1n * 10n ** 18n;
    const result = calculateBorrowAmount(amount, interestRateBps);
    expect(result).toBeLessThan(amount);
    expect(result).toBeGreaterThan(0n);
  });

  it("handles high interest rate", () => {
    const amount = 1000n * 10n ** 18n;
    const highRate = 5000;
    const result = calculateBorrowAmount(amount, highRate);
    expect(result).toBeLessThan(amount);
    const normalResult = calculateBorrowAmount(amount, interestRateBps);
    expect(amount - result).toBeGreaterThan(amount - normalResult);
  });
});

describe("calculateRepayAmount", () => {
  const interestRateBps = 500;

  it("adds 1-hour buffer when fullRepay is true", () => {
    const amount = 10000n * 10n ** 18n;
    const result = calculateRepayAmount(amount, interestRateBps, true);
    expect(result).toBeGreaterThan(amount);
    expect(result).toBeLessThan(amount + 10n ** 18n);
  });

  it("returns amount unchanged when fullRepay is false", () => {
    const amount = 10000n * 10n ** 18n;
    const result = calculateRepayAmount(amount, interestRateBps, false);
    expect(result).toBe(amount);
  });

  it("returns 0 for zero amount regardless of fullRepay", () => {
    expect(calculateRepayAmount(0n, interestRateBps, true)).toBe(0n);
    expect(calculateRepayAmount(0n, interestRateBps, false)).toBe(0n);
  });

  it("buffer is symmetric with borrow buffer", () => {
    const amount = 5000n * 10n ** 18n;
    const borrowResult = calculateBorrowAmount(amount, interestRateBps);
    const borrowBuffer = amount - borrowResult;
    const repayResult = calculateRepayAmount(amount, interestRateBps, true);
    const repayBuffer = repayResult - amount;
    expect(repayBuffer).toBe(borrowBuffer);
  });
});

// ─── Liquidation projection (cooler-math) ───

describe("calculateInterestRateBps", () => {
  it("converts WAD interest rate to basis points", () => {
    const interestRateWad = parseUnits("0.04879016416943205", 18);
    expect(calculateInterestRateBps(interestRateWad)).toBe(500);
  });

  it("handles zero rate", () => {
    expect(calculateInterestRateBps(0n)).toBe(0);
  });

  it("handles small rates", () => {
    const interestRateWad = parseUnits("0.004987541511038553", 18);
    expect(calculateInterestRateBps(interestRateWad)).toBe(50);
  });
});

describe("computeLiquidationDate", () => {
  const rate5pct = parseUnits("0.04879", 18);

  it("returns null when there is no debt", () => {
    expect(computeLiquidationDate(0n, parseUnits("1000", 18), rate5pct)).toBeNull();
  });

  it("returns null when there is no threshold", () => {
    expect(computeLiquidationDate(parseUnits("1000", 18), 0n, rate5pct)).toBeNull();
  });

  it("returns null at zero rate (debt cannot grow)", () => {
    expect(computeLiquidationDate(parseUnits("1000", 18), parseUnits("2000", 18), 0n)).toBeNull();
  });

  it("returns the current date when debt already meets or exceeds threshold", () => {
    const now = Date.now();
    const result = computeLiquidationDate(parseUnits("2000", 18), parseUnits("1000", 18), rate5pct);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeLessThanOrEqual(now + 1000);
  });

  it("returns a future date proportional to ln(threshold/debt) / rate", () => {
    const now = Date.now();
    const result = computeLiquidationDate(parseUnits("1000", 18), parseUnits("2000", 18), rate5pct);
    expect(result).not.toBeNull();
    const yearsUntilLiquidation = (result!.getTime() - now) / (365 * 24 * 60 * 60 * 1000);
    expect(yearsUntilLiquidation).toBeGreaterThan(10);
    expect(yearsUntilLiquidation).toBeLessThan(20);
  });
});

// ─── FixedPointMathLib ───

const ONE_E27 = 1000000000000000000000000000n;
const TWO_E27 = 2000000000000000000000000000n;
const THREE_E27 = 3000000000000000000000000000n;
const ONE_E18 = 1000000000000000000n;
const TWO_E18 = 2000000000000000000n;
const THREE_E18 = 3000000000000000000n;
const ONE_E8 = 100000000n;
const TWO_E8 = 200000000n;
const THREE_E8 = 300000000n;
const TWO_POINT_FIVE_E27 = 2500000000000000000000000000n;
const HALF_E27 = 500000000000000000000000000n;
const ONE_POINT_TWO_FIVE_E27 = 1250000000000000000000000000n;
const TWO_POINT_FIVE_E18 = 2500000000000000000n;
const HALF_E18 = 500000000000000000n;
const ONE_POINT_TWO_FIVE_E18 = 1250000000000000000n;
const TWO_POINT_FIVE_E8 = 250000000n;
const HALF_E8 = 50000000n;
const ONE_POINT_TWO_FIVE_E8 = 125000000n;

describe("FixedPointMathLib", () => {
  describe("mulDiv", () => {
    test("computes correct results for typical inputs", () => {
      expect(mulDiv(TWO_POINT_FIVE_E27, HALF_E27, ONE_E27)).toEqual(ONE_POINT_TWO_FIVE_E27);
      expect(mulDiv(TWO_POINT_FIVE_E18, HALF_E18, ONE_E18)).toEqual(ONE_POINT_TWO_FIVE_E18);
      expect(mulDiv(TWO_POINT_FIVE_E8, HALF_E8, ONE_E8)).toEqual(ONE_POINT_TWO_FIVE_E8);
      expect(mulDiv(369n, 271n, 100n)).toEqual(999n);
      expect(mulDiv(ONE_E27, ONE_E27, TWO_E27)).toEqual(HALF_E27);
      expect(mulDiv(ONE_E18, ONE_E18, TWO_E18)).toEqual(HALF_E18);
      expect(mulDiv(ONE_E8, ONE_E8, TWO_E8)).toEqual(HALF_E8);
      expect(mulDiv(TWO_E27, THREE_E27, TWO_E27)).toEqual(THREE_E27);
      expect(mulDiv(THREE_E18, TWO_E18, THREE_E18)).toEqual(TWO_E18);
      expect(mulDiv(TWO_E8, THREE_E8, TWO_E8)).toEqual(THREE_E8);
    });

    test("handles edge cases with zeros", () => {
      expect(mulDiv(0n, ONE_E18, ONE_E18)).toEqual(0n);
      expect(mulDiv(ONE_E18, 0n, ONE_E18)).toEqual(0n);
      expect(mulDiv(0n, 0n, ONE_E18)).toEqual(0n);
    });
  });

  describe("mulDivUp", () => {
    test("computes correct results for typical inputs", () => {
      expect(mulDivUp(TWO_POINT_FIVE_E27, HALF_E27, ONE_E27)).toEqual(ONE_POINT_TWO_FIVE_E27);
      expect(mulDivUp(TWO_POINT_FIVE_E18, HALF_E18, ONE_E18)).toEqual(ONE_POINT_TWO_FIVE_E18);
      expect(mulDivUp(TWO_POINT_FIVE_E8, HALF_E8, ONE_E8)).toEqual(ONE_POINT_TWO_FIVE_E8);
      expect(mulDivUp(369n, 271n, 100n)).toEqual(1000n);
      expect(mulDivUp(ONE_E27, ONE_E27, TWO_E27)).toEqual(HALF_E27);
      expect(mulDivUp(ONE_E18, ONE_E18, TWO_E18)).toEqual(HALF_E18);
      expect(mulDivUp(ONE_E8, ONE_E8, TWO_E8)).toEqual(HALF_E8);
      expect(mulDivUp(TWO_E27, THREE_E27, TWO_E27)).toEqual(THREE_E27);
      expect(mulDivUp(THREE_E18, TWO_E18, THREE_E18)).toEqual(TWO_E18);
      expect(mulDivUp(TWO_E8, THREE_E8, TWO_E8)).toEqual(THREE_E8);
    });

    test("handles edge cases with zeros", () => {
      expect(mulDivUp(0n, ONE_E18, ONE_E18)).toEqual(0n);
      expect(mulDivUp(ONE_E18, 0n, ONE_E18)).toEqual(0n);
      expect(mulDivUp(0n, 0n, ONE_E18)).toEqual(0n);
    });
  });
});

// ─── BorrowPositionInfo component ───

describe("BorrowPositionInfo", () => {
  const defaultProps = {
    projectedCollateral: parseUnits("10", 18),
    projectedDebt: parseUnits("5000", 18),
    liquidationThreshold: parseUnits("8500", 18),
    projectedLiquidationDate: new Date("2027-01-15T00:00:00Z"),
    availableToBorrow: parseUnits("2000", 18),
    currentDebt: parseUnits("5000", 18),
  };

  it("renders all position fields when data exists", () => {
    render(<BorrowPositionInfo {...defaultProps} />);
    expect(screen.getByText("Collateral")).toBeDefined();
    expect(screen.getByText("Debt")).toBeDefined();
    expect(screen.getByText("LTV")).toBeDefined();
    expect(screen.getByText("Buffer to Liquidation")).toBeDefined();
    expect(screen.getByText("Est. Liquidation Date")).toBeDefined();
    expect(screen.getByText("Available to Borrow")).toBeDefined();
  });

  it("displays formatted gSHIT value with 4 decimals", () => {
    render(<BorrowPositionInfo {...defaultProps} />);
    expect(screen.getByText(/10\.0000 gSHIT/)).toBeDefined();
  });

  it("displays formatted USDS debt with 2 decimals", () => {
    render(<BorrowPositionInfo {...defaultProps} />);
    expect(screen.getByText(/5,000\.00 USDS/)).toBeDefined();
  });

  it("shows empty state when no position data", () => {
    render(
      <BorrowPositionInfo
        projectedCollateral={0n}
        projectedDebt={0n}
        liquidationThreshold={0n}
        projectedLiquidationDate={null}
        availableToBorrow={0n}
        currentDebt={0n}
      />,
    );
    expect(screen.getByText("No position")).toBeDefined();
  });

  it("shows 'Projected Position' heading", () => {
    render(<BorrowPositionInfo {...defaultProps} />);
    expect(screen.getByText("Projected Position")).toBeDefined();
  });

  it("calculates buffer to liquidation correctly", () => {
    render(<BorrowPositionInfo {...defaultProps} />);
    expect(screen.getByText(/3,500\.00 USDS/)).toBeDefined();
  });

  it("shows zero buffer when debt exceeds liquidation threshold", () => {
    render(
      <BorrowPositionInfo
        {...defaultProps}
        projectedDebt={parseUnits("9000", 18)}
        liquidationThreshold={parseUnits("8500", 18)}
      />,
    );
    const bufferLabel = screen.getByText("Buffer to Liquidation");
    const bufferRow = bufferLabel.closest("div[class*='flex items-center justify-between']");
    expect(bufferRow?.textContent).toContain("0.00");
  });
});
