-- Avisos (docs/NOTIFICATIONS.md): campana en la consola + email (Resend) + resumen semanal.
-- Los crean SOLO triggers (security definer) a partir de hechos reales: ningún cliente puede fabricar
-- un aviso para otro. El texto no se guarda: se guarda el tipo y sus datos, y la app lo pinta en el
-- idioma de quien lo lee.
create type public.notification_severity as enum ('action', 'info');

alter table public.users
  add column notify_email boolean not null default true,
  add column digest_sent_at timestamptz;

create table public.notification (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  kind         text not null check (kind ~ '^[a-z_]{3,40}$'),
  severity     public.notification_severity not null,
  entity_key   text not null check (length(entity_key) between 1 and 200),
  params       jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  dismissed_at timestamptz,
  emailed_at   timestamptz,
  resolved_at  timestamptz
);
-- Un aviso por persona y hecho: repetir el hecho no duplica la campana ni el email.
create unique index notification_dedupe_uidx on public.notification (user_id, tenant_id, kind, entity_key);
create index notification_user_idx on public.notification (user_id, tenant_id, created_at desc);
create index notification_email_idx on public.notification (created_at) where emailed_at is null and severity = 'action';

alter table public.notification enable row level security;
create policy notification_own_select on public.notification for select to authenticated
  using (user_id = auth.uid() and public.is_member(tenant_id));
create policy notification_own_update on public.notification for update to authenticated
  using (user_id = auth.uid() and public.is_member(tenant_id)) with check (user_id = auth.uid());
-- Solo se puede marcar como leído o descartar; nada más.
revoke insert, update, delete on public.notification from anon, authenticated;
grant select on public.notification to authenticated;
grant update (read_at, dismissed_at) on public.notification to authenticated;

-- ---------------------------------------------------------------- emisión
create or replace function public.notify_roles(p_tenant uuid, p_roles public.member_role[], p_kind text,
  p_severity public.notification_severity, p_entity text, p_params jsonb, p_except uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notification (tenant_id, user_id, kind, severity, entity_key, params)
  select p_tenant, m.user_id, p_kind, p_severity, p_entity, p_params
    from public.membership m
   where m.tenant_id = p_tenant and m.role = any (p_roles) and m.user_id is distinct from p_except
  on conflict (user_id, tenant_id, kind, entity_key) do nothing;
$$;

create or replace function public.user_label(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(u.display_name, ''), u.email) from public.users u where u.id = p_user;
$$;

-- Aporte pendiente de revisión (truco de un colaborador o mejora propuesta) → jefes/as y admins.
create or replace function public.notify_contribution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_roles(new.tenant_id, array['admin', 'lead']::public.member_role[], 'contribution_pending', 'action', new.id::text,
      jsonb_build_object('title', new.title, 'type', new.type, 'author', public.user_label(new.author_id)), new.author_id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    update public.notification set resolved_at = now()
     where tenant_id = new.tenant_id and kind = 'contribution_pending' and entity_key = new.id::text and resolved_at is null;
  elsif tg_op = 'DELETE' and old.status = 'pending' then
    update public.notification set resolved_at = now()
     where tenant_id = old.tenant_id and kind = 'contribution_pending' and entity_key = old.id::text and resolved_at is null;
  end if;
  return null;
end $$;
create trigger notify_contribution after insert or update of status or delete on public.play_contribution
  for each row execute function public.notify_contribution();

-- Altas que no hizo un admin: un colaborador que trae a otro (referido) o un jefe/a que suma a alguien.
create or replace function public.notify_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inviter_role public.member_role;
begin
  if new.invited_by is null then return null; end if;
  select m.role into inviter_role from public.membership m where m.tenant_id = new.tenant_id and m.user_id = new.invited_by;
  if inviter_role = 'partner' then
    perform public.notify_roles(new.tenant_id, array['admin']::public.member_role[], 'partner_referred', 'action', new.user_id::text,
      jsonb_build_object('name', public.user_label(new.user_id), 'inviter', public.user_label(new.invited_by), 'inviterId', new.invited_by), new.invited_by);
  elsif inviter_role = 'lead' then
    perform public.notify_roles(new.tenant_id, array['admin']::public.member_role[], 'member_added', 'info', new.user_id::text,
      jsonb_build_object('name', public.user_label(new.user_id), 'role', new.role, 'inviter', public.user_label(new.invited_by)), new.invited_by);
  end if;
  return null;
end $$;
create trigger notify_membership after insert on public.membership
  for each row execute function public.notify_membership();

-- Cierre documentado y compartido → jefes/as y admins (informativo: va al resumen).
create or replace function public.notify_story() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'shared' then
    perform public.notify_roles(new.tenant_id, array['admin', 'lead']::public.member_role[], 'story_shared', 'info', new.id::text,
      jsonb_build_object('title', new.title, 'outcome', new.outcome, 'author', public.user_label(new.author_id)), new.author_id);
  end if;
  return null;
end $$;
create trigger notify_story after insert on public.win_story
  for each row execute function public.notify_story();

revoke all on function public.notify_roles(uuid, public.member_role[], text, public.notification_severity, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.user_label(uuid) from public, anon, authenticated;
revoke all on function public.notify_contribution() from public, anon, authenticated;
revoke all on function public.notify_membership() from public, anon, authenticated;
revoke all on function public.notify_story() from public, anon, authenticated;
