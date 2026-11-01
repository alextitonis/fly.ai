-- The flies' Solana requests (flytrade/vaults/vsolana.py, mine/src/vaults.ts): the 10-30 release added them without this,
-- so every "Turn on Solana" was refused by the check and answered as a server error.
alter table mine.vault_requests drop constraint vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant',
                  'sol_on', 'sol_off', 'sol_in', 'sol_out'));
