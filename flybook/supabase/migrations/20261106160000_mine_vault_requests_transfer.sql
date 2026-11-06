-- Move money from one fly to another (2026-11-06, a holder: "a way to move funds quickly from one fly to another",
-- "redistribution of funds"; mine/src/vaults.ts transfer, flytrade/vaults/walletdesk.py transfer): one request on the
-- source fly's wallet, its destinations in params.to = [{ wallet, usd }]. Without the kind the check refuses it.
alter table mine.vault_requests drop constraint vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant',
                  'sol_on', 'sol_off', 'sol_in', 'sol_out',
                  'perp_on', 'perp_set', 'perp_in', 'perp_out', 'perp_off', 'transfer'));
