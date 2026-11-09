-- Referral quests (2026-11-09, the user: "add referral quests (just not in the daily)"): one-off XP the first time a
-- wallet reaches 1, 3, 5, 10 and 25 real referrals (mine/src/quests.ts REF_QUESTS), booked as source 'refquest'.
alter table mine.xp_events drop constraint if exists xp_events_source_check;
alter table mine.xp_events add constraint xp_events_source_check
  check (source in ('market', 'buy', 'breed', 'feed', 'claimstake', 'passburn', 'share', 'checkin', 'quest', 'bug', 'refquest'));
