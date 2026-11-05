-- Fly chat packs (2026-11-05, flytrade/UTILITY-PLAN.md; the user: "5 messages free, more paid", "as burn"): a wallet gets
-- 5 free messages a day (15 with 500k $FLYAI held); past that it chats from packs it bought by burning $FLYAI (sent to
-- 0x…dEaD) in one transaction. The mine server checks the burn on chain and credits the messages (mine/src/flychat.ts).
-- Written and read by the mine server only; never public.
create table if not exists mine.chat_packs (
  tx        text primary key check (tx ~ '^0x[0-9a-f]{64}$'),   -- the burn: one pack credit per transaction, ever
  wallet    text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  flyai     numeric not null check (flyai > 0),                 -- burned, whole $FLYAI
  messages  int not null check (messages > 0),
  at        timestamptz not null default now()
);
create index if not exists chat_packs_wallet on mine.chat_packs (wallet);

-- what is left of every pack a wallet bought (spent one message at a time once the free ones are used up)
create table if not exists mine.chat_credits (
  wallet      text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  left_n      int not null default 0 check (left_n >= 0),
  updated_at  timestamptz not null default now()
);
