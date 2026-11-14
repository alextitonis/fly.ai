-- XP for trading partner NFTs (2026-11-14, the user: "can we make also activated partnered nfts to give exp like the
-- flies? only if trading"): each XP tick (mine/src/xp.ts partnerDays) writes how many partner NFTs each holder has
-- TRADING today - the NFT's own wallet active (its holder holds the 200k) with money in it, the Partners pot's rule - and
-- each such NFT-day earns RATES.partnerPerDay XP, like an active Trader Fly's day.
create table if not exists mine.xp_partner_days (
  wallet  text not null,
  day     date not null,
  n       int not null check (n >= 0),
  primary key (wallet, day)
);
