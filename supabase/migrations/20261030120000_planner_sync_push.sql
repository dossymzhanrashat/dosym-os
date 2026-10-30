-- Phase 1: Planner, sync and Web Push reminders (SPEC.md › Calendar, planner and notifications).
-- Every table carries user_id and Row Level Security `user_id = auth.uid()`, so the public
-- publishable key in the website can only ever reach the signed-in user's own rows.
--
-- Run once in the Supabase dashboard: SQL Editor → paste this file → Run. Safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- Sync helpers: last-write-wins on the client's updated_at, plus a server clock for pulling.
-- ---------------------------------------------------------------------------------------------

-- An update with an older updated_at than the stored row is dropped (last write wins), and every
-- accepted write gets a fresh server_updated_at, which devices use as their "pull since" cursor.
create or replace function public.sync_lww_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- planner_items: the shared PlannerItem (Architecture › Shared data model), snake_case.
-- start/end are start_at/end_at because END is an SQL keyword.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.planner_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  start_at timestamptz,
  end_at timestamptz,
  due_date timestamptz,
  kind text not null check (kind in ('task', 'event', 'deadline', 'review', 'practice', 'testMoment')),
  source text not null check (source in ('user', 'english', 'frostpure', 'tagylym', 'radar')),
  source_ref text,
  priority smallint not null default 0 check (priority between 0 and 3),
  importance text not null default 'normal' check (importance in ('normal', 'important', 'critical')),
  reminders jsonb not null default '[]',
  recurrence jsonb,
  done boolean not null default false,
  completed_at timestamptz,
  completions jsonb, -- recurring items: days (YYYY-MM-DD) whose occurrence is done
  exceptions jsonb,  -- recurring items: days skipped (moved or deleted)
  snoozed_until timestamptz,
  checklist jsonb,
  links jsonb,
  updated_at timestamptz not null,
  deleted_at timestamptz, -- soft delete
  server_updated_at timestamptz not null default clock_timestamp()
);

create index if not exists planner_items_pull on public.planner_items (user_id, server_updated_at);

drop trigger if exists planner_items_lww on public.planner_items;
create trigger planner_items_lww
before insert or update on public.planner_items
for each row execute function public.sync_lww_guard();

alter table public.planner_items enable row level security;
drop policy if exists "own planner items" on public.planner_items;
create policy "own planner items" on public.planner_items
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- settings: small synced key/value rows (fixed weekly blocks, weekly focus goals, …).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  value jsonb,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists settings_pull on public.settings (user_id, server_updated_at);

drop trigger if exists settings_lww on public.settings;
create trigger settings_lww
before insert or update on public.settings
for each row execute function public.sync_lww_guard();

alter table public.settings enable row level security;
drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- reminders: computed by the browser for the next 14 days; sent by the send-reminders function.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.reminders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  planner_item_id uuid, -- null for the morning plan and the weekly review
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  url text not null,
  alarm boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists reminders_due on public.reminders (fire_at) where sent_at is null;

alter table public.reminders enable row level security;
drop policy if exists "own reminders" on public.reminders;
create policy "own reminders" on public.reminders
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- push_subscriptions: one row per browser / Home Screen app that allowed notifications.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default '',
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Realtime: other devices hear about changes at once instead of waiting for the next pull.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'planner_items') then
    alter publication supabase_realtime add table public.planner_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Every 5 minutes pg_cron calls the send-reminders Edge Function. The shared secret it sends is
-- read from Vault (created once by hand, never committed), so it is not in this file.
-- ---------------------------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bxqqqxwcepoidqizyfhq.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Old reminder rows are only history: keep 30 days.
select cron.schedule(
  'prune-reminders',
  '15 3 * * *',
  $$ delete from public.reminders where fire_at < now() - interval '30 days' $$
);
