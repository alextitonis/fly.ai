// Legacy SHIT Protocol v1 wrapped sSHIT (wsSHIT, 0xCa76543Cf381ebBB277bE79574059e32108e3E65).
// Minimal ABI: unwrap wsSHIT → sSHIT v1 (no approval needed — burns the caller's own wsSHIT).
export default [
  {
    inputs: [{ internalType: "uint256", name: "_amount", type: "uint256" }],
    name: "unwrap",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    // wsSHIT (18 decimals) → sSHIT v1 (9 decimals). Not 1:1 — scaled by the gSHIT index.
    inputs: [{ internalType: "uint256", name: "_amount", type: "uint256" }],
    name: "wSHITTosSHIT",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
