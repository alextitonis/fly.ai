-- Phone notifications for the Fly Pet mobile page (mine/src/push.ts, docs/pet-mobile.html, 2026-11-16): one row per
-- browser push subscription. wallet = the signed-in holder (lowercase); prefs = which kinds it wants
-- ({trades, money, chat, alpha}); cursor_ms = everything up to here was already told; fails = pushes in a row that failed
-- (dropped at 10, or at once when the push service says the subscription is gone).
create table if not exists mine.push_subs (
  id            bigint generated always as identity primary key,
  wallet        text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  prefs         jsonb not null default '{"trades": true, "money": true, "chat": true, "alpha": false}',
  created_ms    bigint not null,
  cursor_ms     bigint not null,
  last_sent_ms  bigint,
  fails         int not null default 0
);
create index if not exists push_subs_wallet on mine.push_subs (wallet);
