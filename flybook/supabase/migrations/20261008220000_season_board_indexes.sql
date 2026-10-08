-- The Season points board (season_board -> season_points) timed out for every visitor (2026-10-08: "0 quests" /
-- "No missions completed this season yet"): the anon role's 3 s statement timeout, while the function read the whole
-- posts table (84k rows, each with its neurons and trace jsonb) three times over - no index on posts.created_at,
-- posts.poke_id or threads.child_post. Narrow covering indexes so every part of it reads an index, not the posts heap.

-- posts this season, by week (post_weeks) and a thread's child post (chain_weeks: c.created_at >= since)
create index if not exists posts_created_cover on public.posts (created_at) include (id, fly_id);
-- a thread's parent post -> its fly (chain_weeks: pp.id = t.parent_post), without a heap fetch of the wide row
create index if not exists posts_id_fly on public.posts (id) include (fly_id);
-- the posts a poke stirred (stir_days: p.poke_id = pk.id)
create index if not exists posts_by_poke on public.posts (poke_id) include (id) where poke_id is not null;
-- threads from their child post (chain_weeks joins threads to the season's posts)
create index if not exists threads_by_child on public.threads (child_post) include (parent_post);
-- likes and pokes this season (small today; they grow with the autopilot)
create index if not exists likes_created on public.likes (created_at);
create index if not exists pokes_created on public.pokes (created_at);

analyze public.posts;
analyze public.threads;
analyze public.likes;
analyze public.pokes;
