-- XP season 1 (2026-11-03, the user: "ok build it"; mine/src/xp.ts): XP for holding, active flies, fly-wallet deposits,
-- feeding the Fly Desk, marketplace trades, swap-box buys, claim-and-stake, breeding, FlightPass burns, real referrals,
-- a linked X account, X shares and Flybook days. It counts toward the New Year drop (pool size never announced).
-- Everything before the season start is backfilled by the same rules. Written and read by the mine server only.

create table if not exists mine.xp_state (
  key   text primary key,
  value jsonb not null
);

-- what each wallet holds right now and the XP its holding has built up to `at` (the last change); the server adds
-- the time since `at` when it reads. FLYAI amounts in base units; staked = FlyStaking, locked = FlyLock (beneficiary).
create table if not exists mine.xp_holders (
  wallet       text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  liquid       numeric not null default 0,
  staked       numeric not null default 0,
  locked       numeric not null default 0,
  flies        int not null default 0,
  at           timestamptz,
  hold_xp      double precision not null default 0,
  fly_xp       double precision not null default 0,
  streak_since timestamptz              -- holding without a sell since then (a sell restarts it)
);

-- who holds each Trader Fly, for the logs that name a fly but not its holder (Fed)
create table if not exists mine.xp_flies (
  id    int primary key,
  owner text not null
);

-- one-off XP from the chain or the site: market trades, swap-box buys, breeding, feeding, claim-and-stake, pass burns, X shares
create table if not exists mine.xp_events (
  id     bigint generated always as identity primary key,
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  source text not null check (source in ('market', 'buy', 'breed', 'feed', 'claimstake', 'passburn', 'share')),
  ref    text not null unique,         -- tx:logIndex, or x:<post id> for a share
  xp     double precision not null,
  at     timestamptz not null
);
create index if not exists xp_events_wallet on mine.xp_events (wallet);

-- each wallet's XP by source at the end of each day (the last tick's numbers), for the XP log: a day's gains are its
-- row minus the one before. One-off events are listed from xp_events instead.
create table if not exists mine.xp_days (
  wallet  text not null,
  day     date not null,
  sources jsonb not null,
  primary key (wallet, day)
);
