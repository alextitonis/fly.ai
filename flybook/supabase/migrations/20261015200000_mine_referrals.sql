-- Referrals (2026-10-15, the user: "make urls that can add automatically, otherwise can set in profile for new (check
-- not old accounts cant set), it's not changable after set so you get 0.5% of each refferal fees"). mine/src/referrals.ts
-- owns these tables; the Fly Wallets (flytrade/vaults) and the Fly Desk (flytrade/desk/settle.py) read mine.referrals
-- and write mine.ref_earnings. The tiers live in flytrade/desk/referrals.py (mirrored in referrals.ts for the page).

-- every wallet the site has met, and when: sign-in adds a row. The wallets known before referrals launched are "old"
-- and can never be referred.
create table mine.wallets_seen (
  wallet text primary key,             -- lowercase
  first_seen timestamptz not null default now(),
  old boolean not null default false
);

insert into mine.wallets_seen (wallet, old)
select distinct lower(w), true from (
  select wallet as w from mine.sessions
  union select wallet from mine.profiles
  union select holder from mine.vault_ledger where holder is not null
  union select wallet from mine.arena_entries
  union select wallet from mine.roulette_games
  union select wallet from mine.slots_spins
  union select wallet from mine.race_games
  union select wallet from mine.ledger
) known
where w ~* '^0x[0-9a-f]{40}$'
on conflict (wallet) do nothing;

-- (the Fly Desk's payout trees live in public.desk_epochs, made outside the migrations: referrals.ts marks every wallet
-- paid before launch old when it starts - backfillDesk)

-- each wallet's own code, for its link (?ref=<code>); made the first time the wallet asks for it, never changed
create table mine.ref_codes (
  wallet text primary key,
  code text not null unique check (code ~ '^[a-z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);

-- who referred whom: set once, never changed or deleted by the API
create table mine.referrals (
  wallet text primary key,             -- the referred wallet (lowercase)
  referrer text not null,              -- lowercase
  via text not null check (via in ('link', 'profile')),
  set_at timestamptz not null default now(),
  funded_since timestamptz,            -- holding >= $20 in Fly Wallets since (cleared when it drops under)
  qualified_at timestamptz,            -- a "real" referral from here on: funded 7 days running, or paid by the desk
  check (wallet <> referrer)
);
create index referrals_referrer on mine.referrals (referrer);

-- what each referrer earned: 'wallet' = their share of a Fly Wallet's profit fee, sent with the withdrawal;
-- 'desk' = their share of a referred holder's weekly Fly Desk payout, claimable as fly #0 on the Claim page
create table mine.ref_earnings (
  id bigserial primary key,
  at timestamptz not null default now(),
  referrer text not null,
  wallet text not null,                -- the referred wallet it came from
  source text not null check (source in ('wallet', 'desk')),
  usd double precision not null default 0,
  token text,                          -- what was sent (wallet) or FLYAI (desk)
  amount text,                         -- base units, as text
  tx_hash text,
  epoch integer,                       -- the desk's epoch
  detail jsonb
);
create index ref_earnings_referrer on mine.ref_earnings (referrer, at desc);
create unique index ref_earnings_desk_once on mine.ref_earnings (referrer, wallet, epoch) where source = 'desk';
