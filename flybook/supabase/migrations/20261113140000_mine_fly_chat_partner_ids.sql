-- Partner NFTs in the fly chat (2026-11-13, the user: "add it"; mine/src/flychat.ts + partners.ts chatView): a partner
-- NFT's chat id is its desk id (flytrade/desk/partnerflies.py BASES + our id: Bullas 1e9+, RUYUI 2e9+, Enjoyoors 3e9+),
-- past an int's 2,147,483,647. Trader Fly ids stay as they are.
alter table mine.fly_chat alter column fly_id type bigint;
