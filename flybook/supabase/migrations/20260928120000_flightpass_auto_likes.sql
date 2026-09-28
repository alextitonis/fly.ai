-- FlightPass autopilot likes (2026-09-28, flytrade/autopilot/SPEC.md). A FlightPass can do its owner's daily Flybook
-- missions, likes included (worker/autopilot.py). Those likes still count for the liker's own "Like 5 posts" mission and
-- only there: nothing that counts likes RECEIVED counts them (466 passes liking automatically would otherwise complete
-- the "Get 10 likes from $FLYAI holders" mission for each other and inflate everyone's boards). Changed, each as its
-- latest version with `and not l.auto` next to `l.by_holder`: my_missions() and season_points() (the "loved" weekly
-- mission, from 20260927130000_mission_weeks.sql), fly_board, owner_board and challenge_board() (the "loved" challenge,
-- all three from 20260914120000_free_accounts.sql). The likes counted for the liker ("Like 5 posts") are unchanged.

alter table public.likes add column if not exists auto boolean not null default false;

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
          where f.owner = me.uid and l.by_holder and not l.auto and l.user_id <> me.uid and l.created_at >= wk.w), 10, 50;
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
                  where f.owner is not null and l.by_holder and not l.auto and l.user_id <> f.owner and l.created_at >= since group by 1, 2),
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

-- boards that count likes received: fly_board.likes, owner_board.likes/_week/_season, challenge_board "loved"
create or replace view public.fly_board with (security_invoker = on) as
  select f.id as fly_id,
         f.name,
         f.color,
         f.patch_id,
         f.owner is null as house,
         f.active,
         f.senses,
         f.temperament,
         f.dials,
         f.created_at,
         count(p.id) as posts,
         count(p.id) filter (where p.correct) as true_posts,
         count(p.id) filter (where p.correct = false) as misreads,
         count(distinct p.word) filter (where p.word <> 'nothing') as words,
         max(p.created_at) as last_post_at,
         (select count(*) from public.likes l join public.posts lp on lp.id = l.post_id
          where lp.fly_id = f.id and l.by_holder and not l.auto and (f.owner is null or l.user_id <> f.owner)) as likes,
         count(p.id) filter (where p.kind = 'hallucination') as hallucinations,
         count(p.id) filter (where p.actions @> '[{"key": "jumped"}]') as jumps,
         count(p.id) filter (where p.actions @> '[{"key": "groomed"}]') as grooms,
         count(p.id) filter (where p.actions @> '[{"key": "buzzed"}]') as buzzes,
         count(p.id) filter (where p.poke_id is not null) as pokes_felt,
         (select coalesce(max(run), 0) from (
            select count(*) as run from (
              select s.correct,
                     row_number() over (order by s.id) - row_number() over (partition by s.correct order by s.id) as grp
              from public.posts s where s.fly_id = f.id and s.correct is not null
            ) seq where seq.correct group by seq.grp
          ) runs) as best_streak
  from public.flies f
  left join public.posts p on p.fly_id = f.id
  group by f.id;

create or replace view public.owner_board as
  select pr.id as owner_id,
         public.person_label(pr) as wallet_short,
         (select count(*) from public.flies f where f.owner = pr.id) as flies,
         (select coalesce(json_agg(json_build_object('name', f.name, 'color', f.color) order by f.created_at), '[]')
          from public.flies f where f.owner = pr.id) as fly_list,
         (select count(*) from public.posts p join public.flies f on f.id = p.fly_id where f.owner = pr.id) as posts,
         (select count(*) from public.likes l join public.posts p on p.id = l.post_id join public.flies f on f.id = p.fly_id
          where f.owner = pr.id and l.by_holder and not l.auto and l.user_id <> pr.id) as likes,
         (select count(*) from public.likes l join public.posts p on p.id = l.post_id join public.flies f on f.id = p.fly_id
          where f.owner = pr.id and l.by_holder and not l.auto and l.user_id <> pr.id and l.created_at > now() - interval '7 days') as likes_week,
         (select count(*) from public.likes l join public.posts p on p.id = l.post_id join public.flies f on f.id = p.fly_id
          where f.owner = pr.id and l.by_holder and not l.auto and l.user_id <> pr.id and l.created_at >= public.season_start()) as likes_season,
         pr.wallet is not null as has_wallet
  from public.profiles pr
  where exists (select 1 from public.flies f where f.owner = pr.id);

create or replace function public.challenge_board(week_start timestamptz)
returns table (challenge text, fly_id uuid, name text, color text, house boolean, owner_wallet text, score real, detail text)
language sql stable security definer set search_path = public as $$
  with c as (
    select (array['calm', 'alarm', 'sharp', 'loved'])[1 + (floor(extract(epoch from week_start) / 604800)::bigint % 4)::int] as key
  ),
  wk as (select week_start as s, week_start + interval '7 days' as e),
  calm as (
    select p.fly_id, count(*) as n, count(*) filter (where p.actions @> '[{"key": "jumped"}]') as j
    from posts p, wk where p.truth = 'threat' and p.created_at >= wk.s and p.created_at < wk.e group by p.fly_id
  ),
  alarm as (
    select pp.fly_id, count(*) as n
    from threads t join posts pp on pp.id = t.parent_post join posts ch on ch.id = t.child_post, wk
    where ch.created_at >= wk.s and ch.created_at < wk.e group by pp.fly_id
  ),
  sharp as (
    select p.fly_id, count(*) filter (where p.correct) as t, count(*) filter (where p.correct is not null) as n
    from posts p, wk where p.created_at >= wk.s and p.created_at < wk.e group by p.fly_id
  ),
  loved as (
    select p.fly_id, count(*) as n
    from likes l join posts p on p.id = l.post_id join flies f on f.id = p.fly_id, wk
    where l.created_at >= wk.s and l.created_at < wk.e and l.by_holder and not l.auto and (f.owner is null or l.user_id <> f.owner) group by p.fly_id
  ),
  rows as (
    select c.key, f.id, f.name, f.color, f.owner is null as house,
           (select public.person_label(pr) from profiles pr where pr.id = f.owner) as owner_wallet,
           case c.key
             when 'calm' then 1 - calm.j::real / nullif(calm.n, 0)
             when 'alarm' then alarm.n::real
             when 'sharp' then sharp.t::real / nullif(sharp.n, 0)
             else loved.n::real
           end as score,
           case c.key
             when 'calm' then format('held still through %s of %s threats', calm.n - calm.j, calm.n)
             when 'alarm' then format('set off %s flies', alarm.n)
             when 'sharp' then format('%s of %s reads right', sharp.t, sharp.n)
             else format('%s likes', loved.n)
           end as detail,
           case c.key
             when 'calm' then coalesce(calm.n, 0) >= 3
             when 'alarm' then coalesce(alarm.n, 0) >= 1
             when 'sharp' then coalesce(sharp.n, 0) >= 10
             else coalesce(loved.n, 0) >= 1
           end as qualifies,
           coalesce(calm.n, alarm.n, sharp.n, loved.n, 0) as volume
    from c cross join flies f
    left join calm on calm.fly_id = f.id
    left join alarm on alarm.fly_id = f.id
    left join sharp on sharp.fly_id = f.id
    left join loved on loved.fly_id = f.id
  )
  select key, id, name, color, house, owner_wallet, score, detail
  from rows where qualifies
  order by score desc, volume desc, name
  limit 50;
$$;
