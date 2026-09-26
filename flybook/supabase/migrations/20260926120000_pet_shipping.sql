-- FLYAI pets pre-orders: where to ship (2026-09-26). The order itself is on chain (FlyPetOrders); the address never is.
--
-- The page inserts one row per order after the buyer signs the details with the wallet that paid (message +
-- signature stored), so the team can check a row really comes from the order's buyer before shipping: rows whose
-- signature doesn't recover to the order's buyer are ignored. Anyone may INSERT (the anon key is public), nobody can
-- read, change or delete through the API: only the service role (the team) reads the table.

create table if not exists public.pet_shipping (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  order_id      bigint not null check (order_id >= 0),
  wallet        text not null check (wallet ~* '^0x[0-9a-f]{40}$'),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  phone         text check (phone is null or char_length(phone) <= 40),
  address1      text not null check (char_length(address1) between 1 and 200),
  address2      text check (address2 is null or char_length(address2) <= 200),
  city          text not null check (char_length(city) between 1 and 100),
  region        text check (region is null or char_length(region) <= 100),
  postcode      text not null check (char_length(postcode) between 1 and 30),
  country       text not null check (char_length(country) between 2 and 60),
  message       text not null check (char_length(message) <= 4000),   -- exactly what the wallet signed
  signature     text not null check (signature ~* '^0x[0-9a-f]{130}$')
);

create index if not exists pet_shipping_order on public.pet_shipping (order_id);

alter table public.pet_shipping enable row level security;

-- insert only: the page can add a row, nobody can read them back through the API
drop policy if exists pet_shipping_insert on public.pet_shipping;
create policy pet_shipping_insert on public.pet_shipping for insert to anon, authenticated with check (true);

revoke select, update, delete on public.pet_shipping from anon, authenticated;
grant insert on public.pet_shipping to anon, authenticated;
