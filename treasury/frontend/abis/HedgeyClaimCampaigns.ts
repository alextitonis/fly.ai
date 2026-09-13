export const HEDGEY_CLAIM_CAMPAIGNS_ABI = [
  {
    type: "function",
    name: "claimed",
    inputs: [
      { name: "campaignId", type: "bytes16" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "campaigns",
    inputs: [{ name: "id", type: "bytes16" }],
    outputs: [
      { name: "manager", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "end", type: "uint256" },
      { name: "tokenLockup", type: "uint8" },
      { name: "root", type: "bytes32" },
      { name: "delegating", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;
