-- Fly Desk live chat (2026-10-26, flytrade/DESK-CHAT-PLAN.md; the user: "holders can chat and the backend can take into
-- consideration what they are saying", "if a holder is big and for long time it'll have more weight", "run the rug
-- checks etc from the tokens if they suggest etc, just to show activity", "at least hold 10k to chat, but all can read").
--
-- One table for the whole chat. Holders' messages (kind 'msg') are written by the mine server (mine/src/deskchat.ts:
-- the site's sign-in, 10k+ $FLYAI, weight, rate limit, no links); the desk's rug-check replies (kind 'check') by the
-- desk (flytrade/desk/chat.py), which also marks each message checked. Anyone reads it with the anon key, and the page
-- gets new rows through Supabase Realtime. Nobody writes from the browser. Rows older than 7 days are deleted.
create table if not exists public.desk_chat (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('msg', 'check')),
  wallet      text check (wallet is null or wallet ~ '^0x[0-9a-f]{40}$'),   -- lowercase, null on the desk replies
  text        text not null check (char_length(text) between 1 and 400),
  weight      real not null default 0 check (weight >= 0 and weight <= 1),  -- the weight of the writer when it was sent
  held        bigint,                                   -- whole $FLYAI held + staked when it was sent
  days        real,                                     -- days the wallet has held 10k+ $FLYAI
  tokens      text[] not null default '{}',             -- what it names: SYMBOLS upper case, 0x addresses lower case
  reply_to    bigint references public.desk_chat (id) on delete cascade,
  verdict     text check (verdict is null or verdict in ('pass', 'fail', 'info')),   -- the answer of a check
  meta        jsonb not null default '{}'::jsonb,       -- the facts of a check (holders, whales, creator, pool_usd, age_h, why)
  checked_at  timestamptz,                              -- a message: when the desk read its tokens
  check (kind = 'msg' and wallet is not null or kind = 'check' and wallet is null)
);
create index if not exists desk_chat_at on public.desk_chat (at desc);
create index if not exists desk_chat_unchecked on public.desk_chat (id) where kind = 'msg' and checked_at is null;
create index if not exists desk_chat_wallet on public.desk_chat (wallet, at desc) where kind = 'msg';

alter table public.desk_chat enable row level security;
drop policy if exists "anyone reads desk_chat" on public.desk_chat;
create policy "anyone reads desk_chat" on public.desk_chat for select to anon, authenticated using (true);

-- Realtime: the page subscribes to inserts (and the checked_at updates) instead of polling
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'desk_chat') then
    alter publication supabase_realtime add table public.desk_chat;
  end if;
end $$;

-- how long each wallet has held 10k+ $FLYAI, read from its transfer history on Blockscout (mine/src/deskchat.ts),
-- kept a day: the mine server's own, never public
create table if not exists mine.chat_holders (
  wallet      text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  held_since  timestamptz,                              -- null: under 10k now
  checked_at  timestamptz not null default now()
);
