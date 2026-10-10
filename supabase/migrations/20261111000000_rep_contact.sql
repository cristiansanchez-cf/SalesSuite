-- Contacto de quien hace la propuesta (docs/PERSONALIZE.md §Contacto del comercial). Cada persona elige su canal (WhatsApp, KakaoTalk,
-- LINE, Telegram, Instagram, teléfono o email) y su número/usuario; la propuesta pública lo enseña como botón principal.
-- Sin canal o sin valor, la propuesta usa el contacto de la marca, como hasta ahora. Se edita con users_update_self.
alter table public.users
  add column contact_channel text check (contact_channel is null or contact_channel in ('whatsapp', 'kakao', 'line', 'telegram', 'instagram', 'phone', 'email')),
  add column contact_value text check (contact_value is null or length(contact_value) <= 200);

-- Propuesta pública: el contacto de su autor. Misma puerta que get_public_dossier (enlace activo y sin caducar,
-- propuesta publicada, espacio activo). Solo nombre, canal y valor: nada más del perfil sale al anónimo.
create or replace function public.get_public_contact(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', coalesce(u.display_name, ''), 'channel', u.contact_channel, 'value', u.contact_value)
  from public.share_link l
  join public.dossier d on d.id = l.dossier_id
  join public.tenant t on t.id = d.tenant_id
  join public.users u on u.id = d.author_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and d.status = 'published'
    and d.tenant_id = p_tenant_id
    and t.status = 'active'
    and u.contact_channel is not null
    and nullif(btrim(u.contact_value), '') is not null;
$$;
revoke all on function public.get_public_contact(text, uuid) from public;
grant execute on function public.get_public_contact(text, uuid) to anon, authenticated;
