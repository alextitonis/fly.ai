-- Notices to one wallet (2026-10-22, the user: "add a notification to that buyer as well that it got refunded"): a
-- line in that wallet's 🔔 (mine/src/profiles.ts summary feed, kind "notice"), shown for 60 days. Rows are added by
-- the team (SQL / service role); the site only reads them back through the mine server for the signed-in wallet.
create table if not exists mine.notices (
  id         bigint generated always as identity primary key,
  wallet     text not null check (wallet ~ '^0x[0-9a-f]{40}$'),   -- lowercase
  at         timestamptz not null default now(),
  text       text not null check (char_length(text) between 1 and 400),
  href       text check (href is null or href ~ '^(/|https://)')
);
create index if not exists notices_wallet on mine.notices (wallet, at desc);

-- the hardware pets pre-order #0 ($89.10 USDG), refunded in FLYAI at the 10-22 price from the dev wallet (the sale was
-- paused the same day: FlyPetOrders open = false)
insert into mine.notices (wallet, at, text, href) values
  ('0x0af485efb5657d8b12b194bc342cdcf941fb9b6a', '2026-10-22 09:10:00+00',
   'Your pocket fly pre-order #0 was refunded: 498,601 $FLYAI ($89.10) sent to your wallet. Pre-orders are paused for now.',
   'https://robinhoodchain.blockscout.com/tx/0xb85632d0328896da50349f7da8ed7d9da444299e6410815c369a2bae736d4b29');
