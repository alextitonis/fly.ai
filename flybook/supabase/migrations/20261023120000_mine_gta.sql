-- GTA VI giveaway (2026-10-23, the user: "a new page saying if you are eligible ... current winner and past winners,
-- current number of giveaway and a progress bar of the fees", min holding 100k $FLYAI): half of the Fly Desk fees and
-- of the dev wallet's Pons creator fees fill a pot; each time it passes another $70 one GTA VI copy is drawn among the
-- holders, weighted by holdings. mine/src/gta.ts writes all of it; the site reads it back through the mine server.

-- every fee counted once: "pons:<tx>:<log index>", "desk:<epoch>", "wallet:<vault_moves id>"
create table if not exists mine.gta_fees (
  id         text primary key,
  source     text not null check (source in ('pons', 'desk', 'wallet')),
  at         timestamptz not null,
  usd        double precision not null check (usd >= 0),
  detail     jsonb not null default '{}'::jsonb
);
create index if not exists gta_fees_at on mine.gta_fees (at);

-- one row per draw attempt: the entrants and their weights are fixed when the round opens, the winner comes from a
-- block hash mined after that (seed_block), so nobody - the team included - knows it while the list can still change.
-- status: waiting (seed block not mined yet), won (drawn, the team checks the wallet), sent (copy delivered),
-- void (failed the check or never answered: the round is drawn again as the next attempt)
create table if not exists mine.gta_draws (
  round        int not null,
  attempt      int not null default 1,
  status       text not null default 'waiting' check (status in ('waiting', 'won', 'sent', 'void')),
  opened_at    timestamptz not null default now(),
  target_usd   double precision not null,
  seed_block   bigint not null,
  seed_hash    text,
  drawn_at     timestamptz,
  entrants     int not null,
  total_weight text not null,                  -- whole $FLYAI (held + staked), all entrants
  entrants_list jsonb not null,               -- [[wallet, whole $FLYAI], ...] sorted by wallet: anyone can redo the pick
  winner       text,
  winner_weight text,
  contact      text,                          -- the winner's own (email / Discord / X): private, team only
  contact_at   timestamptz,
  note         text,                          -- the team's public note (e.g. "sent on Steam")
  updated_at   timestamptz not null default now(),
  primary key (round, attempt)
);

-- every wallet that ever received $FLYAI (from the token's Transfer logs) and the scan cursors
create table if not exists mine.gta_holders (
  address text primary key check (address ~ '^0x[0-9a-f]{40}$')
);
create table if not exists mine.gta_state (
  key   text primary key,
  value jsonb not null
);

alter table mine.gta_fees enable row level security;
alter table mine.gta_draws enable row level security;
alter table mine.gta_holders enable row level security;
alter table mine.gta_state enable row level security;
