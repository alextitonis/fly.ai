-- XP for bug finds (2026-11-08, the user: "add exp for bug finds (not in daily) and we can give to addresses for when they
-- find bugs"): an admin books it by hand (mine/src/xp.ts POST /api/admin/xp/bug) as source 'bug', one row per find.
-- It is never a daily quest or check-in, never boosted by a 2x window, and the bell announces it like any one-off XP.
-- note: what was found, for the admins (never shown on the public XP log).
alter table mine.xp_events drop constraint if exists xp_events_source_check;
alter table mine.xp_events add constraint xp_events_source_check
  check (source in ('market', 'buy', 'breed', 'feed', 'claimstake', 'passburn', 'share', 'checkin', 'quest', 'bug'));
alter table mine.xp_events add column if not exists note text;
alter table mine.xp_events add column if not exists by_wallet text;
