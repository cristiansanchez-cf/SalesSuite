-- Tope de investigaciones con IA al día (criterio de Cristian, 26-nov-2026: Oquea gastó 3 $ en 18 investigaciones).
-- Investigar es lo más caro (búsqueda y lectura web): va aparte del tope general de IA, por persona y por espacio.
alter table public.usage_counter drop constraint if exists usage_counter_kind_check;
alter table public.usage_counter add constraint usage_counter_kind_check check (kind in ('google', 'ai', 'research'));

-- Suma una investigación si cabe: 'ok', o por qué no ('user': esa persona ya ha hecho las suyas hoy; 'tenant': el
-- espacio ya ha hecho las del día). Si no cabe, no suma.
create or replace function public.bump_research(p_tenant uuid, p_user_limit int, p_tenant_limit int) returns text
language plpgsql security definer set search_path = '' as $$
declare mine int; total int;
begin
  if not public.is_member(p_tenant) then raise exception 'No es del equipo' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('research:' || p_tenant::text));
  select coalesce(sum(n), 0) into total from public.usage_counter where tenant_id = p_tenant and kind = 'research' and day = current_date;
  if total >= greatest(p_tenant_limit, 1) then return 'tenant'; end if;
  select coalesce(n, 0) into mine from public.usage_counter where tenant_id = p_tenant and user_id = auth.uid() and kind = 'research' and day = current_date;
  if coalesce(mine, 0) >= greatest(p_user_limit, 1) then return 'user'; end if;
  insert into public.usage_counter (tenant_id, user_id, kind, day, n) values (p_tenant, auth.uid(), 'research', current_date, 1)
  on conflict (tenant_id, user_id, kind, day) do update set n = public.usage_counter.n + 1;
  return 'ok';
end $$;
revoke all on function public.bump_research(uuid, int, int) from public, anon;
grant execute on function public.bump_research(uuid, int, int) to authenticated;
