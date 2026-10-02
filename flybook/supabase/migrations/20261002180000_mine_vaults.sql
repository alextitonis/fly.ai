-- Fly Wallets (flytrade/FLYWALLET-PLAN.md, 2026-10-02): each Trader Fly's own wallet, or a pot several of one holder's
-- flies share. Redesign 2026-10-02 late (user): a plain wallet per fly whose private key the vault desk keeps,
-- encrypted (vault_wallets), with the money rules in the desk (vault_ledger, vault_moves, vault_requests) instead of a
-- vault contract. The "vault" columns below are those wallets' addresses. These tables also hold what the owners chose
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

-- FlightPass burns into a fly: the owner registers it (pending), sends the pass to 0x...dEaD (new), the pass's balance +
-- the house grant are paid into the fly's wallet: claimed (the pass's ledger emptied, amounts fixed) -> sending -> paid
-- | error (may have been sent: the operator). One per fly (fly_id unique).
create table mine.vault_grants (
  pass_id integer primary key,
  fly_id integer not null unique,
  holder text not null,
  vault text not null,                 -- the fly's wallet
  burn_tx text not null,
  status text not null check (status in ('pending', 'new', 'claimed', 'sending', 'paid', 'error')),
  pass_wei text,
  grant_wei text,
  grant_tx text,
  error text,
  created_at_ms bigint not null,
  done_at_ms bigint
);

-- one wallet per fly (or pot): the same address on every EVM chain. The private key is AES-256-GCM encrypted under the
-- vault desk's VAULT_MASTER_KEY (key_version names which); only the desk decrypts it. Never exposed by any API.
create table mine.vault_wallets (
  id text primary key,                 -- "fly:<id>" | "pot:<n>"
  fly_id integer unique,               -- null for a pot
  address text not null unique,        -- checksummed
  enc_key text not null,               -- base64 ciphertext + tag
  nonce text not null,                 -- base64, 12 bytes
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);

-- whose money is in a wallet on a chain, and how much of it was put in (the profit fee's base). Written by the desk.
create table mine.vault_ledger (
  wallet text not null,
  chain text not null,                 -- robinhood | base | arbitrum | bsc | polygon
  holder text,                         -- who gets paid (null: nobody's money in it)
  principal_usd double precision not null default 0,
  locked_usd double precision not null default 0,   -- FlightPass grant money: trades, never withdrawn
  closing boolean not null default false,           -- the fly was sold: sell out, pay the holder, clear
  gas_advanced_wei text not null default '0',       -- gas the station lent it, repaid first on a withdrawal
  updated_at timestamptz not null default now(),
  primary key (wallet, chain)
);

-- every money movement the desk booked, append-only: deposits, withdrawals, fees, grants, payouts of sold flies
create table mine.vault_moves (
  id bigserial primary key,
  at timestamptz not null default now(),
  wallet text not null,
  chain text not null,
  kind text not null,                  -- deposit | withdraw | fee | grant | release | gas_advance | gas_repay
  holder text,
  token text,
  amount text,                         -- base units
  usd double precision,
  tx_hash text,
  detail jsonb
);
create index vault_moves_wallet on mine.vault_moves (wallet, at);

-- what signed-in holders asked for (mine server, after checking the session and the fly's owner); the desk does it
create table mine.vault_requests (
  id bigserial primary key,
  at timestamptz not null default now(),
  wallet text not null,
  chain text not null,
  kind text not null check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn')),
  requester text not null,             -- the signed-in wallet
  params jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'doing', 'done', 'refused', 'error')),
  result jsonb,
  done_at timestamptz
);
create index vault_requests_open on mine.vault_requests (status, at);

alter table mine.vault_wallets enable row level security;
alter table mine.vault_ledger enable row level security;
alter table mine.vault_moves enable row level security;
alter table mine.vault_requests enable row level security;
alter table mine.vault_grants enable row level security;
alter table mine.vault_settings enable row level security;
alter table mine.vault_trades enable row level security;
alter table mine.vault_marks enable row level security;
alter table mine.vault_events enable row level security;
alter table mine.vault_state enable row level security;
alter table mine.vault_public enable row level security;
