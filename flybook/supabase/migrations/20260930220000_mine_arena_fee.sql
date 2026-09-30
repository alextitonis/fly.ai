-- Fly Colosseum: the season's house fee is paid out in $FLYAI to the dev wallet (mine/src/arena.ts payFees) when the
-- season is done. fee_tx is 'pending' while the transfer is being sent (so a crash can't pay it twice), then its hash.
alter table mine.arena_tournaments add column fee_tx text;
