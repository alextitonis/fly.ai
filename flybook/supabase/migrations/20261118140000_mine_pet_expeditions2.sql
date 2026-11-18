-- Fly Pet expeditions phase 2 (2026-11-18, flypet/EXPEDITIONS-PLAN.md; mine/src/expeditions.ts): the $FLYAI speed-up,
-- the weekly swarm's rewards, and the daily feed. Written and read by the mine server only.

-- a trip brought home early by a $FLYAI burn; each burn transaction counts once
create table if not exists mine.pet_speedups (
  tx          text primary key check (tx ~ '^0x[0-9a-f]{64}$'),
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  trip        bigint not null references mine.pet_trips (id),
  burned_wei  numeric not null,
  at          timestamptz not null
);
create index if not exists pet_speedups_wallet on mine.pet_speedups (wallet, at desc);
alter table mine.pet_speedups enable row level security;

-- a swarm tier's item, given once per wallet per week
create table if not exists mine.pet_swarm_rewards (
  wallet  text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  week    date not null,                -- the UTC Monday the week starts
  tier    int not null,
  item    text not null,
  at      timestamptz not null default now(),
  primary key (wallet, week, tier)
);
alter table mine.pet_swarm_rewards enable row level security;

-- the daily feed (a little pet XP once a UTC day)
alter table mine.pet_state add column if not exists feed_day date;

-- the board and the swarm count read claimed trips by time
create index if not exists pet_trips_claimed on mine.pet_trips (claimed_at) where claimed_at is not null;
