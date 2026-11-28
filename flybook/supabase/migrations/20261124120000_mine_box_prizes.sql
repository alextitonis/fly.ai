-- Fly Boxes prize sender (mine/src/boxprizes.ts, 2026-11-24). The FlyBoxes contract on Robinhood Chain pays USDG,
-- $FLYAI, ETH and Robinhood NFTs itself; prizes on other chains (Ruyui + Bad Bunnz on Ethereum, Bullas + Booga Bullas
-- on Berachain) and WL spots it only names (Opened.offchain). The user (11-24): "Why not automatic? ... maybe the
-- server tracks?" -> mine watches Opened and sends them from the prize wallet (BOX_PRIZE_KEY), or writes the WL list.

-- every opened box, from the contract's Opened events
create table if not exists mine.box_opens (
  box_id      bigint primary key,
  tier        int not null,
  holder      text not null,          -- who opened it (msg.sender): other-chain prizes go here
  sent_to     text not null,          -- where the on-chain prizes went (Opened.to, e.g. a fly)
  offchain    text not null default '',
  tx          text not null,
  block       bigint not null,
  at          timestamptz not null default now()
);
create index if not exists box_opens_holder on mine.box_opens (holder);

-- the other-chain prizes, loaded before opening day (POST /api/admin/boxes/items). One row per NFT or WL spot; rows
-- of a tier are handed out in id order to boxes in the order they are opened (the order is fixed before anyone opens).
-- status: free -> (nft) pending -> sending -> sent | failed (needs a look: a contract wallet, a refused send...)
--               -> (wl) sent at once (the address is on the list)
create table if not exists mine.box_prize_items (
  id          bigserial primary key,
  tier        int not null,
  kind        text not null check (kind in ('nft', 'wl')),
  chain       text not null default '',   -- 'ethereum' | 'berachain' (nft)
  collection  text not null default '',
  token_id    text not null default '',
  label       text not null default '',   -- e.g. 'Bad Bunnz mint WL'
  box_id      bigint unique references mine.box_opens (box_id),
  recipient   text,
  status      text not null default 'free' check (status in ('free', 'pending', 'sending', 'sent', 'failed')),
  tx          text,
  error       text,
  updated_at  timestamptz not null default now(),
  unique (chain, collection, token_id, label)
);
create index if not exists box_prize_items_tier on mine.box_prize_items (tier, status, id);

create table if not exists mine.box_state (
  id          int primary key default 1 check (id = 1),
  last_block  bigint not null
);

alter table mine.box_opens enable row level security;
alter table mine.box_prize_items enable row level security;
alter table mine.box_state enable row level security;
