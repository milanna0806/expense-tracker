create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('income','expense')),
  category text not null,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "own rows: select" on public.transactions for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.transactions for insert with check (auth.uid() = user_id);
create policy "own rows: delete" on public.transactions for delete using (auth.uid() = user_id);

-- для обновления «в реальном времени»
alter publication supabase_realtime add table public.transactions;
