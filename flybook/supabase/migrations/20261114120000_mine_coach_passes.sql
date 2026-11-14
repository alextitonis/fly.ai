-- The Fly Pet Coach pass (2026-11-14, flytrade/COACH-PLAN.md, mine/src/coachpass.ts): Coach mode in Fly Pet needs a live
-- pass, paid from the buyer's own wallet in USDG or $FLYAI on Robinhood Chain (one transfer to the pay-to wallet, checked
-- on chain, each transaction once). A "pass" row is one period (30 days, its hours of Coach mode); a "topup" row adds
-- hours to the period running when it was bought (same period_start / period_end). Never public as rows.
create table if not exists mine.coach_passes (
  id            bigint generated always as identity primary key,
  wallet        text not null check (wallet ~ '^0x[0-9a-f]{40}$'),        -- the payer: the pass is theirs
  kind          text not null check (kind in ('pass', 'topup')),
  token         text not null check (token in ('USDG', 'FLYAI')),
  amount        numeric not null,                                         -- whole tokens paid
  usd           numeric not null,                                         -- its dollars when checked
  discount_pct  int not null default 0,                                   -- the staker discount applied
  hours         numeric not null,                                         -- Coach mode hours it gives
  tx            text not null unique check (tx ~ '^0x[0-9a-f]{64}$'),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  created_at    timestamptz not null default now(),
  check (period_end > period_start)
);
create index if not exists coach_passes_wallet on mine.coach_passes (wallet, period_end);
