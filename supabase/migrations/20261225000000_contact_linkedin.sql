-- LinkedIn como canal del contacto del comercial en sus propuestas (docs/PERSONALIZE.md §Contacto del comercial).
alter table public.membership drop constraint if exists membership_contact_channel_check;
alter table public.membership add constraint membership_contact_channel_check
  check (contact_channel is null or contact_channel in ('whatsapp', 'kakao', 'line', 'telegram', 'instagram', 'linkedin', 'phone', 'email'));
-- La columna antigua del perfil (antes de ir por espacio) admite lo mismo, por si algo la lee aún.
alter table public.users drop constraint if exists users_contact_channel_check;
alter table public.users add constraint users_contact_channel_check
  check (contact_channel is null or contact_channel in ('whatsapp', 'kakao', 'line', 'telegram', 'instagram', 'linkedin', 'phone', 'email'));
