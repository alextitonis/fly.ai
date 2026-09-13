import { TOKENS, TokenName } from "@/lib/tokens";

/** Tab on the Wrap page. */
export type WrapMode = "wrap" | "unwrap";

/**
 * A concrete conversion path on the Wrap page: the tab plus the selected source
 * token. Each flow maps to a distinct contract call sequence (see useWrapFlowSequence):
 * - wrap-shit:            stake(to, amt, false, false) + unwrap(to, wstAmt)   SHIT → wstSHIT → stSHIT
 * - wrap-shit-to-wstshit: stake(to, amt, false, false)                       SHIT → wstSHIT
 * - wrap-stshit:          wrap(amt) on wstSHIT contract                      stSHIT → wstSHIT
 * - unwrap-wstshit:      unwrap(amt) on wstSHIT contract                     wstSHIT → stSHIT
 * - unwrap-wstshit-to-shit: unstake(to, amt, false, false)                   wstSHIT → SHIT
 * - unstake-stshit:     wrap(amt) + unstake(to, wstAmt, false, false)        stSHIT → wstSHIT → SHIT
 */
export type WrapFlow = "wrap-shit" | "wrap-shit-to-wstshit" | "wrap-stshit" | "unwrap-wstshit" | "unwrap-wstshit-to-shit" | "unstake-stshit";

/** Selectable source tokens per tab. The output token is determined by the flow. */
export const SOURCE_TOKENS: Record<WrapMode, readonly TokenName[]> = {
  wrap: [TokenName.SHIT, TokenName.STSHIT],
  unwrap: [TokenName.WSTSHIT, TokenName.STSHIT],
};

export function defaultSourceToken(mode: WrapMode): TokenName {
  return mode === "wrap" ? TokenName.SHIT : TokenName.WSTSHIT;
}

/** Resolve a `?token=` query value (matched by symbol, e.g. "stSHIT") to a valid source for the tab. */
export function parseSourceTokenParam(mode: WrapMode, value: string | null): TokenName | undefined {
  if (!value) return undefined;
  return SOURCE_TOKENS[mode].find(
    (name) => TOKENS[name].symbol.toLowerCase() === value.toLowerCase(),
  );
}

/** Available output tokens for a given source token in wrap mode. */
export function getOutputTokens(mode: WrapMode, sourceToken: TokenName): readonly TokenName[] {
  if (mode === "wrap") {
    if (sourceToken === TokenName.SHIT) return [TokenName.STSHIT, TokenName.WSTSHIT];
    if (sourceToken === TokenName.STSHIT) return [TokenName.WSTSHIT];
  } else {
    if (sourceToken === TokenName.WSTSHIT) return [TokenName.STSHIT, TokenName.SHIT];
    if (sourceToken === TokenName.STSHIT) return [TokenName.SHIT];
  }
  return [];
}

export function defaultOutputToken(mode: WrapMode, sourceToken: TokenName): TokenName {
  const outputs = getOutputTokens(mode, sourceToken);
  return outputs[0] ?? sourceToken;
}

export function getWrapFlow(mode: WrapMode, sourceToken: TokenName, outputToken: TokenName): WrapFlow {
  if (mode === "wrap") {
    if (sourceToken === TokenName.SHIT) {
      return outputToken === TokenName.WSTSHIT ? "wrap-shit-to-wstshit" : "wrap-shit";
    }
    if (sourceToken === TokenName.STSHIT) return "wrap-stshit";
    return "wrap-shit";
  }
  return sourceToken === TokenName.STSHIT ? "unstake-stshit" : outputToken === TokenName.SHIT ? "unwrap-wstshit-to-shit" : "unwrap-wstshit";
}

type FlowSpec = {
  input: TokenName;
  output: TokenName;
  /** How the output amount is derived: wstSHIT-index conversion, or 1:1 identity. */
  conversion: "wrap" | "unwrap" | "identity";
  /** User-facing copy, shared by the form button, modal, and toasts. */
  copy: {
    /** Header of the amount input, e.g. "Wrap" / "Unstake". */
    inputLabel: string;
    /** Modal title, e.g. "Wrap sSHIT". */
    title: string;
    /** Submit/execute button label, e.g. "Wrap sSHIT to wstSHIT". */
    action: string;
    /** Approval step label, e.g. "Approve Wrapping". */
    approve: string;
  };
  /** Verb forms for transaction toasts. */
  toast: { progressive: string; past: string; noun: string };
  /** Analytics action slug. */
  analyticsAction: string;
};

export const WRAP_FLOWS: Record<WrapFlow, FlowSpec> = {
  "wrap-shit": {
    input: TokenName.SHIT,
    output: TokenName.STSHIT,
    conversion: "identity",
    copy: {
      inputLabel: "Stake",
      title: "Stake SHIT",
      action: "Stake SHIT to stSHIT",
      approve: "Approve Staking",
    },
    toast: { progressive: "Staking", past: "Staked", noun: "Stake" },
    analyticsAction: "wrap",
  },
  "wrap-shit-to-wstshit": {
    input: TokenName.SHIT,
    output: TokenName.WSTSHIT,
    conversion: "wrap",
    copy: {
      inputLabel: "Stake & Wrap",
      title: "Stake SHIT to wstSHIT",
      action: "Stake SHIT to wstSHIT",
      approve: "Approve Staking",
    },
    toast: { progressive: "Staking", past: "Staked", noun: "Stake" },
    analyticsAction: "wrap_to_wstshit",
  },
  "wrap-stshit": {
    input: TokenName.STSHIT,
    output: TokenName.WSTSHIT,
    conversion: "wrap",
    copy: {
      inputLabel: "Wrap",
      title: "Wrap stSHIT",
      action: "Wrap stSHIT to wstSHIT",
      approve: "Approve Wrapping",
    },
    toast: { progressive: "Wrapping", past: "Wrapped", noun: "Wrap" },
    analyticsAction: "wrap_sshit",
  },
  "unwrap-wstshit": {
    input: TokenName.WSTSHIT,
    output: TokenName.STSHIT,
    conversion: "unwrap",
    copy: {
      inputLabel: "Unwrap",
      title: "Unwrap wstSHIT",
      action: "Unwrap wstSHIT to stSHIT",
      approve: "Approve Unwrapping",
    },
    toast: { progressive: "Unwrapping", past: "Unwrapped", noun: "Unwrap" },
    analyticsAction: "unwrap",
  },
  "unwrap-wstshit-to-shit": {
    input: TokenName.WSTSHIT,
    output: TokenName.SHIT,
    conversion: "unwrap",
    copy: {
      inputLabel: "Unwrap & Unstake",
      title: "Unwrap wstSHIT to SHIT",
      action: "Unwrap & Unstake wstSHIT to SHIT",
      approve: "Approve Unwrapping",
    },
    toast: { progressive: "Unwrapping", past: "Unwrapped", noun: "Unwrap" },
    analyticsAction: "unwrap_to_shit",
  },
  "unstake-stshit": {
    input: TokenName.STSHIT,
    output: TokenName.SHIT,
    conversion: "identity",
    copy: {
      inputLabel: "Unstake",
      title: "Unstake stSHIT",
      action: "Unstake stSHIT to SHIT",
      approve: "Approve Unstaking",
    },
    toast: { progressive: "Unstaking", past: "Unstaked", noun: "Unstake" },
    analyticsAction: "unstake_sshit",
  },
};
