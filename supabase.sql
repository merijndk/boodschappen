-- Boodschappen — database setup (safe to re-run any time)
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- 1. Tables ----------------------------------------------------------------

-- The shared shopping list.
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  created_at timestamptz not null default now()
);

-- Saved recipes. Ingredients are stored as a JSON array of strings.
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  ingredients jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

-- 2. Access ("one shared, open list": anyone with the URL can edit) --------
alter table public.items   enable row level security;
alter table public.recipes enable row level security;

drop policy if exists "anon read items"   on public.items;
drop policy if exists "anon insert items" on public.items;
drop policy if exists "anon delete items" on public.items;
create policy "anon read items"   on public.items   for select to anon using (true);
create policy "anon insert items" on public.items   for insert to anon with check (true);
create policy "anon delete items" on public.items   for delete to anon using (true);

drop policy if exists "anon read recipes"   on public.recipes;
drop policy if exists "anon insert recipes" on public.recipes;
drop policy if exists "anon delete recipes" on public.recipes;
create policy "anon read recipes"   on public.recipes for select to anon using (true);
create policy "anon insert recipes" on public.recipes for insert to anon with check (true);
create policy "anon delete recipes" on public.recipes for delete to anon using (true);

-- 3. Realtime (live sync across devices) -----------------------------------
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.recipes;
exception when others then null; end $$;
