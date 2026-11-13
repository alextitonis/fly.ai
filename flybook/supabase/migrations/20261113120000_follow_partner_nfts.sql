-- Follow passes may be owned by a partner NFT wallet as well as a Trader Fly wallet.
alter table mine.follow_passes alter column follower_fly drop not null;
alter table mine.follow_passes add column if not exists follower_partner text;
alter table mine.follow_passes add column if not exists follower_token int;
alter table mine.follow_passes add constraint follow_passes_follower_kind check (
  (follower_fly is not null and follower_partner is null and follower_token is null)
  or (follower_fly is null and follower_partner is not null and follower_token is not null)
);
alter table mine.follow_passes drop constraint if exists follow_passes_check;
alter table mine.follow_passes add constraint follow_passes_check check (follower_fly is null or follower_fly <> target_fly);
