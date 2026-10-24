-- Fly Launchpad (flytrade/LAUNCHPAD-PLAN.md, 2026-10-24): what mine/src/launchpad.ts indexes from the FlyLaunchpad
-- contract's events (Launched, Trade, SoldOut, Graduated) and the launched tokens' Transfer logs, so the /launch page
-- reads launches, curves, trades and holders from the mine server instead of the chain. Amounts are raw base units
-- as text (USDG 6 decimals, tokens and FLYAI 18).

create table if not exists mine.launch_tokens (
  token         text primary key check (token ~ '^0x[0-9a-f]{40}$'),
  creator       text not null,
  pool          text not null,
  name          text not null,
  symbol        text not null,
  uri           text not null default '',
  created_block bigint not null,
  created_at    timestamptz not null,
  open_at       timestamptz not null,
  rules         jsonb not null,                -- the launch's own rules (x0, y0, fees, protection)
  state         text not null default 'curve' check (state in ('curve', 'sold_out', 'graduated')),
  x             text not null,                 -- virtual USDG now (x - rules.x0 = the curve's real USDG)
  y             text not null,                 -- virtual tokens now
  price_usd     double precision not null default 0,
  trades        int not null default 0,
  volume_usdg   text not null default '0',
  sold_out_at   timestamptz,
  graduated_at  timestamptz,
  position_id   text,
  pool_flyai    text,                          -- FLYAI put in the pool at graduation
  pool_tokens   text
);
create index if not exists launch_tokens_created on mine.launch_tokens (created_block desc);
create index if not exists launch_tokens_creator on mine.launch_tokens (creator);

-- every curve trade: "<tx>:<log index>"
create table if not exists mine.launch_trades (
  id        text primary key,
  token     text not null,
  trader    text not null,
  buy       boolean not null,
  usdg      text not null,                     -- into the curve (buy, after fee and tax) / out of it (sell, before fee)
  tokens    text not null,
  fee       text not null,
  tax       text not null,
  price_usd double precision not null,         -- the curve's price after the trade
  block     bigint not null,
  at        timestamptz not null
);
create index if not exists launch_trades_token on mine.launch_trades (token, block desc);
create index if not exists launch_trades_trader on mine.launch_trades (trader);

-- balances from the launched tokens' Transfer logs (the launchpad's own balance included)
create table if not exists mine.launch_holders (
  token   text not null,
  wallet  text not null,
  balance numeric not null default 0,
  primary key (token, wallet)
);
create index if not exists launch_holders_top on mine.launch_holders (token, balance desc);

create table if not exists mine.launch_state (
  key   text primary key,
  value jsonb not null
);

alter table mine.launch_tokens enable row level security;
alter table mine.launch_trades enable row level security;
alter table mine.launch_holders enable row level security;
alter table mine.launch_state enable row level security;
