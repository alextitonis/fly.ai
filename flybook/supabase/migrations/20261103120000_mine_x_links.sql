-- Connect X (2026-11-03, mine/src/xlink.ts): a wallet links its X account through X's OAuth 2.0, once; the server
-- reads who signed in (one /2/users/me call, paid per use) and keeps only the account, never the token. One X account
-- per wallet and one wallet per X account. Written and read by the mine server only.
create table if not exists mine.x_links (
  wallet      text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  x_id        text not null unique,
  username    text not null,
  name        text,
  avatar      text,
  linked_at_ms bigint not null
);

-- a sign-in on its way to X and back: the PKCE verifier stays here, the state goes to X; used once, 10 minutes
create table if not exists mine.x_oauth (
  state       text primary key,
  wallet      text not null,
  verifier    text not null,
  return_to   text not null,
  created_at_ms bigint not null
);
