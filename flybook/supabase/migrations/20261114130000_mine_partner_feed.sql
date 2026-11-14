-- Feeding a partner NFT (2026-11-14, the user: partners "should be able to claim & stake and also feed"): with feeding on,
-- the NFT's weekly share of the Partners pot goes straight into the NFT's own trading wallet instead of the Sunday claim
-- (flytrade/vaults/allpool.py reads this; mine/src/partners.ts writes it for the NFT's owner in the pot). `owner` is who
-- switched it: a new owner of the NFT starts with feeding off (the pot only honours a row whose owner owns it now).
create table if not exists mine.partner_feed (
  desk_id     bigint primary key,                                   -- partnerflies.leaf_id(partner, token)
  owner       text not null check (owner ~ '^0x[0-9a-f]{40}$'),
  "on"        boolean not null default false,
  updated_at  timestamptz not null default now()
);
