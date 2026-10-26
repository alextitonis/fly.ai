-- Fly Scan (2026-10-27, flytrade/SCAN-PLAN.md phase 4, the user: "can you just finish the code"): a token contract or
-- a website scanned for what it can do to the people using it. mine/src/scan.ts writes the jobs and payments; the scan
-- worker (flytrade/scan/worker.py, its own fly app) claims queued jobs over HTTP and writes the report back.

-- one row per scan. kind: contract (target = 0x address, chain set) or site (target = the normalized URL, chain null).
-- status: queued -> running -> done | failed. Reports are public (a share link is /scan?r=<id>).
-- paid_by: 'usdg' | 'flyai' (a transfer, in mine.scan_payments) | 'free' (a holder's daily scan) | 'bot' (Discord)
create table if not exists mine.scan_jobs (
  id          text primary key,
  kind        text not null check (kind in ('contract', 'site')),
  target      text not null,
  chain       text,
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  wallet      text,
  paid_by     text not null check (paid_by in ('usdg', 'flyai', 'free', 'bot')),
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  done_at     timestamptz,
  verdict     text check (verdict in ('danger', 'caution', 'clear', 'unknown')),
  title       text,                           -- what was scanned, for lists ("PEPE (Pepe)", "claim-xyz.io")
  report      jsonb,
  error       text,
  cost_usd    double precision not null default 0
);
create index if not exists scan_jobs_target on mine.scan_jobs (kind, target, chain, done_at desc);
create index if not exists scan_jobs_queue on mine.scan_jobs (status, created_at);
create index if not exists scan_jobs_done on mine.scan_jobs (done_at desc) where status = 'done';

-- a payment counts once: its tx hash. job_id goes back to null when that scan fails, so the same transfer pays a retry.
create table if not exists mine.scan_payments (
  tx         text primary key check (tx ~ '^0x[0-9a-f]{64}$'),
  wallet     text not null,
  token      text not null check (token in ('usdg', 'flyai')),
  amount     text not null,                   -- wei / USDG units, as sent
  usd        double precision not null,
  job_id     text references mine.scan_jobs (id),
  at         timestamptz not null default now()
);
create index if not exists scan_payments_free on mine.scan_payments (wallet) where job_id is null;

-- a holder's free scan: one per wallet per UTC day
create table if not exists mine.scan_free (
  wallet  text not null,
  day     date not null,
  job_id  text not null,
  primary key (wallet, day)
);

alter table mine.scan_jobs enable row level security;
alter table mine.scan_payments enable row level security;
alter table mine.scan_free enable row level security;
