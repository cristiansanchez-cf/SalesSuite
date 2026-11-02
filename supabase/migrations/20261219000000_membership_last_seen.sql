-- Invitaciones: saber si alguien ha entrado ya en el espacio (para reenviarle la invitación si no).
-- last_seen_at = la última vez que abrió la consola de ESTE espacio (se apunta como mucho una vez por hora).
alter table public.membership add column if not exists last_seen_at timestamptz;

-- Lo que ya había: si entró en la plataforma después de que le dieran acceso, cuenta como que entró.
update public.membership m set last_seen_at = u.last_sign_in_at
  from auth.users u
 where u.id = m.user_id and m.last_seen_at is null and u.last_sign_in_at is not null and u.last_sign_in_at >= m.created_at;

-- Cada persona apunta solo su propia visita (no hace falta ser admin para eso).
create or replace function public.touch_membership(p_tenant uuid) returns void
language sql security definer set search_path = public as $$
  update public.membership set last_seen_at = now()
   where tenant_id = p_tenant and user_id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '1 hour');
$$;
revoke all on function public.touch_membership(uuid) from public, anon;
grant execute on function public.touch_membership(uuid) to authenticated;
