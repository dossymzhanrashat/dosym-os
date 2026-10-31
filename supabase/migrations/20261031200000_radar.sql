-- Phase 4: Opportunities Radar — opportunities (seeded from Part A) and pending feed changes.
-- Same pattern as before: user_id + Row Level Security, last-write-wins on updated_at,
-- server_updated_at as the pull cursor. Ids are text (slugs and change hashes), unique per user.
-- Run once in the Supabase SQL Editor; safe to re-run.

create table if not exists public.radar_opportunities (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null, -- slug, e.g. "conrad-2026-27"
  name text not null,
  category text not null,
  url text not null default '',
  deadlines jsonb not null default '[]', -- [{id, type, date (organiser local time), tz, status, confidence, sourceUrl, lastVerified, manual}]
  requirements jsonb not null default '[]',
  cost text,
  aid text,
  eligibility text not null default '',
  last_verified text,
  status text not null check (status in ('watching', 'preparing', 'submitted', 'result', 'hidden')),
  result text check (result in ('accepted', 'award', 'finalist', 'waitlisted', 'notSelected', 'withdrawn')),
  confirmation_number text,
  plan jsonb, -- backward-planned steps: {deadlineId, createdAt, compressed, tasks[]}
  notes text not null default '',
  history jsonb not null default '[]',
  cancelled boolean,
  created_by text not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.radar_changes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null, -- "<oppId>|<field>|<new>": the same diff is the same row on every device
  opp_id text not null,
  field text not null,
  old_value text, -- "old" and "new" mean the row versions inside triggers, so the columns get a suffix
  new_value text,
  source_url text,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  fetched_at timestamptz not null,
  state text not null check (state in ('pending', 'accepted', 'rejected', 'expired')),
  decided_at timestamptz,
  opportunity jsonb, -- the feed entry, for a new opportunity
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

do $$
declare
  t text;
begin
  foreach t in array array['radar_opportunities', 'radar_changes'] loop
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_pull', t);
    execute format('drop trigger if exists %I on public.%I', t || '_lww', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.sync_lww_guard()', t || '_lww', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
