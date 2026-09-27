-- Mission weeks follow the season (the user 2026-09-27: "we've resetted the flybook season stats, but not the quests").
-- Weekly missions counted from Monday (date_trunc('week')), so after the season 3 restart on Sunday 27 September they
-- still showed Mon-Sat progress from season 2. A mission week is now one of the two 7-day halves of a season, starting
-- at season_start() (Sunday 00:00 UTC): season 3 = 27 Sep - 3 Oct and 4 - 10 Oct. Daily missions are unchanged.
-- Weekly challenges (challenge_board) and the memes board keep their Monday weeks.

create or replace function public.mission_week(at timestamptz default now())
returns timestamptz
language sql immutable as $$
  select public.season_start(at)
         + floor(extract(epoch from (at - public.season_start(at))) / 604800) * interval '7 days';
$$;

create or replace function public.my_missions()
returns table (key text, period text, label text, progress bigint, target int, points int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
       day as (select date_trunc('day', now()) as d),
       wk as (select public.mission_week() as w)
  select 'poke3', 'daily', 'Poke a patch 3 times',
         (select count(*) from pokes, me, day where pokes.user_id = me.uid and pokes.created_at >= day.d), 3, 10
  union all
  select 'like5', 'daily', 'Like 5 posts',
         (select count(*) from likes, me, day where likes.user_id = me.uid and likes.created_at >= day.d), 5, 10
  union all
  select 'stir', 'daily', 'Make a fly react to your poke',
         (select count(distinct p.id) from pokes pk join posts p on p.poke_id = pk.id, me, day
          where pk.user_id = me.uid and pk.created_at >= day.d), 1, 10
  union all
  select 'chatty', 'weekly', 'Your flies post 30 times',
         (select count(*) from posts p join flies f on f.id = p.fly_id, me, wk where f.owner = me.uid and p.created_at >= wk.w), 30, 50
  union all
  select 'chain', 'weekly', 'One of your flies sets off another fly',
         (select count(*) from threads t join posts pp on pp.id = t.parent_post join flies f on f.id = pp.fly_id
          join posts c on c.id = t.child_post, me, wk where f.owner = me.uid and c.created_at >= wk.w), 1, 50
  union all
  select 'loved', 'weekly', 'Get 10 likes from $FLYAI holders',
         (select count(*) from likes l join posts p on p.id = l.post_id join flies f on f.id = p.fly_id, me, wk
          where f.owner = me.uid and l.by_holder and l.user_id <> me.uid and l.created_at >= wk.w), 10, 50;
$$;

-- season points: as in 20260918160000_merch_claims_awards.sql, weekly missions bucketed by mission_week()
create or replace function public.season_points(since timestamptz)
returns table (user_id uuid, points bigint, missions bigint)
language sql stable security definer set search_path = public as $$
  with
  poke_days as (select pk.user_id, date_trunc('day', pk.created_at) as d, count(*) as n
                from pokes pk where pk.created_at >= since group by 1, 2),
  like_days as (select l.user_id, date_trunc('day', l.created_at) as d, count(*) as n
                from likes l where l.created_at >= since group by 1, 2),
  stir_days as (select pk.user_id, date_trunc('day', pk.created_at) as d, count(distinct p.id) as n
                from pokes pk join posts p on p.poke_id = pk.id where pk.created_at >= since group by 1, 2),
  post_weeks as (select f.owner as user_id, public.mission_week(p.created_at) as w, count(*) as n
                 from posts p join flies f on f.id = p.fly_id where f.owner is not null and p.created_at >= since group by 1, 2),
  chain_weeks as (select f.owner as user_id, public.mission_week(c.created_at) as w, count(*) as n
                  from threads t join posts pp on pp.id = t.parent_post join flies f on f.id = pp.fly_id
                  join posts c on c.id = t.child_post where f.owner is not null and c.created_at >= since group by 1, 2),
  liked_weeks as (select f.owner as user_id, public.mission_week(l.created_at) as w, count(*) as n
                  from likes l join posts p on p.id = l.post_id join flies f on f.id = p.fly_id
                  where f.owner is not null and l.by_holder and l.user_id <> f.owner and l.created_at >= since group by 1, 2),
  done as (
    select user_id, 10 as pts from poke_days where n >= 3
    union all select user_id, 10 from like_days where n >= 5
    union all select user_id, 10 from stir_days where n >= 1
    union all select user_id, 50 from post_weeks where n >= 30
    union all select user_id, 50 from chain_weeks where n >= 1
    union all select user_id, 50 from liked_weeks where n >= 10
    union all select owner, points from merch_awards where owner is not null and created_at >= since
  )
  select user_id, sum(pts)::bigint, count(*)::bigint from done group by user_id;
$$;
