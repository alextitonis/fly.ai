-- Fly Colosseum's shop (mine/src/arena.ts): permanent potions and where the shop's money goes.
-- arena_potions: a potion bought for good for one fly (like an aura, it stays with the fly and goes to its next owner);
-- a fly that has it adds it to any season's entry for free.
-- arena_revenue: what potions and auras took in, for the dev wallet (not the pot). A season's potion money waits until the
-- season is done (a season called off refunds it, sent_tx 'void'); the rest goes out at once. sent_tx: null = not sent,
-- 'pending:<batch>' while a transfer is being sent, then the transfer's hash.
create table mine.arena_potions (
  fly integer not null,
  potion text not null,
  wallet text not null,
  paid_wei text not null,
  at bigint not null,
  primary key (fly, potion)
);

create table mine.arena_revenue (
  id bigserial primary key,
  kind text not null,
  ref text not null unique,
  amount_wei text not null,
  tournament text,
  at bigint not null,
  sent_tx text
);
create index arena_revenue_unsent on mine.arena_revenue (tournament) where sent_tx is null;
