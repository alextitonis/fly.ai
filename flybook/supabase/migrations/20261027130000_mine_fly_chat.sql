-- Fly chat (2026-10-27, flytrade/FLYCHAT-PLAN.md; the user: a chat box per fly "with cheapest llm and tool calls ...
-- limited to avoid spam", "every 30 seconds", money moves only "with human in the loop", and tokens owners add to watch
-- "sent to flydesk for check").
--
-- One row per message in a fly's chat: the owner's ('user') and the model's answer ('fly'). An answer may carry a card
-- (a proposed settings change, withdrawal, chain move or token to watch): nothing happens until the owner approves it on
-- the page, which then calls the normal settings / withdraw / move endpoints with their own checks. Written and read by
-- the mine server only (mine/src/flychat.ts); never public. Rows older than 14 days are deleted.
create table if not exists mine.fly_chat (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  fly_id      int not null,
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),   -- the signed-in owner, lowercase
  role        text not null check (role in ('user', 'fly')),
  text        text not null check (char_length(text) between 1 and 2000),
  card        jsonb,                                  -- {kind: settings | withdraw | move | watch, ...}
  status      text check (status is null or status in ('pending', 'approved', 'declined', 'failed')),
  desk_msg    bigint,                                 -- a watched token sent to the Fly Desk: its public.desk_chat row
  cost_usd    double precision not null default 0     -- what the model call cost (OpenRouter's usage.cost)
);
create index if not exists fly_chat_fly on mine.fly_chat (fly_id, id desc);
create index if not exists fly_chat_wallet on mine.fly_chat (wallet, at desc) where role = 'user';
create index if not exists fly_chat_at on mine.fly_chat (at);
