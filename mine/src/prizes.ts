/**
 * The one switch for $FLYAI prizes (2026-11-28, the user: "only $flyai rewards are removed for now so we can raise the
 * price", "we should be able to enable them later when we want again"). Off unless FLYAI_PRIZES = 1.
 *
 * While off: the trading leaderboard (tradeboard.ts) lists no prizes, the Fly League (league.ts) no $ prizes (its XP
 * stays), and the site hides every prize line. XP, badges and the Colosseum (players' own entry pot) are not touched.
 * Flyverse runs inside this server (flyverse-hook.ts) and reads the same FLYAI_PRIZES (flyverse/server/story.ts prizesOn:
 * episode rewards and Fly Jam prizes). The Trader Flies leaderboard and League pages follow what this server returns.
 * Turn back on: `fly secrets set FLYAI_PRIZES=1 -a flyai-mine`; Flybook: PRIZES_ON = true in flybook/web/src/seasons.ts;
 * the static copy (index/token/roadmap/faq/llms.txt prize sentences) comes back from git (the 2026-11-28 change).
 */
export const flyaiPrizesOn = (env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean =>
  env.FLYAI_PRIZES === "1";
