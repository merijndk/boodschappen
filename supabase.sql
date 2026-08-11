-- Boodschappen — database setup
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- 1. The table that holds the shared list.
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  created_at timestamptz not null default now()
);

-- 2. Enable Row Level Security, then allow the public (anon) role to
--    read / add / delete rows. This is the "one shared, open list" model:
--    anyone with your site URL can edit. Fine for a household grocery list.
alter table public.items enable row level security;

create policy "anon can read"   on public.items for select to anon using (true);
create policy "anon can insert" on public.items for insert to anon with check (true);
create policy "anon can delete" on public.items for delete to anon using (true);

-- 3. Turn on realtime so every device updates live.
alter publication supabase_realtime add table public.items;
