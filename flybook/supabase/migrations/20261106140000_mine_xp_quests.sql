-- Daily check-in and quests (2026-11-06, flytrade/GAMIFY-PLAN.md "Quests plan", the user: "Yes, defaults";
-- mine/src/quests.ts). XP for a daily check-in (and its streak milestones) and for the 3 daily quests goes into
-- mine.xp_events as sources 'checkin' and 'quest', one row per day and quest (the ref keeps a repeat from booking twice).
-- Written and read by the mine server only.

alter table mine.xp_events drop constraint if exists xp_events_source_check;
alter table mine.xp_events add constraint xp_events_source_check
  check (source in ('market', 'buy', 'breed', 'feed', 'claimstake', 'passburn', 'share', 'checkin', 'quest'));

-- each wallet's check-in streak: days in a row, its best, streak freezes kept (one per 7 days in a row, at most 2),
-- the last UTC day it checked in, and the day and group of today's one reroll
create table if not exists mine.xp_checkins (
  wallet      text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  days        int not null default 0,
  best        int not null default 0,
  freezes     int not null default 0,
  last_day    date,
  reroll_day  date,
  reroll      text,
  seen_day    date                         -- the last day its quests were read (the tick checks only those)
);
alter table mine.xp_checkins enable row level security;
