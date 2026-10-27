-- Fly Hunt (2026-10-27, flytrade/HUNT-PLAN.md): a treasure hunt across the site; the first finishers win a Trader Fly.
-- Written and read by the mine server only (mine/src/hunt.ts); never public. Answers are kept as salted hashes.

-- the hunt's setup (key "hunt": clues, answer hashes, salt, window) and the live answers it learned (key "live:<step>")
create table if not exists mine.hunt_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- a wallet solved a step of a hunt
create table if not exists mine.hunt_progress (
  hunt        text not null,
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  step        int not null check (step between 1 and 20),
  at          timestamptz not null default now(),
  primary key (hunt, wallet, step)
);
create index if not exists hunt_progress_step on mine.hunt_progress (hunt, step, at);

-- every answer tried (wrong ones count against the wallet's tries; the text is kept short for the team's review)
create table if not exists mine.hunt_tries (
  id          bigint generated always as identity primary key,
  hunt        text not null,
  wallet      text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  step        int not null,
  ok          boolean not null,
  answer      text check (char_length(answer) <= 80),
  at          timestamptz not null default now()
);
create index if not exists hunt_tries_wallet on mine.hunt_tries (hunt, wallet, at desc);
