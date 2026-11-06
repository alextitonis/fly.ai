-- Fee drop (2026-11-06, the user: "every month all trading fees from pons will be split between holders (-10% that I
-- take extra) ... percentages will be according to amount holding ... in fly lock for a week"; a 1-2 month test,
-- tracking from 11-06). Each drop's pot is the dev wallet's Pons creator fees in its window (mine.gta_fees source
-- 'pons', which the GTA tracker keeps booking) less the 10%; it is split by each holder's AVERAGE $FLYAI over the
-- window (held + staked + FlyLock, sampled hourly), 200k average to take part. mine/src/feedrop.ts writes all of it.

-- one row per drop: how many hourly samples it has, and once closed what was paid
create table if not exists mine.feedrop_drops (
  drop        int primary key,
  samples     int not null default 0,
  last_at     timestamptz,
  closed_at   timestamptz,
  flyai_total double precision,          -- whole $FLYAI paid out (the fees converted)
  fees_usd    double precision           -- the fees the drop counted when it closed
);

-- a holder's running sum of hourly balances in one drop (whole $FLYAI); the average is sum / the drop's samples, so an
-- hour holding nothing counts as 0. contract: true for pools and other contracts (never in the split)
create table if not exists mine.feedrop_hold (
  drop        int not null references mine.feedrop_drops (drop),
  address     text not null check (address ~ '^0x[0-9a-f]{40}$'),
  sum_flyai   double precision not null default 0,
  last_flyai  double precision not null default 0,
  contract    boolean,
  primary key (drop, address)
);

-- the payout of a closed drop: each holder's share and its $FLYAI, sent locked through FlyLock (scripts/pay-feedrop.ts)
create table if not exists mine.feedrop_payouts (
  drop        int not null references mine.feedrop_drops (drop),
  address     text not null check (address ~ '^0x[0-9a-f]{40}$'),
  avg_flyai   double precision not null,
  share       double precision not null,
  flyai       double precision not null,
  tx          text,
  paid_at     timestamptz,
  primary key (drop, address)
);

alter table mine.feedrop_drops enable row level security;
alter table mine.feedrop_hold enable row level security;
alter table mine.feedrop_payouts enable row level security;
