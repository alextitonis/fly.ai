// Questions asked by tagging the bot (2026-11-02, the user: "if i tag and ask how is the price"): plain keyword checks that
// pick a ! command, so "@fly.ai how's the price" answers like !price. No model. First match wins, so the more specific
// words go first ("market cap" before "market"). Nothing matched: the bot answers as a fly (fly.ts).

import { exactTarget } from "./research.ts";

export type Intent = { command: string; args: string[] };

// "can you check this project Foo": asked to look at something. The words below are the bot's own subjects, so "check the
// price" stays the price. A name needs a verb; a contract, @handle or link says what it is by itself.
const CHECK = /\b(check(?: out| on)?|scan|research|look ?up|look into|dyor(?: on)?|thoughts on|opinion on|what do you (?:think|know) (?:of|about)|wdyt (?:of|about)|tell me about|ask(?:ing)? about|info (?:on|about)|what about|heard of|review|vet)\b/i;
const LEGIT = /\bis (.+?) (?:legit|a scam|a rug|real|clean|bundled|safe)\b/i;
const FILLER = /\b(can|could|would|will|you|u|please|pls|plz|bro|ser|sir|mate|hey|hi|yo|gm|i|we|me|for|do|does|did|have|what|wdyt|tell|ask|asking|info|think|know|of|about|heard|look|into|up|out|on|at|check|scan|research|lookup|dyor|review|vet|thoughts|opinion|this|that|these|those|the|a|an|new|project|projects|token|coin|called|named|its|it|is|are|and)\b/gi;
const OURS = /\b(price|worth|leader ?board|lb|chart|stats|volume|liquidity|contract|ca|supply|burns?|desk|flydesk|payouts?|pot|market ?place|market|floor|partners?|bullas?|alpha|help|commands?|links?|website|wallets?|balance|my|mine|your|discord|server|channel|dm|dms|messages?|again|now|later|back|flyai|fly\.?ai)\b/i;

/** What a tagged message asks to have checked, or null. */
export function researchOf(text: string): string | null {
  const legit = LEGIT.exec(text);
  if (!CHECK.test(text) && !legit) return null;
  const exact = exactTarget(text);
  if (exact?.kind === "nft") return /^[a-z_]+:0x/.test(exact.value)
    ? `https://opensea.io/item/${exact.value.replace(":", "/")}` : `https://opensea.io/collection/${exact.value}`;
  if (exact) return exact.kind === "x" ? `@${exact.value}` : exact.value;
  const said = legit ? legit[1]! : text;
  if (OURS.test(said)) return null;
  const name = said.replace(FILLER, " ").replace(/[?!.,:;"'’]/g, " ").replace(/\s+/g, " ").trim();
  return name && name.split(" ").length <= 4 ? name : null;
}

const RULES: [RegExp, string][] = [
  [/\bpartners?(hips?)?\b|\bbullas?\b|\bbooga\b|\benjoyo+rs?\b|\bcollabs?\b/i, "partners"],
  [/\bbuy (a |an |one |some )?(trader )?fl(y|ies)\b(?!\.ai)|\bbuy (an? )?nft\b/i, "marketplace"],
  [/\bhow (can|do|to|should|could)\b.*\b(buy|get|purchase)\b|\bwhere\b.*\b(buy|get|purchase)\b|\bbuy (the |some )?\$?(fly\.?ai|token)\b|\bhow to (start|buy)\b|\bget started\b|\bwant to buy\b/i, "buy"],
  [/\bleader ?board\b|\blb\b|\btop (flies|fly|wallets?|traders?)\b|\bbest (flies|fly|wallets?|traders?)\b|\branking\b/i, "leaderboard"],
  [/\b(market ?cap|mcap|fdv|volume|liquidity|chart|stats)\b/i, "stats"],
  [/\b(contract|ca|supply|burn(s|ed)?|tokenomics|circulating)\b|\b(token )?address\b/i, "token"],
  [/\b(price|worth)\b|\bhow much\b/i, "price"],
  [/\balpha\b|\bsuggest(ions?)?\b|\brecommend(ations?)?\b|\b(what|which|anything|something) (should i|to|can i) (buy|ape)\b|\b(tokens|coins|gems?|calls|plays)\b|\b(any|good|new|hot) (token|coin|play|call)\b/i, "alpha"],
  [/\b(fly ?desk|desk|pot|payouts?)\b/i, "flydesk"],
  [/\b(market ?place|fly market|nft market|floor|opensea|buy (a )?(trader )?fl(y|ies)|trader fl(y|ies)|nfts?|breed(ing)?)\b/i, "marketplace"],
  [/\b(help|commands?)\b|what can you do/i, "help"],
  [/\bproject\b|\babout (you|this|fly|the)\b|\bwebsite\b|\blinks?\b|what(?:'s| is| does) (this|fly\.?ai|flyai)\b|what do you do\b|\bhow (does|do) (this|it|fly\.?ai) work\b/i, "project"],
];

/** The ! command a tagged message asks for, or null. `text` has the mentions taken out. */
export function intentOf(text: string): Intent | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  // a scan needs the word and something to scan: a site or a contract, never just a mention of an address
  const target = /\b(scan|rug ?check|is .* safe)\b/i.test(t) ? /0x[0-9a-fA-F]{40}/.exec(t)?.[0] : null;
  if (target) {
    const chain = /\b(robinhood|base|bsc|arbitrum)\b/i.exec(t)?.[1]?.toLowerCase();
    return { command: "scan", args: chain ? [target, chain] : [target] };
  }
  const asked = researchOf(t);
  if (asked) return { command: "research", args: asked.split(" ") };
  // the commands answer about $FLYAI: asked about another $TICKER, or a contract pasted without "scan", they stay quiet
  if (/\$(?!flyai\b)[a-z]{2,}/i.test(t) || /0x[0-9a-fA-F]{40}/.test(t)) return null;
  for (const [re, command] of RULES) {
    if (!re.test(t)) continue;
    if (command !== "leaderboard") return { command, args: [] };
    const span = /\b(24 ?h|today|day)\b/i.test(t) ? "24h" : /\b(7 ?d|week|weekly)\b/i.test(t) ? "7d" : /\b(all ?time|ever|all)\b/i.test(t) ? "all" : null;
    return { command, args: span ? [span] : [] };
  }
  return null;
}
