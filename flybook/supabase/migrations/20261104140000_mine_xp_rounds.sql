-- XP giveaway rounds (2026-11-03, the user: weekly giveaways to the XP board, "first this sunday and then every 2 weeks";
-- mine/src/xp.ts rounds). A round ranks the XP each wallet earned inside it: XP now minus XP when the round began
-- (xp_round_base). At its end the standings are frozen in results; the team sets the rewards by hand (winners).
create table if not exists mine.xp_rounds (
  id        int primary key,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  results   jsonb,                       -- frozen at the end: [{ rank, wallet, gain }]
  winners   jsonb,                       -- set by the team: [{ wallet, reward }]
  note      text
);

create table if not exists mine.xp_round_base (
  round_id int not null references mine.xp_rounds(id) on delete cascade,
  wallet   text not null,
  xp       double precision not null,
  primary key (round_id, wallet)
);
