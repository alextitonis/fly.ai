-- The Season points board, stored (2026-10-08): season_points() over the whole season took longer than the 3 s the
-- site's anonymous reads may run (the indexes of 20261008220000 did not bring it under), so everyone saw "No missions
-- completed this season yet". The worker's tick loop (flybook/worker/tick.py, every SEASON_BOARD_EVERY) refreshes a
-- stored copy with the service key; season_board reads the copy. A new season starts from season_start() as before.

create table if not exists public.season_board_cache (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  points bigint not null,
  missions bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.season_board_cache enable row level security;   -- read through season_board only

create or replace function public.refresh_season_board()
returns integer
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare n integer;
begin
  delete from season_board_cache where true;
  insert into season_board_cache (user_id, points, missions)
    select sp.user_id, sp.points, sp.missions
    from season_points(season_start()) sp join profiles pr on pr.id = sp.user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.refresh_season_board() from public, anon, authenticated;
grant execute on function public.refresh_season_board() to service_role;

create or replace view public.season_board as
  select c.user_id, public.person_label(pr) as wallet_short, c.points, c.missions, pr.wallet is not null as has_wallet
  from public.season_board_cache c
  join public.profiles pr on pr.id = c.user_id;

select public.refresh_season_board();                  -- the board's first copy, now
