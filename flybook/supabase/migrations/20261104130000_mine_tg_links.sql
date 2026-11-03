-- Connect Telegram (2026-11-03, mine/src/tglink.ts): a wallet's Telegram account from the Telegram Login Widget, and
-- whether the bot last saw it in the fly.ai group (XP for members, src/xp.ts). One account per wallet and one wallet
-- per account. Written and read by the mine server only.
create table if not exists mine.tg_links (
  wallet        text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  tg_id         text not null unique,
  username      text,
  name          text not null default '',
  photo         text,
  member        boolean not null default false,
  linked_at_ms  bigint not null,
  checked_at_ms bigint not null
);
