-- Run against a disposable local database after applying both migrations.
begin;
set local role anon;

do $$
begin
  if (select count(*) from public.keep_alive_health where ready is true) <> 1 then
    raise exception 'Expected exactly one visible health row';
  end if;
  begin
    perform 1 from public.budget_workspaces limit 1;
    raise exception 'anon unexpectedly has budget read access';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.keep_alive_health values (true);
    raise exception 'anon unexpectedly can insert a health row';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.keep_alive_health set ready = true;
    raise exception 'anon unexpectedly can update the health row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.keep_alive_health;
    raise exception 'anon unexpectedly can delete the health row';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  if has_table_privilege('public.keep_alive_health', 'SELECT')
    or has_table_privilege('public.keep_alive_health', 'INSERT')
    or has_table_privilege('public.keep_alive_health', 'UPDATE')
    or has_table_privilege('public.keep_alive_health', 'DELETE')
  then
    raise exception 'authenticated unexpectedly has access to the health table';
  end if;
end;
$$;

rollback;
