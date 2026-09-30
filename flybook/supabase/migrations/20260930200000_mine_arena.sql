-- Fly Colosseum (mine/src/arena.ts, 2026-09-30): tournaments of Trader Flies on the compute server, in the `mine`
-- schema beside the other games (20260929180000_mine_money.sql). Entries and potions are paid from the on-site $FLYAI
-- balance (ledger kind 'bet', tx "arena:<tournament>:<fly>" and "arena-potion:<tournament>:<fly>:<potion>"), prizes
-- and refunds come back as 'payout' rows ("arena-prize:...", "arena-refund:..."), auras are 'bet' rows
-- ("arena-aura:<fly>:<aura>"). Times are Unix milliseconds, token amounts are wei as text.

-- one tournament: registration (open), the fights (running), then the results (done) or every entry refunded (void)
create table mine.arena_tournaments (
  id text primary key,
  name text not null,
  status text not null check (status in ('open', 'running', 'done', 'void')),
  entry_wei text not null,
  potion_wei text not null,
  fee_bps integer not null,
  min_entrants integer not null,
  max_entrants integer not null,
  max_per_wallet integer not null,
  -- sha256 of server_seed, shown from the start; the seed itself only once the tournament is over
  commit_hash text not null,
  server_seed text not null,
  -- the hash of every entry, fixed when registration closes
  digest text,
  -- entries and potions paid in; fee_wei and places are set when it is done
  pot_wei text not null default '0',
  fee_wei text,
  places text,
  opens_at bigint not null,
  closes_at bigint not null,
  created_at bigint not null,
  done_at bigint
);
create index arena_tournaments_by_time on mine.arena_tournaments (created_at);
create unique index arena_tournaments_one_live on mine.arena_tournaments ((1)) where status in ('open', 'running');

-- a fly entered by the wallet that owned it then; traits as read from the chain, potions as bought
create table mine.arena_entries (
  tournament text not null,
  fly integer not null,
  wallet text not null,
  client_seed text not null,
  traits text not null,
  potions text not null default '[]',
  paid_wei text not null,
  place integer,
  prize_wei text,
  claimed_at bigint,
  refunded_at bigint,
  created_at bigint not null,
  primary key (tournament, fly)
);
create index arena_entries_by_wallet on mine.arena_entries (wallet, created_at);

-- every fight (round -1 is the 3rd-place fight); b is null for a bye
create table mine.arena_matches (
  tournament text not null,
  round integer not null,
  slot integer not null,
  a integer not null,
  b integer,
  winner integer not null,
  how text not null check (how in ('ko', 'points', 'coin', 'bye')),
  seeds text,
  events text not null,
  primary key (tournament, round, slot)
);

-- auras: bought once for a fly, they stay with the fly whoever owns it; one is worn at a time
create table mine.arena_auras (
  fly integer not null,
  aura text not null,
  wallet text not null,
  paid_wei text not null,
  at bigint not null,
  primary key (fly, aura)
);
create table mine.arena_worn (
  fly integer primary key,
  aura text,
  at bigint not null
);
