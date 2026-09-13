/**
 * Safety heuristics. Each function takes a "report" object (the data we've
 * gathered about a new token) and returns { ok: boolean, reason?: string }.
 *
 * Returning ok: false means the token failed a safety check. The scanner
 * still EMITS the alert (so you see everything), but tags it with a warning.
 */

export const HEURISTICS = {
  hasReasonableSymbol: (r) => {
    if (!r.symbol) return { ok: false, reason: "no symbol" };
    if (r.symbol.length > 12) return { ok: false, reason: "symbol too long" };
    if (/[^\x20-\x7E]/.test(r.symbol)) return { ok: false, reason: "non-ASCII symbol" };
    return { ok: true };
  },

  hasReasonableName: (r) => {
    if (!r.name) return { ok: false, reason: "no name" };
    if (r.name.length > 60) return { ok: false, reason: "name too long" };
    return { ok: true };
  },

  reasonableSupply: (r) => {
    if (r.totalSupply == null || r.decimals == null) return { ok: false, reason: "supply unknown" };
    const supply = Number(r.totalSupply) / 10 ** Number(r.decimals);
    if (!isFinite(supply) || supply <= 0) return { ok: false, reason: "invalid supply" };
    if (supply > 1e20) return { ok: false, reason: "supply suspiciously huge" };
    return { ok: true };
  },

  ownerRenounced: (r) => {
    if (r.owner == null) return { ok: true, reason: "no owner() function" }; // ok = no owner = renounced or no concept
    if (/^0x0+$/i.test(r.owner)) return { ok: true, reason: "owner renounced (0x0)" };
    return { ok: false, reason: `owner not renounced: ${r.owner}` };
  },

  pairedWithKnownQuote: (r) => {
    if (r.quoteSymbol === "unknown") return { ok: false, reason: "paired with unknown token" };
    return { ok: true };
  },
};

/**
 * Run all heuristics. Returns:
 *   { passed: [...], failed: [...], summary: "x/y passed" }
 */
export function evaluate(report) {
  const passed = [];
  const failed = [];
  for (const [name, fn] of Object.entries(HEURISTICS)) {
    const { ok, reason } = fn(report);
    (ok ? passed : failed).push({ check: name, reason });
  }
  return {
    passed,
    failed,
    summary: `${passed.length}/${passed.length + failed.length} passed`,
  };
}
