-- Quests (mine/src/quests.ts), 2026-11-07: paid rerolls and the "post about fly.ai on X" quest.
-- The user (11-06): "option to reroll quests with burning $flyai (either completed or not to get new even if you did so
-- you can do more)"; "burn use the normal pons burn function"; "make a meme or something funny".

-- one row per paid reroll: the burn transaction (counted once), the group it moved on, and when (a paid slot only
-- counts what is done after it)
create table if not exists mine.xp_quest_buys (
  tx          text primary key check (tx ~ '^0x[0-9a-f]{64}$'),
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  day         date not null,
  grp         text not null check (grp in ('visit', 'social', 'move')),
  burned_wei  numeric not null,
  at          timestamptz not null default now()
);
create index if not exists xp_quest_buys_wallet_day on mine.xp_quest_buys (wallet, day);

-- X posts counted for the xpost quest: each post once, at the post's own time
create table if not exists mine.xp_quest_posts (
  post_id     text primary key,
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  day         date not null,
  posted_at   timestamptz not null,
  counted_at  timestamptz not null default now()
);
create index if not exists xp_quest_posts_wallet on mine.xp_quest_posts (wallet, posted_at);

alter table mine.xp_quest_buys enable row level security;
alter table mine.xp_quest_posts enable row level security;
