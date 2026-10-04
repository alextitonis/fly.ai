-- Private fly labels (2026-10-04, a holder testing strategies: "allowing users to label their own flies ... only i can
-- see"): a short note a signed-in wallet puts on any fly, read back only by that wallet (mine/src/vaults.ts
-- /api/vaults/labels). Wallets lowercase. No public read: row level security on, no policies (the mine server's own
-- role writes and reads it).
create table mine.fly_labels (
  wallet text not null,
  fly_id integer not null,
  label text not null check (char_length(label) between 1 and 40),
  updated_at timestamptz not null default now(),
  primary key (wallet, fly_id)
);

alter table mine.fly_labels enable row level security;
