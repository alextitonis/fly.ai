-- Follow a fly (2026-11-05, flytrade/UTILITY-PLAN.md; the user: copy-trading paid in $FLYAI to the fly's owner): a
-- week's pass lets one fly (the follower) copy another fly's trades (its wallet in the follower's "track" option). Paid
-- by the follower's holder from their own wallet: 90% to the followed fly's owner, 10% burned (0x…dEaD), two transfers
-- the mine server checks on chain before it writes the pass (mine/src/follow.ts). The wallets desk reads the live passes
-- (flytrade/vaults/vtrack.py): without one, a fly can't track another Trader Fly's wallet. Never public as rows; the
-- counts are.
create table if not exists mine.follow_passes (
  id               bigint generated always as identity primary key,
  follower_fly     int not null,
  follower_wallet  text not null check (follower_wallet ~ '^0x[0-9a-f]{40}$'),   -- the follower fly's own wallet
  target_fly       int not null,
  target_wallet    text not null check (target_wallet ~ '^0x[0-9a-f]{40}$'),
  payer            text not null check (payer ~ '^0x[0-9a-f]{40}$'),             -- the follower's holder, who paid
  owner            text not null check (owner ~ '^0x[0-9a-f]{40}$'),             -- the followed fly's owner, who was paid
  paid_flyai       numeric not null,                                             -- to the owner, whole $FLYAI
  burned_flyai     numeric not null,
  owner_tx         text not null unique check (owner_tx ~ '^0x[0-9a-f]{64}$'),
  burn_tx          text not null unique check (burn_tx ~ '^0x[0-9a-f]{64}$'),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  created_at       timestamptz not null default now(),
  check (follower_fly <> target_fly)
);
create index if not exists follow_passes_target on mine.follow_passes (target_fly, ends_at);
create index if not exists follow_passes_follower on mine.follow_passes (follower_wallet, ends_at);
