-- Keep all DDL and privilege checks atomic, including in the SQL Editor.
do $$
declare
  client_role name;
  privilege text;
  extra_privileges text[] := array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
begin
  -- Check actual effective access, including grants inherited from PUBLIC or other roles.
  if not has_schema_privilege('anon', 'public', 'USAGE')
    or exists (select 1 from pg_roles where rolname = 'anon' and (rolsuper or rolbypassrls))
    or has_any_column_privilege('anon', 'public.budget_workspaces', 'SELECT')
    or not exists (select 1 from pg_class
      where oid = 'public.budget_workspaces'::regclass and relrowsecurity)
  then
    raise exception 'Unexpected anonymous access or RLS configuration. Review effective grants before enabling keep-alive.';
  end if;

  create table public.keep_alive_health (
    ready boolean primary key check (ready is true)
  );
  alter table public.keep_alive_health enable row level security;

  -- Remove any automatic table grants for the Supabase API roles.
  revoke all on table public.keep_alive_health from public, anon, authenticated, service_role;
  insert into public.keep_alive_health (ready) values (true);
  grant select on table public.keep_alive_health to anon;
  create policy "Read static health row" on public.keep_alive_health
    for select to anon using (ready is true);

  if current_setting('server_version_num')::int >= 170000 then
    extra_privileges := array_append(extra_privileges, 'MAINTAIN');
  end if;
  foreach client_role in array array['anon', 'authenticated', 'service_role']::name[] loop
    if has_table_privilege(client_role, 'public.keep_alive_health', 'SELECT') <> (client_role = 'anon')
      or has_table_privilege(client_role, 'public.keep_alive_health', 'SELECT WITH GRANT OPTION')
    then
      raise exception 'Unexpected inherited SELECT privileges on keep_alive_health for %.', client_role;
    end if;
    foreach privilege in array extra_privileges loop
      if has_table_privilege(client_role, 'public.keep_alive_health', privilege) then
        raise exception 'Unexpected inherited % privilege on keep_alive_health for %.', privilege, client_role;
      end if;
    end loop;
  end loop;
end;
$$;
