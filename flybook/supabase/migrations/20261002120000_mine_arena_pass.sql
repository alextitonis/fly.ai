-- Fly Colosseum on FlightPass autopilot (mine/src/arena.ts autoEnter, 2026-10-02): an entry a FlightPass paid for.
-- pass: the pass's token id (null = paid from the wallet's own balance). The entry still belongs to the wallet that owns
-- the fly (seats per wallet count it), but the money is the pass's: its refund and its prize go back to the pass
-- (ledger key pass:<id>), the prize at once, without a claim.
alter table mine.arena_entries add column pass integer;
