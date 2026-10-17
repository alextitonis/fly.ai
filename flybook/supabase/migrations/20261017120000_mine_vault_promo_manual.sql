-- Manual deposit bonuses (2026-10-17, the user: "can you get it so i can set to specific fly nfts the bonus manually?
-- (from the $$pool we have already for these bonuses)"): an admin gives a chosen fly's wallet a bonus from the granter,
-- paid and locked like a competition win (mine/src/vaults.ts manualPromo). Each manual bonus is its own round
-- (round_ms = when it was given), so it never takes a competition slot and one fly can get more than one.
--   bonus_usd  this row's amount (null: PROMO_BONUS_USD, as before)
--   hold_days  how long it stays locked (null: PROMO_HOLD_DAYS)
--   manual     given by hand: paid without the competition's "their own money still in" check
alter table mine.vault_promos add column if not exists bonus_usd double precision;
alter table mine.vault_promos add column if not exists hold_days integer;
alter table mine.vault_promos add column if not exists manual boolean not null default false;
