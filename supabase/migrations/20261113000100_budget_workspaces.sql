create table public.budget_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  budget jsonb not null check (
    jsonb_typeof(budget) = 'object'
    and octet_length(budget::text) <= 1048576
  )
);

alter table public.budget_workspaces enable row level security;

revoke all on public.budget_workspaces from public, anon, authenticated;
grant select, insert, update on public.budget_workspaces to authenticated;

create policy "Read own budget" on public.budget_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Create own budget" on public.budget_workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Update own budget" on public.budget_workspaces
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
