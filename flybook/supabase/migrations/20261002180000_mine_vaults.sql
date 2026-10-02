-- Fly Wallets (flytrade/FLYWALLET-PLAN.md, 2026-10-02): each Trader Fly's own on-chain vault (FlyVault), or a pot
-- several of one holder's flies share. The money lives in the contracts; these tables hold what the owners chose
-- (settings, written by the mine server for the signed-in holder) and what the vault desk did (flytrade/vaults:
-- trades, marks, events, its own state, the public leaderboard). Vault addresses are checksummed text; times are
-- timestamptz (the desk's convention) except the settings' updated_at_ms (the mine server's Unix ms).

-- the owner's settings per vault (flytrade/vaults/wsettings.py validates every document the desk reads)
create table mine.vault_settings (
  vault text primary key,
  doc jsonb not null,
  version text not null,               -- sha of the document, stamped on every trade it made
  updated_by text not null,            -- the holder's wallet that saved it
  updated_at_ms bigint not null
);

-- every trade a vault made (or was refused), as the desk's desk_trades
create table mine.vault_trades (
  id bigserial primary key,
  at timestamptz not null default now(),
  vault text not null,
  book text not null,                  -- "vault:<addr>" (the brain) | "vault:<addr>/<option>"
  fly_id text,
  tag text not null,                   -- brain | trend | dip | momentum | flush | fresh | reversal | close | gas | cash
  mode text not null,
  version text,
  symbol text not null,
  side text not null,
  qty double precision,
  usd double precision,
  price double precision,
  cost_usd double precision,
  quote jsonb,
  tx_hash text,
  status text not null default 'filled',
  reason jsonb
);
create index vault_trades_vault on mine.vault_trades (vault, at);
create index vault_trades_at on mine.vault_trades (at);

-- each vault's value every bar: the stats and the leaderboard's curves
create table mine.vault_marks (
  id bigserial primary key,
  at timestamptz not null default now(),
  vault text not null,
  value_usd double precision not null,
  cash_usd double precision,
  principal_usd double precision,      -- money put in (on chain), so profit = value - principal
  locked_usd double precision
);
create index vault_marks_vault on mine.vault_marks (vault, at);

create table mine.vault_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  vault text,
  detail jsonb
);
create index vault_events_at on mine.vault_events (at);

-- the vault desk's own state (books, minds, candles, chain cursor), key/value as desk_state
create table mine.vault_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- snapshots the site reads through the mine server (leaderboard, per-vault stats)
create table mine.vault_public (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- FlightPass burns into a fly (FlyVaultFactory.PassBurned): the pass's balance + the house grant paid into the vault.
-- new -> claimed (the pass's ledger emptied, amounts fixed) -> sending -> paid | error (may have been sent: the operator)
create table mine.vault_grants (
  pass_id integer primary key,
  fly_id integer not null,
  holder text not null,
  vault text not null,
  burn_tx text not null,
  status text not null check (status in ('new', 'claimed', 'sending', 'paid', 'error')),
  pass_wei text,
  grant_wei text,
  grant_tx text,
  error text,
  created_at_ms bigint not null,
  done_at_ms bigint
);

alter table mine.vault_grants enable row level security;
alter table mine.vault_settings enable row level security;
alter table mine.vault_trades enable row level security;
alter table mine.vault_marks enable row level security;
alter table mine.vault_events enable row level security;
alter table mine.vault_state enable row level security;
alter table mine.vault_public enable row level security;
