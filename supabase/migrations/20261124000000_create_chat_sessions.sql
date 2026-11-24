-- Viera: optional cloud chat sync table.
-- Applied automatically by `supabase start` / `supabase db reset` / `supabase db push`.

create table if not exists public.chat_sessions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  title text not null,
  character_id text not null,
  provider text,
  summary text,
  last_summarized_index int,
  current_emotion text,
  messages jsonb not null default '[]',
  chess_games jsonb not null default '[]',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

alter table public.chat_sessions enable row level security;

drop policy if exists "chat_sessions_own_rows" on public.chat_sessions;
create policy "chat_sessions_own_rows" on public.chat_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.chat_sessions from anon;
grant select, insert, update on public.chat_sessions to authenticated;
