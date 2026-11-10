-- Elysium money in and out (2026-11-09, mine/src/vaults.ts elysium, flytrade/vaults/velysium.py ely_in / ely_out): the
-- kinds were never added to the check, so "Bridge" and "Take out" on the Elysium card answered "internal error"
-- (2026-11-10, fly #748's holder). The same list as 20261106160000 plus the two.
alter table mine.vault_requests drop constraint vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant',
                  'sol_on', 'sol_off', 'sol_in', 'sol_out',
                  'perp_on', 'perp_set', 'perp_in', 'perp_out', 'perp_off', 'transfer',
                  'ely_in', 'ely_out'));
