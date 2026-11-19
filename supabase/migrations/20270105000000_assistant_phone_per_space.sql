-- Asistente de WhatsApp (docs/ASSISTANT.md): un móvil por empresa. Hay quien escribe al asistente desde un WhatsApp
-- distinto según la empresa (criterio de Cristian: el móvil de Enjoy para Enjoy; el de Cofundo para Cofundo, Oquea y
-- SciScreen). membership.assistant_phone: desde qué móvil le escribe para ESA empresa; vacío = el de Mi cuenta
-- (users.phone). Así, desde un móvil el asistente solo ofrece las empresas de ese móvil (y si es una, va directo).

alter table public.membership
  add column assistant_phone text check (assistant_phone is null or length(assistant_phone) <= 40);

-- Quién del equipo escribe desde este teléfono: por empresa, su móvil para esa empresa o, si no tiene, el de Mi cuenta.
-- (Misma comparación de dígitos que antes: con o sin prefijo, coinciden los últimos 9 o más.)
create or replace function public.assistant_member_by_phone(p_digits text)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  with x as (
    select m.tenant_id, m.user_id,
           regexp_replace(coalesce(nullif(btrim(m.assistant_phone), ''), u.phone, ''), '[^0-9]', '', 'g') as d
      from public.membership m join public.users u on u.id = m.user_id
     where m.role in ('admin', 'lead', 'rep')
  )
  select x.tenant_id, x.user_id from x
   where length(x.d) >= 9 and p_digits ~ '^[0-9]{9,15}$'
     and (x.d = p_digits or (length(p_digits) > length(x.d) and right(p_digits, length(x.d)) = x.d) or regexp_replace(x.d, '^00', '') = p_digits);
$$;
revoke all on function public.assistant_member_by_phone(text) from public, anon, authenticated;
grant execute on function public.assistant_member_by_phone(text) to service_role;

-- Mis empresas (las del equipo: admin, gerente, comercial) con el móvil que uso para el asistente en cada una.
create or replace function public.my_assistant_phones()
returns table (tenant_id uuid, tenant_name text, assistant_phone text)
language sql stable security definer set search_path = public as $$
  select m.tenant_id, t.name, m.assistant_phone
    from public.membership m join public.tenant t on t.id = m.tenant_id
   where m.user_id = auth.uid() and m.role in ('admin', 'lead', 'rep') and t.status = 'active'
   order by t.name;
$$;
revoke all on function public.my_assistant_phones() from public, anon;
grant execute on function public.my_assistant_phones() to authenticated;

-- Cambiar el mío en una empresa (solo en las mías; vacío = el de Mi cuenta). El formato (E.164) lo pone la app.
create or replace function public.set_my_assistant_phone(p_tenant_id uuid, p_phone text)
returns boolean
language sql volatile security definer set search_path = public as $$
  with u as (
    update public.membership set assistant_phone = nullif(btrim(coalesce(p_phone, '')), '')
     where user_id = auth.uid() and tenant_id = p_tenant_id and role in ('admin', 'lead', 'rep')
       and (p_phone is null or length(p_phone) <= 40)
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function public.set_my_assistant_phone(uuid, text) from public, anon;
grant execute on function public.set_my_assistant_phone(uuid, text) to authenticated;
