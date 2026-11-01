-- Una fila nunca cambia de espacio (supabase/tests/75_tenant_isolation.test.sql, «KNOWN BUG 75»). La RLS de UPDATE solo
-- comprueba que quien edita es del espacio NUEVO, y nada fijaba tenant_id: quien está en dos espacios podía mover, por
-- ejemplo, una persona sin dueño ni empresa de un espacio a otro. Ni la app ni los scripts cambian tenant_id, así que se
-- prohíbe en todas las tablas que lo tienen. Excepción: `domain`, que el superadmin puede reasignar con el script de alta.
create or replace function public.keep_tenant_id() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'permission denied: una fila no cambia de espacio (%)', tg_table_name using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function public.keep_tenant_id() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'tenant_id' and c.table_name <> 'domain'
  loop
    execute format('drop trigger if exists keep_tenant_id on public.%I', r.table_name);
    execute format('create trigger keep_tenant_id before update of tenant_id on public.%I for each row execute function public.keep_tenant_id()', r.table_name);
  end loop;
end $$;
