-- Phase 2: English & IELTS core — words (notes), cards and the review history.
-- Same pattern as Phase 1: user_id + Row Level Security, last-write-wins on updated_at,
-- server_updated_at as the pull cursor. Run once in the Supabase SQL Editor; safe to re-run.

create table if not exists public.vocab_notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null, -- dedupe key, e.g. "amplify|v" or "pose threat to|col"
  kind text not null check (kind in ('word', 'collocation', 'phrase', 'paraphrasePair', 'spelling')),
  headword text not null,
  lemma text not null,
  pos text,
  ipa text,
  cefr text,
  ielts_topic text,
  definition text not null default '',
  gloss_kk text,
  gloss_ru text,
  examples jsonb not null default '[]',
  family jsonb not null default '[]',
  collocations jsonb not null default '[]',
  synonym_ladder jsonb not null default '[]',
  tip text,
  mnemonic text,
  source jsonb not null,
  pack_id text,
  status text not null default 'active' check (status in ('active', 'known', 'suspended')),
  needs_details boolean,
  frozen_at timestamptz,
  is_leech boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.vocab_cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid not null,
  type text not null,
  state text not null check (state in ('new', 'learning', 'review', 'relearning')),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  due timestamptz not null,
  last_review timestamptz,
  scheduled_days double precision not null default 0,
  step integer not null default 0,
  ladder_index integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  last_grade smallint,
  good_streak integer not null default 0,
  is_leech boolean not null default false,
  suspended boolean not null default false,
  introduced_at timestamptz,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- Append-only history (an undo soft-deletes the row).
create table if not exists public.review_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  note_id uuid not null,
  reviewed_at timestamptz not null,
  grade smallint not null check (grade between 1 and 4),
  state_before text not null,
  elapsed_days double precision not null,
  scheduled_days double precision not null,
  r_before double precision not null,
  s_before double precision not null,
  s_after double precision not null,
  d_before double precision not null,
  d_after double precision not null,
  duration_ms integer not null,
  scheduler text not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

do $$
declare
  t text;
begin
  foreach t in array array['vocab_notes', 'vocab_cards', 'review_logs'] loop
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
