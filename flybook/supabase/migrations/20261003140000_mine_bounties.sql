-- Bounties (2026-10-03, the user: "a bounty system with an easy way to add bounties for us and people to apply"):
-- the team posts bounties from the admin view of /bounties, signed-in wallets enter. Written by the mine server only
-- (mine/src/bounties.ts). Two kinds: a contest (anyone enters, the team picks winners) and an apply bounty (people apply,
-- the team picks one, that wallet hands in the final work). Payouts are sent by hand from the team wallet and the tx is
-- recorded here, so the public page shows who was paid and with which transaction. Wallets lowercase.
create table mine.bounties (
  id serial primary key,
  title text not null,
  kind text not null check (kind in ('contest', 'apply')),
  category text not null,                         -- content | dev | research | art | security | community
  summary text not null,
  details text not null default '',
  reward text not null,                           -- shown as written, e.g. "250,000 $FLYAI" or "up to $1,000 in $FLYAI"
  winners int not null default 1,
  deadline_ms bigint,                             -- entries/applications close (null: open until closed)
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'done')),
  assignee text,                                  -- apply bounties: the picked wallet, the only one that can hand in the final
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

create table mine.bounty_entries (
  id serial primary key,
  bounty_id int not null references mine.bounties (id) on delete cascade,
  wallet text not null,
  x_handle text not null,                         -- lowercase, without @
  stage text not null check (stage in ('entry', 'apply', 'final')),
  link text not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'picked', 'approved', 'rejected', 'paid')),
  reward text,                                    -- what this entry won, set by the team on approval
  tx_hash text,                                   -- the payout, set by the team once sent
  review_note text,                               -- the team's word back, shown to the entrant
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  unique (bounty_id, wallet, stage)
);
create index bounty_entries_bounty on mine.bounty_entries (bounty_id);
create index bounty_entries_wallet on mine.bounty_entries (wallet);
create index bounty_entries_handle on mine.bounty_entries (x_handle);

-- wallets and X handles that may not enter (farmers; campaign-sybil checks). value lowercase, handles without @
create table mine.bounty_blocked (
  value text primary key,
  reason text not null default '',
  created_at_ms bigint not null
);
-- the 2026-09-28 X campaign farmer ring
insert into mine.bounty_blocked (value, reason, created_at_ms) values
  ('0x113dea972d96076a0b521411a4fc3fd1216660a8', '2026-09-28 campaign farm', 1759017600000),
  ('0x4dfd8ebeccc8aea25b605fb672db51d1ca44a9b3', '2026-09-28 campaign farm', 1759017600000),
  ('0x63a509894d6d6dee62ed851b1070323c97157cb2', '2026-09-28 campaign farm', 1759017600000),
  ('0x72872ebd3f3298a47b27ac8aa5b3f611a9eae2f4', '2026-09-28 campaign farm', 1759017600000),
  ('0x1b3a421581867c4440cd558cd34bf6f2e82b4f9e', '2026-09-28 campaign farm', 1759017600000),
  ('0x83554d6c06cf813b15396ed18bde844bb6465382', '2026-09-28 campaign farm', 1759017600000),
  ('0x5f75622155b46b69c35d38acde76d04607984ad8', '2026-09-28 campaign farm', 1759017600000),
  ('0xcf7cf2d9fe732ee8b5244d48efc289ffbb49187b', '2026-09-28 campaign farm', 1759017600000),
  ('0xebdc511bc6d4ce147fa0254d9875877167745353', '2026-09-28 campaign farm', 1759017600000),
  ('venomtraders_', '2026-09-28 campaign farm', 1759017600000),
  ('halfmaxxing833', '2026-09-28 campaign farm', 1759017600000),
  ('yuipgreesa', '2026-09-28 campaign farm', 1759017600000);

alter table mine.bounties enable row level security;
alter table mine.bounty_entries enable row level security;
alter table mine.bounty_blocked enable row level security;
