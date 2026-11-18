-- The fly page's Sell button (mine/src/vaults.ts kind 'sell', flytrade/vaults/walletdesk.py) and Zero's money in / out
-- (kinds 'zero_in' / 'zero_out', vzero.py) were never added to the check: Sell answered "internal error" (2026-11-18,
-- flies #820 and #839). The same list as 20261110120000 plus the three.
alter table mine.vault_requests drop constraint vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant',
                  'sol_on', 'sol_off', 'sol_in', 'sol_out',
                  'perp_on', 'perp_set', 'perp_in', 'perp_out', 'perp_off', 'transfer',
                  'ely_in', 'ely_out', 'sell', 'zero_in', 'zero_out'));
