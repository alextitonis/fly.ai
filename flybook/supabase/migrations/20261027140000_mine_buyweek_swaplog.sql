-- The buy flow (2026-10-27, the buy-flow plan steps 4 and 5): Buy Week standing for the "You're in" card, and where
-- swap-box visitors drop off. Both written and read by the mine server only (mine/src/buyweek.ts); never public.

-- every $FLYAI buy or sell in the Buy Week window, one row per (tx, wallet): delta > 0 bought from a pool, < 0 sold
-- into one (wei, as text). A tx counts when $FLYAI left or entered a pool in it (Pons' v4 PoolManager, our GIGA pool);
-- the wallet is the person on the other end, not a router.
create table if not exists mine.buyweek_flows (
  id          text primary key,                      -- <tx hash>:<wallet>
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  delta       numeric not null,
  block       bigint not null,
  at          timestamptz not null
);
create index if not exists buyweek_flows_wallet on mine.buyweek_flows (wallet);

-- the scan's cursor, the contract cache, the buyer count: small values by key
create table if not exists mine.buyweek_state (
  key         text primary key,
  value       jsonb not null
);

-- one row per step of a swap-box session: quote shown -> route -> approved -> sent -> success | failed (and why)
create table if not exists mine.swap_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  session     text not null check (session ~ '^[a-z0-9]{8,32}$'),
  step        text not null check (step in ('quote', 'route', 'approved', 'sent', 'success', 'failed', 'gas_low', 'cancelled')),
  wallet      text check (wallet is null or wallet ~ '^0x[0-9a-f]{40}$'),
  route       text check (route is null or route in ('direct', 'relay', 'giga', 'gasless')),
  pay         text check (pay is null or pay ~ '^[A-Z]{2,6}$'),
  chain       int,
  usd         double precision,
  reason      text check (reason is null or char_length(reason) <= 160),
  page        text check (page is null or page ~ '^[a-z]{2,16}$')
);
create index if not exists swap_events_at on mine.swap_events (at);
create index if not exists swap_events_session on mine.swap_events (session);
