-- Phase 5: FrostPure Project Hub — media, BOM, build steps, runs, competitions; private photo
-- storage; Pi telemetry with an insert-only "pi" account and Realtime.
-- Same sync pattern as before (user_id + RLS, last-write-wins, server_updated_at cursor).
-- Run once in the Supabase SQL Editor; safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- Synced app tables (ids are text: uuids, or slugs for seeded rows; unique per user)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.fp_assets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  kind text not null check (kind in ('video', 'canva', 'brandBoard', 'document', 'photoSet', 'data', 'link')),
  tags jsonb not null default '[]',
  notes text not null default '',
  pinned boolean not null default false,
  versions jsonb not null default '[]',
  current_version_id text,
  photos jsonb not null default '[]', -- [{id, path, thumbPath, caption, byteSize, createdAt}] in bucket frostpure-media
  chapters jsonb not null default '[]',
  linked_bom_ids jsonb not null default '[]',
  linked_step_ids jsonb not null default '[]',
  linked_run_ids jsonb not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.fp_bom_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  "order" double precision not null default 0,
  name text not null,
  model text,
  subsystem text not null check (subsystem in ('have', 'waterPath', 'sensors', 'controlPower', 'safetyTools')),
  qty double precision not null default 1,
  qty_label text,
  status text not null check (status in ('need', 'ordered', 'have')),
  unit_price_kzt double precision, -- approximate
  supplier_url text,
  datasheet_url text,
  purpose text not null default '',
  notes text not null default '',
  ordered_at timestamptz,
  expected_at text, -- YYYY-MM-DD, "Parcel due"
  part_tag text,
  stage text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.fp_build_steps (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  "order" double precision not null default 0,
  title text not null,
  body text not null default '',
  est_minutes double precision not null default 0,
  required_bom_ids jsonb not null default '[]',
  checklist jsonb not null default '[]',
  photo_asset_ids jsonb not null default '[]',
  done_at timestamptz,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.fp_runs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  rig text not null,
  status text not null check (status in ('planned', 'running', 'done', 'aborted')),
  feed_salinity_gl double precision not null,
  feed_volume_l double precision not null,
  planned_ambient_c double precision not null,
  planned_freeze_hours double precision not null,
  target_frozen_pct double precision not null,
  drain_rule jsonb not null,
  sweat_enabled boolean not null default false,
  sweat_minutes double precision,
  ec2_switch_ms double precision,
  variable text not null,
  hypothesis text not null default '',
  tds_k double precision not null default 0.64,
  started_at timestamptz,
  ended_at timestamptz,
  phases jsonb not null default '[]',
  samples jsonb not null default '[]',
  moments jsonb not null default '[]',
  energy_wh double precision,
  freezer_wh double precision,
  ice_thickness_cm double precision,
  freeze_hours_actual double precision,
  device_id text,
  notes text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.fp_competitions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  url text,
  status text not null,
  source text not null,
  phases jsonb not null default '[]',
  milestones jsonb not null default '[]',
  notes text not null default '',
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

do $$
declare
  t text;
begin
  foreach t in array array['fp_assets', 'fp_bom_items', 'fp_build_steps', 'fp_runs', 'fp_competitions'] loop
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

-- ---------------------------------------------------------------------------------------------
-- Photos: private bucket; each user only reaches files under a folder named after their id.
-- 50 MB per file (free plan); the app shrinks photos to about 1600 px before upload.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frostpure-media', 'frostpure-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "frostpure media: own folder read" on storage.objects;
drop policy if exists "frostpure media: own folder write" on storage.objects;
drop policy if exists "frostpure media: own folder update" on storage.objects;
drop policy if exists "frostpure media: own folder delete" on storage.objects;
create policy "frostpure media: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'frostpure-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "frostpure media: own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'frostpure-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "frostpure media: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'frostpure-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "frostpure media: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'frostpure-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- Telemetry from the Raspberry Pi (WEB EDITION).
-- The Pi signs in as its own "pi" user (email + password kept only on the Pi). A row in
-- telemetry_devices links that user to its owner; the Pi can only INSERT, and only the owner can
-- read. Duplicates (same device and seq) are ignored by the Pi's upsert. Rows keep the full JSON
-- (unknown keys included) and get flags: clock_skew (ts more than 10 min off the server clock),
-- temp_out_of_range (outside −50…60 °C), ec_out_of_range (outside 0…200 mS/cm).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.telemetry_devices (
  device_user uuid primary key references auth.users (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now()
);
alter table public.telemetry_devices enable row level security;
drop policy if exists "owner reads own devices" on public.telemetry_devices;
create policy "owner reads own devices" on public.telemetry_devices for select to authenticated using (owner = (select auth.uid()));
-- No insert/update policy: a device is linked once from the SQL Editor (see pi/README.md).

create table if not exists public.telemetry (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  device_user uuid not null default auth.uid(),
  device_id text not null,
  run_id text,
  seq bigint not null,
  ts timestamptz not null,
  phase text,
  payload jsonb not null,
  flags text[] not null default '{}',
  received_at timestamptz not null default now(),
  unique (device_user, device_id, seq)
);
create index if not exists telemetry_owner_ts on public.telemetry (owner, ts);

create or replace function public.telemetry_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  f text[] := '{}';
begin
  new.device_user := auth.uid();
  select d.owner into new.owner from public.telemetry_devices d where d.device_user = auth.uid();
  if new.owner is null then
    raise exception 'This account is not linked to a telemetry device';
  end if;
  new.received_at := now();
  if abs(extract(epoch from (new.ts - now()))) > 600 then
    f := f || 'clock_skew';
  end if;
  for v in select value from jsonb_each(coalesce(new.payload -> 'temps_c', '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'number' and ((v)::numeric < -50 or (v)::numeric > 60) then
      f := f || 'temp_out_of_range';
      exit;
    end if;
  end loop;
  for v in select value from jsonb_each(coalesce(new.payload -> 'ec_ms_cm', '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'number' and ((v)::numeric < 0 or (v)::numeric > 200) then
      f := f || 'ec_out_of_range';
      exit;
    end if;
  end loop;
  new.flags := f;
  return new;
end;
$$;

drop trigger if exists telemetry_before_insert on public.telemetry;
create trigger telemetry_before_insert before insert on public.telemetry for each row execute function public.telemetry_before_insert();

alter table public.telemetry enable row level security;
drop policy if exists "linked device inserts" on public.telemetry;
drop policy if exists "owner reads telemetry" on public.telemetry;
drop policy if exists "owner deletes telemetry" on public.telemetry;
create policy "linked device inserts" on public.telemetry for insert to authenticated
  with check (device_user = (select auth.uid()) and exists (select 1 from public.telemetry_devices d where d.device_user = (select auth.uid())));
create policy "owner reads telemetry" on public.telemetry for select to authenticated using (owner = (select auth.uid()));
create policy "owner deletes telemetry" on public.telemetry for delete to authenticated using (owner = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'telemetry') then
    alter publication supabase_realtime add table public.telemetry;
  end if;
end;
$$;

-- Keep the free 500 MB database small: readings older than 180 days are removed nightly
-- (run samples and results live on the run itself and are kept).
select cron.schedule('telemetry-retention', '15 21 * * *', $$delete from public.telemetry where ts < now() - interval '180 days'$$);
