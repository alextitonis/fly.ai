-- Soulbound badges (2026-10-31, mine/src/badges.ts, flytrade/contracts/src/FlyBadges.sol): what each wallet has done,
-- worked out from the chain's transfers, so the server can sign claim vouchers. Written and read by the mine server only.

-- the scan's cursor, the newest desk payout seen, and whether the history has been read once
create table if not exists mine.badge_state (
  key         text primary key,
  value       jsonb not null
);

-- each wallet's $FLYAI (held + staked + locked for it) and Trader Flies, when it last rose to each level and has stayed
-- there, and the $FLYAI it had when the OG window closed
create table if not exists mine.badge_holders (
  wallet      text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  balance     numeric(78, 0) not null default 0,
  since_low   timestamptz,
  since_high  timestamptz,
  og_amount   numeric(78, 0) not null default 0,
  flies       int not null default 0,
  since_fly1  timestamptz,
  since_fly10 timestamptz,
  since_fly50 timestamptz
);

-- the Fly Desk payouts each wallet claimed, one row per payout however many flies it claimed for
create table if not exists mine.badge_payouts (
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  epoch       int not null,
  primary key (wallet, epoch)
);

-- badges held on chain, from the contract's own logs: the leaderboard counts these
create table if not exists mine.badge_claims (
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  badge       int not null,
  at          timestamptz not null,
  primary key (wallet, badge)
);

-- earned for good (a claim doesn't change this; the chain says who claimed). OG isn't here: it's checked live.
create table if not exists mine.badge_earned (
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  badge       text not null,
  earned_at   timestamptz not null,
  primary key (wallet, badge)
);
