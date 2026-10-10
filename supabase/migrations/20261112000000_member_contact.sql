-- Un admin del espacio pone el contacto de alguien de su equipo en sus propuestas (docs/PERSONALIZE.md §Contacto del
-- comercial). Cada uno edita el suyo con users_update_self; esto es para quien monta el equipo y ya sabe sus números.
create or replace function public.set_member_contact(p_tenant uuid, p_user uuid, p_channel text, p_value text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_tenant) then raise exception 'Solo un admin del espacio' using errcode = '42501'; end if;
  if not exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = p_user) then
    raise exception 'No es del equipo' using errcode = '42501';
  end if;
  update public.users
     set contact_channel = nullif(p_channel, ''),
         contact_value = case when nullif(p_channel, '') is null then null else nullif(btrim(p_value), '') end
   where id = p_user;
end $$;
revoke all on function public.set_member_contact(uuid, uuid, text, text) from public;
grant execute on function public.set_member_contact(uuid, uuid, text, text) to authenticated;
