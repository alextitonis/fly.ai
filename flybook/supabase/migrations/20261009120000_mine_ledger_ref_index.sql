-- The Kitchen (game server) books FLYAI in mine.ledger with ref 'kitchen:<what>' and checks that ref before every
-- movement so nothing is booked twice: index it, so that check doesn't scan the ledger.
create index if not exists ledger_by_ref on mine.ledger (ref);
