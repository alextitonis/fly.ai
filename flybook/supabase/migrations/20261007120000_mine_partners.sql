-- Partners (2026-10-07, the user: "generalise it so we can set up for others easily"; flytrade/PARTNERS.md): another
-- project's NFT collection (any EVM chain) gets our Fly Wallets - activated by holding $FLYAI - and a shared pot, shown
-- on our site (/traderflies/partner?p=<id>). One row per partner: the wallets process (flytrade/vaults/partners.py)
-- re-reads the "on" rows every 5 minutes and the mine server (mine/src/partners.ts) every minute, so adding or
-- changing a partner needs no code and no deploy. Written by the mine server's admin API (PUT /api/admin/partners/:id).
-- config: see flytrade/vaults/partner.py (collection, fee_bps, partner_fee_to, partner_share, hold_flyai, wallets, pool).
create table mine.partners (
  id text primary key check (id ~ '^[a-z][a-z0-9]{1,19}$'),
  name text not null,
  "on" boolean not null default false,
  config jsonb not null,
  updated_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table mine.partners enable row level security;

-- the first partner: Bullas (Berachain, ERC-721 0x3338...81c2, ids 0..6968). Off until switched on (PARTNERS.md);
-- partner_fee_to: the dev wallet for now (the user 2026-10-07: "for their 2% use my wallet ... we will update later"). Its house token is GIGA
-- (Robinhood Chain 0x5Baa...F7D5; the user 2026-10-07: "only for the bullas pot & individuals"): the house option buys
-- GIGA dips instead of FLYAI; the activation hold stays $FLYAI
insert into mine.partners (id, name, "on", config) values ('bullas', 'Bullas', false, '{
  "collection": {"chain": "berachain", "chain_id": 80094, "rpc": "https://rpc.berachain.com",
                 "contract": "0x333814f5e16eee61d0c0b03a5b6abbd424b381c2", "first_id": 0, "last_id": 6968,
                 "explorer": "https://berascan.com",
                 "image": "https://i2c.seadn.io/bera_chain/c793940586f14b0ebe0165545c0f807e/4440fec1ed07b6283d81158edb0d73/0f4440fec1ed07b6283d81158edb0d73.png",
                 "url": "https://opensea.io/collection/bullas-5", "x": "TheBullas_"},
  "fee_bps": 400, "partner_fee_to": "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea", "partner_share": 0.5, "hold_flyai": 200000,
  "house_token": {"address": "0x5BaaeC1B70864f01dbdb747358FF59F2E2cCF7D5", "symbol": "GIGA"},
  "wallets": {"on": true},
  "pool": {"on": true, "mode": "paper", "asset": "USDG", "paper_usd": 2000, "brains": 1, "rule": "equal",
           "house_pct": 10, "house_dip_pct": 2, "launch_pct": 5, "epoch_days": 7}
}'::jsonb);
