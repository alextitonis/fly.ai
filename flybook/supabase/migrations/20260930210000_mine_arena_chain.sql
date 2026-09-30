-- Fly Colosseum's record on chain (flytrade/contracts/src/ColosseumLedger.sol, mine/src/arenachain.ts): the
-- transactions that posted a season's seed commit and, when it is over, its revealed seed, results root and podium.
-- Null until the server has posted them (or always, while the ledger contract isn't set up).
alter table mine.arena_tournaments add column commit_tx text;
alter table mine.arena_tournaments add column result_tx text;
alter table mine.arena_tournaments add column results_root text;
