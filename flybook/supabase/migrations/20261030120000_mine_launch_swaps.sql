-- Fly DEX (2026-10-30, flytrade/LAUNCHPAD-PLAN.md "Fly DEX"): the launchpad's tokens keep trading after graduation, in
-- their TOKEN/FLYAI GIGA pools. mine/src/launchpad.ts indexes those pools' Swap logs here so the /dex page keeps live
-- prices, volume and charts. launch_fills is both venues in one shape: curve trades and pool swaps.

create table if not exists mine.launch_swaps (
  id        text primary key,                  -- "<tx>:<log index>"
  token     text not null,
  trader    text not null,                     -- who sent the transaction (the pool only sees the router)
  buy       boolean not null,                  -- the trader got the token
  tokens    text not null,                     -- the token's side, raw (18 decimals)
  flyai     text not null,                     -- the FLYAI side, raw (18 decimals)
  usd       double precision not null,         -- the FLYAI side at the FLYAI price when indexed
  price_usd double precision not null,         -- the pool's price after the swap, in USD
  block     bigint not null,
  at        timestamptz not null
);
create index if not exists launch_swaps_token on mine.launch_swaps (token, block desc);
create index if not exists launch_swaps_token_at on mine.launch_swaps (token, at);
create index if not exists launch_trades_token_at on mine.launch_trades (token, at);

alter table mine.launch_tokens add column if not exists price_flyai double precision;       -- graduated: FLYAI per token
alter table mine.launch_tokens add column if not exists pool_trades int not null default 0;
alter table mine.launch_tokens add column if not exists pool_volume_usd double precision not null default 0;

create or replace view mine.launch_fills as
  select id, token, trader, buy, usdg::numeric::float8 / 1e6 as usd, tokens, price_usd, block, at, 'curve'::text as venue
    from mine.launch_trades
  union all
  select id, token, trader, buy, usd, tokens, price_usd, block, at, 'pool'::text as venue
    from mine.launch_swaps;

alter table mine.launch_swaps enable row level security;
