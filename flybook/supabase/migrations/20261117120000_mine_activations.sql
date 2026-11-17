-- Activations (mine/src/activations.ts, 2026-11-17): when each trading wallet first went live. One row per unit:
-- a Trader Fly's wallet (book 'fly', unit = its address) or a partner NFT's wallet (book = the partner id, e.g.
-- 'waifus'; unit = 'waifus:<address>'). "Live" = the desk's published stats say active and it holds >= $1, the same
-- rule the partners pot uses. Feeds the public partner scorecard (/api/activations/scorecard) and PostHog's
-- fly_activated event. seeded = it was already live when this table started, so it never counts as a new activation.
create table if not exists mine.activations (
  unit          text primary key,
  book          text not null,
  wallet        text not null,
  holder        text,
  fly_id        bigint,
  first_ms      bigint not null,
  last_ms       bigint not null,
  live          boolean not null default true,
  seeded        boolean not null default false,
  new_holder    boolean not null default false
);
create index if not exists activations_book on mine.activations (book, first_ms);

alter table mine.activations enable row level security;
