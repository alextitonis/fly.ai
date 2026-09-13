export type CardType = "visa" | "mastercard";
export type DepositType = "issuance" | "topup";

export interface FeeBreakdown {
  cardFee: number;
  topupFee: number;
  networkFee: number;
  bridgeFee: number;
  swapSlippage: number;
  total: number;
  netAmount: number;
}

export const CARD_FEES: Record<CardType, number> = {
  visa: 10,
  mastercard: 20,
};

export const TOPUP_FEE_RATE = 0.03;
export const NETWORK_FEE = 1.7;
export const BRIDGE_FEE_RATE = 0.005;
export const SWAP_SLIPPAGE_RATE = 0.005;

export function calculateIssuanceFee(cardType: CardType, _tokenPrice: number): FeeBreakdown {
  const cardFee = CARD_FEES[cardType];
  const bridgeFee = cardFee * BRIDGE_FEE_RATE;
  const swapSlippage = cardFee * SWAP_SLIPPAGE_RATE;
  const total = cardFee + bridgeFee + swapSlippage;
  return {
    cardFee,
    topupFee: 0,
    networkFee: 0,
    bridgeFee,
    swapSlippage,
    total,
    netAmount: cardFee,
  };
}

export function calculateTopupFee(
  desiredAmount: number,
  _tokenPrice: number,
): FeeBreakdown {
  const topupFee = desiredAmount * TOPUP_FEE_RATE;
  const bridgeFee = desiredAmount * BRIDGE_FEE_RATE;
  const swapSlippage = desiredAmount * SWAP_SLIPPAGE_RATE;
  const total = desiredAmount + topupFee + NETWORK_FEE + bridgeFee + swapSlippage;
  return {
    cardFee: 0,
    topupFee,
    networkFee: NETWORK_FEE,
    bridgeFee,
    swapSlippage,
    total,
    netAmount: desiredAmount - topupFee - NETWORK_FEE,
  };
}
