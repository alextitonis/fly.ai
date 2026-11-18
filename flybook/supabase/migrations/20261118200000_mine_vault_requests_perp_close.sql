-- Close one Perps position from the fly page (2026-11-18, the user: "sell option for perps (shorts/longs) like we have
-- for the tokens"): kind 'perp_close' (mine/src/vaults.ts + partners.ts action "close", flytrade/vaults/vperps.py).
-- The same list as 20261118120000 plus the one.
alter table mine.vault_requests drop constraint vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant',
                  'sol_on', 'sol_off', 'sol_in', 'sol_out',
                  'perp_on', 'perp_set', 'perp_in', 'perp_out', 'perp_off', 'perp_close', 'transfer',
                  'ely_in', 'ely_out', 'sell', 'zero_in', 'zero_out'));
