-- Deposit competition ("promo", flytrade/FLYWALLET-PLAN.md 2026-10-04, the user: "for the next 10 people that will
-- deposit (min 20$) i will add 20$ extra, but we need a way for people to not just withdraw the $"). The mine server
-- (mine/src/vaults.ts) finds the first PROMO_SLOTS wallets whose deposits since PROMO_START_MS reached PROMO_MIN_USD
-- (candidate), the user approves or rejects each one, mine pays the bonus in $FLYAI from the granter into the fly's
-- wallet (approved -> sending -> paid | error: may have been sent, the operator settles it) and asks the desk to lock
-- it for PROMO_HOLD_DAYS (vault_requests kind 'promo_grant'). One per wallet and per holder, rejected ones included.
alter table mine.vault_requests drop constraint if exists vault_requests_kind_check;
alter table mine.vault_requests add constraint vault_requests_kind_check
  check (kind in ('register', 'withdraw', 'move', 'pot_create', 'pot_join', 'pot_leave', 'pass_burn', 'promo_grant'));

create table mine.vault_promos (
  id bigserial primary key,
  wallet text not null unique,         -- the fly's wallet (checksummed, as the desk books it)
  fly_id integer,
  holder text not null,                -- who deposited (the bonus is theirs after the hold)
  deposit_usd double precision,        -- the deposits' sum when it first reached the minimum
  qualified_at timestamptz,            -- when it did: first come, first served
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'sending', 'paid', 'rejected', 'error')),
  grant_usd double precision,
  grant_wei text,
  grant_tx text,
  paid_at timestamptz,                 -- the hold runs from here
  request_id bigint,                   -- the desk's 'promo_grant' request
  decided_by text,                     -- "admin-token" or the admin's wallet
  decided_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create unique index vault_promos_holder on mine.vault_promos (lower(holder));

alter table mine.vault_promos enable row level security;
