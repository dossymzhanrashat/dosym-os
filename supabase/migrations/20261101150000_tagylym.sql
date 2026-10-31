-- Phase 6: Tagylym Kit Studio — kit options, decision records, kit projects (11-stage pipeline).
-- Same sync pattern as before (user_id + RLS, last-write-wins, server_updated_at cursor).
-- Run once in the Supabase SQL Editor; safe to re-run.

create table if not exists public.tg_options (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  code text not null,
  name text not null,
  name_kk text,
  name_ru text,
  concept text not null default '',
  grade_min double precision not null,
  grade_max double precision not null,
  controller text,
  outcomes jsonb not null default '[]',
  bom jsonb not null default '[]', -- [{name, qty, qtyLabel, unitCost, currency, isEstimate, sourceUrl, checkedAt}]
  manufacturing jsonb not null,
  packaging text not null default '',
  curriculum jsonb not null default '[]',
  lesson_count double precision not null default 0,
  software_needs text not null default '',
  safety_notes jsonb not null default '[]',
  risks jsonb not null default '[]',
  scores jsonb not null, -- {criterion: {value 1–5, aiEstimate}}
  prices jsonb not null default '{}', -- target prices in ₸ (approximate)
  status text not null check (status in ('exploring', 'active', 'parked')),
  source text not null check (source in ('seed', 'manual', 'ai', 'merge')),
  is_teacher_box boolean not null default false,
  sell_as_teacher_box boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.tg_decisions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  winner_id text not null,
  runner_up_id text,
  weights jsonb not null,
  scores jsonb not null,
  robustness double precision not null,
  reason text not null check (char_length(reason) >= 20),
  decided_at timestamptz not null,
  archived boolean not null default false,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.tg_projects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  option_id text not null,
  decision_id text not null,
  mode text not null check (mode in ('forward', 'backward')),
  anchor_date text not null,
  stages jsonb not null default '[]', -- 11 stages with checklist, deliverables, state, overrideNote
  archived boolean not null default false,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

do $$
declare
  t text;
begin
  foreach t in array array['tg_options', 'tg_decisions', 'tg_projects'] loop
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
