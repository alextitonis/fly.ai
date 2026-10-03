-- RUYUI linked wallets (2026-10-03, the user: "as the NFTs are on AGW they will need a second route to connect as the
-- holder, the second does the signature (that second can manage the session)"). A RUYUI held by an Abstract Global
-- Wallet (a smart account on Abstract, no use on Robinhood Chain) is run by a Robinhood Chain wallet the AGW named once
-- with an ERC-1271 signature: that wallet signs in, holds the 200k $FLYAI, funds, manages and is paid the withdrawals.
-- Written by the mine server (mine/src/ruyui.ts POST /api/ruyui/link), read by it and by the RUYUI desk
-- (flytrade/vaults/ruyui.py). Addresses lowercase; the newest signed link wins.
create table mine.ruyui_links (
  owner text primary key,             -- the RUYUI holder on Abstract (the AGW)
  signer text not null,               -- the Robinhood Chain wallet acting for it
  issued_at_ms bigint not null,       -- when the AGW signed (from the signed message)
  signature text not null,
  updated_at_ms bigint not null
);
create index ruyui_links_signer on mine.ruyui_links (signer);
