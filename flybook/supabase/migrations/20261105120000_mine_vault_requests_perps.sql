-- The flies' Perps requests (flytrade/vaults/vperps.py, mine/src/vaults.ts, 2026-11-03): without these kinds every
-- "Turn on Perps" is refused by the check and answered as a server error (as Solana's were until 20261101120000).
alter table mine.vault_requests drop constraint vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant',
                  'sol_on', 'sol_off', 'sol_in', 'sol_out',
                  'perp_on', 'perp_set', 'perp_in', 'perp_out', 'perp_off'));
