-- Mining referrals (2026-10-16, the user: 0.5% "for mining paid by fly.ai"): the month's snapshot (mine/src/server.ts,
-- payouts.withReferrals) adds 0.5% of each referred miner's amount to their referrer's claim, on top of the pool, and
-- records it here as source 'mining' (detail.month).
alter table mine.ref_earnings drop constraint if exists ref_earnings_source_check;
alter table mine.ref_earnings add constraint ref_earnings_source_check check (source in ('wallet', 'desk', 'mining'));
