// BondAggregator ABI — used for listing live markets, prices, scale
export const BOND_AGGREGATOR_ABI = [
  {
    type: "function",
    name: "marketCounter",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "liveMarketsBetween",
    inputs: [
      { name: "firstIndex_", type: "uint256" },
      { name: "lastIndex_", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isLive",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "marketPrice",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "marketScale",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "payoutFor",
    inputs: [
      { name: "amount_", type: "uint256" },
      { name: "id_", type: "uint256" },
      { name: "referrer_", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentCapacity",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAuctioneer",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTeller",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

// BondFixedTermSDA Auctioneer ABI — used for market details, terms, creating markets
export const BOND_AUCTIONEER_ABI = [
  {
    type: "function",
    name: "createMarket",
    inputs: [{ name: "params_", type: "bytes" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "markets",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "payoutToken", type: "address" },
      { name: "quoteToken", type: "address" },
      { name: "callbackAddr", type: "address" },
      { name: "capacityInQuote", type: "bool" },
      { name: "capacity", type: "uint256" },
      { name: "totalDebt", type: "uint256" },
      { name: "minPrice", type: "uint256" },
      { name: "maxPayout", type: "uint256" },
      { name: "sold", type: "uint256" },
      { name: "purchased", type: "uint256" },
      { name: "scale", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "terms",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "controlVariable", type: "uint256" },
      { name: "maxDebt", type: "uint256" },
      { name: "start", type: "uint48" },
      { name: "conclusion", type: "uint48" },
      { name: "vesting", type: "uint48" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentDebt",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxPayout",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMarketInfoForPurchase",
    inputs: [{ name: "id_", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "callbackAddr", type: "address" },
      { name: "payoutToken", type: "address" },
      { name: "quoteToken", type: "address" },
      { name: "vesting", type: "uint48" },
      { name: "maxPayout_", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

// BondFixedTermTeller ABI — used for purchasing bonds
export const BOND_TELLER_ABI = [
  {
    type: "function",
    name: "purchase",
    inputs: [
      { name: "recipient_", type: "address" },
      { name: "referrer_", type: "address" },
      { name: "id_", type: "uint256" },
      { name: "amount_", type: "uint256" },
      { name: "minAmountOut_", type: "uint256" },
    ],
    outputs: [
      { name: "payout_", type: "uint256" },
      { name: "vesting_", type: "uint48" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "redeem",
    inputs: [
      { name: "token_", type: "address" },
      { name: "amount_", type: "uint256" },
    ],
    outputs: [{ name: "payout_", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pendingPayout",
    inputs: [{ name: "token_", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ShitBonding ABI — contract deleted, kept as empty placeholder for compatibility
export const SHIT_BONDING_ABI = [] as const;
