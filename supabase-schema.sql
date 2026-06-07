create table if not exists public.friend_who_games (
  code text primary key,
  game_state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.friend_who_games enable row level security;

drop policy if exists "friend_who_games_select" on public.friend_who_games;
drop policy if exists "friend_who_games_insert" on public.friend_who_games;
drop policy if exists "friend_who_games_update" on public.friend_who_games;

create policy "friend_who_games_select"
on public.friend_who_games
for select
to anon
using (true);

create policy "friend_who_games_insert"
on public.friend_who_games
for insert
to anon
with check (true);

create policy "friend_who_games_update"
on public.friend_who_games
for update
to anon
using (true)
with check (true);

alter table public.friend_who_games replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.friend_who_games;
exception
  when duplicate_object then null;
end $$;
