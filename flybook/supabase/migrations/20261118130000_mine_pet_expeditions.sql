-- Fly Pet expeditions (2026-11-18, flypet/EXPEDITIONS-PLAN.md phase 1; mine/src/expeditions.ts). The pet's fly goes on
-- timed trips kept on the server's clock and brings back cosmetic items. Nothing here is money or on chain.
-- Written and read by the mine server only.

-- one row per trip; the loot is rolled from `seed` when it's claimed, so the client never decides what it finds
create table if not exists mine.pet_trips (
  id          bigint generated always as identity primary key,
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  fly         bigint not null,                 -- a Trader Fly id, or a partner NFT's chat id
  place       text not null,
  minutes     int not null,                    -- the length picked (before the fly's Vitality shortens it)
  started_at  timestamptz not null,
  ends_at     timestamptz not null,
  seed        text not null,
  green       boolean not null default false,  -- the fly closed a green day when it left: +1 roll
  stats       jsonb not null,                  -- the stats it left with (traits can change on a breed)
  claimed_at  timestamptz,
  result      jsonb
);
create index if not exists pet_trips_wallet on mine.pet_trips (wallet, started_at desc);
-- one trip in flight per wallet
create unique index if not exists pet_trips_open on mine.pet_trips (wallet) where claimed_at is null;
alter table mine.pet_trips enable row level security;

-- the bag: how many of each item a wallet has
create table if not exists mine.pet_items (
  wallet    text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  item      text not null,
  n         int not null default 0 check (n >= 0),
  first_at  timestamptz not null default now(),
  primary key (wallet, item)
);
alter table mine.pet_items enable row level security;

-- the pet's own level (not the airdrop XP), what it wears, and the daily trips with their streak
create table if not exists mine.pet_state (
  wallet    text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  pet_xp    int not null default 0,
  equipped  jsonb not null default '{}'::jsonb,   -- slot -> item id
  day       date,                                 -- the UTC day `used` counts
  used      int not null default 0,               -- trips started that day
  streak    int not null default 0,               -- UTC days in a row with a trip
  last_day  date                                  -- the last day it started a trip
);
alter table mine.pet_state enable row level security;

-- a finished trip books a little season XP (2 a trip, 6 a day at most), like check-ins
alter table mine.xp_events drop constraint if exists xp_events_source_check;
alter table mine.xp_events add constraint xp_events_source_check
  check (source in ('market', 'buy', 'breed', 'feed', 'claimstake', 'passburn', 'share', 'checkin', 'quest', 'bug', 'refquest', 'expedition'));
