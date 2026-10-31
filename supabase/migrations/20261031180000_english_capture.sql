-- Phase 3: Claude Bridge and capture — the triage inbox (candidates) and Use-it sentences.
-- Same pattern as before: user_id + Row Level Security, last-write-wins on updated_at,
-- server_updated_at as the pull cursor. Run once in the Supabase SQL Editor; safe to re-run.

create table if not exists public.vocab_candidates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null, -- note key it would get, e.g. "amplify|v"; skipped keys are never suggested again
  item jsonb not null, -- extract-vocab item (headword, definition, glosses, example, …)
  source jsonb not null,
  decision text check (decision in ('keep', 'skip', 'known', 'later')),
  decided_at timestamptz,
  import_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.use_it_answers (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  note_id uuid not null,
  target text not null,
  definition text not null default '',
  prompt text not null,
  sentence text not null,
  self_grade smallint check (self_grade between 1 and 4),
  written_at timestamptz not null,
  feedback jsonb, -- Claude's grade-sentence answer, after the weekly batch
  feedback_at timestamptz,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

do $$
declare
  t text;
begin
  foreach t in array array['vocab_candidates', 'use_it_answers'] loop
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
