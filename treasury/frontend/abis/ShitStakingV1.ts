// Legacy SHIT Protocol v1 staking contract (0xFd31c7d00Ca47653c6Ce64Af53c1571f9C36566a).
// Minimal ABI: only the functions the frontend calls to unstake sSHIT v1 → SHIT v1.
export default [
  {
    inputs: [
      { internalType: "uint256", name: "_amount", type: "uint256" },
      { internalType: "bool", name: "_trigger", type: "bool" },
    ],
    name: "unstake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "index",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
