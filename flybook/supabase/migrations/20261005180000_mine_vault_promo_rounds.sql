-- Deposit competition rounds (2026-10-05, the user: "can we do for 5 today ... same from yesterday can take again"):
-- each round is one PROMO_START_MS. One bonus per wallet and per holder IN A ROUND (mine/src/vaults.ts), so
-- yesterday's winners can win today's round. The holder index was dropped by hand on 2026-10-04 (promo #11, a
-- manual second-wallet bonus); this makes that the migrations' state too. Each round also has its own slots for the
-- Ruyui wallets (chain 'ruyui', ledger/requests under that chain; the user: "5 for us and 5 for the ruyui").
alter table mine.vault_promos add column if not exists round_ms bigint not null default 0;
alter table mine.vault_promos add column if not exists chain text not null default 'robinhood'
  check (chain in ('robinhood', 'ruyui'));
update mine.vault_promos set round_ms = 1791118981000 where round_ms = 0;          -- the 2026-10-04 round
alter table mine.vault_promos drop constraint if exists vault_promos_wallet_key;
drop index if exists mine.vault_promos_holder;
create unique index if not exists vault_promos_wallet_round on mine.vault_promos (wallet, round_ms);
