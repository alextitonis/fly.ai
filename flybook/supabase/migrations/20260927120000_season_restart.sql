-- Season restart (the user 2026-09-27: "reset the flybook season to start again today for 2 weeks"). Season 2 was cut
-- short after its top 3 were paid; season 3 starts Sunday 2026-09-27 00:00 UTC and seasons stay 14 days from there
-- (season 3 = 27 Sep - 10 Oct). Mission weeks still start Monday UTC, so a season no longer holds two whole mission
-- weeks: season 3 counts the Sunday of the week of 21 Sep, the week of 28 Sep, and Mon-Sat of the week of 5 Oct.
-- Seasons 1-2 (7-20 Sep, 21-26 Sep) came from the old anchor, 2026-09-07; their points are still in the data.

create or replace function public.season_start(at timestamptz default now())
returns timestamptz
language sql immutable as $$
  select timestamptz '2026-09-27 00:00:00+00'
         + floor(extract(epoch from (at - timestamptz '2026-09-27 00:00:00+00')) / 1209600) * interval '14 days';
$$;
