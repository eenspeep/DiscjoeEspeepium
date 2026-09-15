-- Deskovania — Supabase schema for the shared workplace.
-- Run this once in your project's SQL editor (Dashboard -> SQL Editor -> New query).
-- It creates the single table the cloud adapter reads/writes and turns on
-- Realtime so every client sees changes live. The anon key you paste into
-- tycoon/src/config.js is safe to ship because these RLS policies are the only
-- access it grants.

-- 1) The shared state table. One row per "room" (see ROOM in config.js).
create table if not exists public.rooms (
  id          text primary key,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) Row Level Security. We keep this deliberately open (anyone with the anon
--    key can read and write the shared office) because this is a co-op toy: the
--    people you share the URL/room with are trusted coworkers. If you want to
--    lock it down later, add Supabase Auth and gate writes on auth.uid().
alter table public.rooms enable row level security;

drop policy if exists "rooms read"  on public.rooms;
drop policy if exists "rooms write" on public.rooms;
drop policy if exists "rooms update" on public.rooms;

create policy "rooms read"   on public.rooms for select using (true);
create policy "rooms write"  on public.rooms for insert with check (true);
create policy "rooms update" on public.rooms for update using (true) with check (true);

-- 3) Realtime: broadcast row changes so onShared() fires on every client.
--    (Presence/avatars ride Realtime channels and need no table.)
alter publication supabase_realtime add table public.rooms;

-- 4) Per-player profiles (optional accounts). Each logged-in Joey saves here so
--    it survives a cookie wipe / follows the player across devices. Unlike the
--    shared room, a profile is private: only its owner can read or write it.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile write"  on public.profiles;
drop policy if exists "own profile update" on public.profiles;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile write"  on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Accounts also require turning OFF email confirmation in the dashboard:
-- Authentication -> Providers -> Email -> disable "Confirm email".
-- (Usernames map to a synthetic email, so there is no inbox to confirm.)
