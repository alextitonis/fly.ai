-- Profiles (2026-10-03, the user: nicknames shown on the leaderboards instead of 0x...): one per wallet, written by the
-- mine server for the signed-in wallet (mine/src/profiles.ts), read in bulk by the site. Wallets lowercase.
create table mine.profiles (
  wallet text primary key,
  nickname text not null,
  updated_at_ms bigint not null
);
-- unique ignoring case: "Fly" and "fly" can't both exist
create unique index profiles_nickname on mine.profiles (lower(nickname));
