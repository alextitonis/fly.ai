-- A fly's Solana key (2026-10-30, flytrade/SOLANA-PLAN.md): made when its owner turns Solana on, sealed with
-- VAULT_MASTER_KEY as vault_wallets' keys are (flytrade/vaults/keystore.py SolKeys). Its own table: everything reading
-- vault_wallets takes its rows for EVM keys. Addresses are case-sensitive base58.
create table mine.vault_sol_wallets (
  id text primary key,                 -- "fly:<id>"
  fly_id integer not null unique,
  address text not null unique,
  enc_key text not null,               -- base64 ciphertext + tag of the 32-byte seed
  nonce text not null,                 -- base64, 12 bytes
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);
alter table mine.vault_sol_wallets enable row level security;
