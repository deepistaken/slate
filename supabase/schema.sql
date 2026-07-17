-- Slate — database schema
-- ---------------------------------------------------------------------------
-- Run this ONCE against your Supabase project:
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is idempotent (safe to re-run): every object uses IF NOT EXISTS or
-- CREATE OR REPLACE, and policies are dropped-then-created.
--
-- What it sets up:
--   profiles          one row per user (auto-created on signup)
--   progress          the learning record (mastery, streak, xp) — one JSON blob per user
--   sessions          saved problem history (one row per completed problem)
--   interaction_logs  every tutor read (image hash, readAs, confidence) — the eval/quality moat
--   usage_user        per-user per-day AI call counter (free-tier meter)
--   usage_global      per-day AI call counter across ALL users (hard spend cap)
--   consume_quota()   atomic check-and-increment used by the server on every AI call
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'student',
  created_at timestamptz not null default now()
);

-- Safe re-run on databases created before the role column existed.
alter table public.profiles add column if not exists role text not null default 'student';

do $$ begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('student', 'teacher'));
exception when duplicate_object then null; end $$;

-- Role is chosen at signup and can never be changed afterwards — not even by
-- the owner of the row (the "update own" policy would otherwise allow it).
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed after signup';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_immutable on public.profiles;
create trigger profiles_role_immutable
  before update on public.profiles
  for each row execute function public.prevent_role_change();

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- progress  (single JSON blob per user, mirrors the client Progress type)
-- ---------------------------------------------------------------------------
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "progress: read own" on public.progress;
create policy "progress: read own"
  on public.progress for select
  using (auth.uid() = user_id);

drop policy if exists "progress: insert own" on public.progress;
create policy "progress: insert own"
  on public.progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "progress: update own" on public.progress;
create policy "progress: update own"
  on public.progress for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sessions  (saved problem history)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  topic      text,
  exam_id    text,
  difficulty text,
  problem    text,
  latex      text,
  solved     boolean not null default false,
  hints_used int not null default 0,
  marks      jsonb
);

create index if not exists sessions_user_created_idx
  on public.sessions (user_id, created_at desc);

alter table public.sessions enable row level security;

drop policy if exists "sessions: read own" on public.sessions;
create policy "sessions: read own"
  on public.sessions for select
  using (auth.uid() = user_id);

drop policy if exists "sessions: insert own" on public.sessions;
create policy "sessions: insert own"
  on public.sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "sessions: delete own" on public.sessions;
create policy "sessions: delete own"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- interaction_logs  (quality signal + proprietary training data)
-- Written server-side with the service_role key. RLS is enabled with NO client
-- policies, so the anon/authenticated roles can neither read nor write it.
-- ---------------------------------------------------------------------------
create table if not exists public.interaction_logs (
  id              bigserial primary key,
  user_id         uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  mode            text,
  image_sha256    text,
  read_as         text,
  read_confidence text,
  misconception   text
);

create index if not exists interaction_logs_created_idx
  on public.interaction_logs (created_at desc);

alter table public.interaction_logs enable row level security;
-- (intentionally no policies: locked to service_role only)

-- ---------------------------------------------------------------------------
-- usage counters (abuse control). Service-role only; RLS on, no policies.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_user (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  used    int  not null default 0,
  primary key (user_id, day)
);
alter table public.usage_user enable row level security;

create table if not exists public.usage_global (
  day  date primary key default current_date,
  used int  not null default 0
);
alter table public.usage_global enable row level security;

-- ---------------------------------------------------------------------------
-- consume_quota() — atomic check-and-increment.
-- Called by the server (service_role) before each AI request. Increments both
-- the per-user and global daily counters IFF both stay within their limits;
-- otherwise increments nothing and returns allowed = false. Row locks make it
-- safe under concurrent requests.
-- ---------------------------------------------------------------------------
create or replace function public.consume_quota(
  p_user         uuid,
  p_cost         int,
  p_user_limit   int,
  p_global_limit int
)
returns table (allowed boolean, user_used int, global_used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_used   int;
  v_global_used int;
begin
  -- lock/increment global first (single hot row) to avoid deadlock ordering issues
  insert into usage_global (day, used) values (current_date, 0)
    on conflict (day) do nothing;
  select used into v_global_used from usage_global
    where day = current_date for update;

  insert into usage_user (user_id, day, used) values (p_user, current_date, 0)
    on conflict (user_id, day) do nothing;
  select used into v_user_used from usage_user
    where user_id = p_user and day = current_date for update;

  if v_user_used + p_cost > p_user_limit
     or v_global_used + p_cost > p_global_limit then
    return query select false, v_user_used, v_global_used;
    return;
  end if;

  update usage_global set used = used + p_cost where day = current_date;
  update usage_user   set used = used + p_cost
    where user_id = p_user and day = current_date;

  return query select true, v_user_used + p_cost, v_global_used + p_cost;
end;
$$;

-- Let the service_role execute it (anon/authenticated cannot).
revoke all on function public.consume_quota(uuid, int, int, int) from public;
grant execute on function public.consume_quota(uuid, int, int, int) to service_role;
