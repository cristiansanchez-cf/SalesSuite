-- =============================================================================
-- Equipo v2 (docs/TEAM.md): jefe/a de ventas, quién invitó a quién (red de colaboradores y referidos)
-- y aportes de colaboradores al playbook con aprobación.
--  - admin: todo. lead: equipo (reps y colaboradores), playbook, mercado, situaciones y todos los dossiers;
--    nunca marca, catálogo, roles de admin ni precios.
--  - Los colaboradores con permiso pueden invitar a otros colaboradores (RPC); el admin ve siempre quién invitó a quién.
-- =============================================================================

alter table public.membership add column invited_by uuid references public.users(id) on delete set null;
alter table public.partner_profile add column can_invite boolean not null default false;

create or replace function public.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membership m
                 where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role in ('admin', 'lead', 'rep'));
$$;

-- admin o jefe/a de ventas
create or replace function public.is_manager(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membership m
                 where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role in ('admin', 'lead'));
$$;

create or replace function public.can_edit_dossier(p_dossier uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dossier d
    join public.membership m on m.tenant_id = d.tenant_id and m.user_id = auth.uid()
    where d.id = p_dossier
      and (m.role in ('admin', 'lead') or (d.author_id = auth.uid() and (m.role = 'rep' or public.is_partner(d.tenant_id))))
  );
$$;

-- Quién invitó: lo pone la base de datos (la sesión que inserta), no el cliente.
create or replace function public.membership_set_inviter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.invited_by := coalesce(auth.uid(), new.invited_by);
  if new.invited_by = new.user_id then new.invited_by := null; end if;
  return new;
end $$;
revoke all on function public.membership_set_inviter() from public, anon, authenticated;
create trigger membership_set_inviter before insert on public.membership for each row execute function public.membership_set_inviter();

-- ---------------------------------------------------------------- equipo: el lead invita reps y colaboradores
create policy membership_lead_insert on public.membership for insert to authenticated
  with check (public.my_role(tenant_id) = 'lead' and role in ('rep', 'partner'));
create policy membership_lead_delete on public.membership for delete to authenticated
  using (public.my_role(tenant_id) = 'lead' and role in ('rep', 'partner'));

create policy partner_profile_lead on public.partner_profile for all to authenticated
  using (public.my_role(tenant_id) = 'lead') with check (public.my_role(tenant_id) = 'lead');
create policy partner_account_lead on public.partner_account for all to authenticated
  using (public.my_role(tenant_id) = 'lead') with check (public.my_role(tenant_id) = 'lead');

-- El lead asigna cuentas, pero el precio lo decide el admin: al crear, sin precios; al editar, el precio no cambia.
create or replace function public.partner_account_price_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role(new.tenant_id) is distinct from 'lead' then return new; end if;
  if tg_op = 'INSERT' then
    new.price_policy := 'hidden'; new.price_adjust_pct := 0;
  else
    new.price_policy := old.price_policy; new.price_adjust_pct := old.price_adjust_pct;
  end if;
  return new;
end $$;
revoke all on function public.partner_account_price_guard() from public, anon, authenticated;
create trigger partner_account_price_guard before insert or update on public.partner_account
  for each row execute function public.partner_account_price_guard();

-- ---------------------------------------------------------------- dossiers, playbook, mercado, situaciones: el lead como el admin
create policy dossier_manager_update on public.dossier for update to authenticated
  using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy dossier_manager_delete on public.dossier for delete to authenticated using (public.is_manager(tenant_id));

create policy play_manager on public.play for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy play_revision_manager_insert on public.play_revision for insert to authenticated with check (public.is_manager(tenant_id));
create policy contribution_manager on public.play_contribution for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy progress_manager_select on public.learning_progress for select to authenticated using (public.is_manager(tenant_id));
create policy segment_manager on public.segment for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy persona_manager on public.persona for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy segment_module_manager on public.segment_module for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy persona_module_manager on public.persona_module for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy facet_manager on public.situation_facet for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy story_manager on public.win_story for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));

-- ---------------------------------------------------------------- aportes de colaboradores: siempre pendientes de aprobar
create policy contribution_partner_insert on public.play_contribution for insert to authenticated
  with check (public.is_partner(tenant_id) and author_id = auth.uid() and status = 'pending'
    and reviewed_by is null and reviewed_at is null and review_note is null
    and (module_id is null or public.partner_module_ok(tenant_id, module_id)));
create policy contribution_partner_own on public.play_contribution for select to authenticated
  using (public.is_partner(tenant_id) and author_id = auth.uid());
create policy contribution_partner_withdraw on public.play_contribution for delete to authenticated
  using (public.is_partner(tenant_id) and author_id = auth.uid() and status = 'pending');

-- ---------------------------------------------------------------- red de colaboradores
-- Un colaborador con permiso invita a otro: hereda sus módulos y su caducidad, sin cuentas ni permiso de invitar.
-- El usuario lo crea antes el servidor (invitación por email); aquí solo se da el acceso, con trazabilidad.
create or replace function public.partner_invite_partner(p_tenant uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.partner_profile;
begin
  if not public.is_partner(p_tenant) then raise exception 'Solo un colaborador activo puede invitar' using errcode = 'insufficient_privilege'; end if;
  select * into me from public.partner_profile p where p.tenant_id = p_tenant and p.user_id = auth.uid();
  if not me.can_invite then raise exception 'No tienes permiso para invitar colaboradores' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = p_user) then
    raise exception 'Esa persona ya tiene acceso' using errcode = 'unique_violation';
  end if;
  insert into public.membership (user_id, tenant_id, role, invited_by) values (p_user, p_tenant, 'partner', auth.uid());
  insert into public.partner_profile (tenant_id, user_id, module_ids, see_team_tips, expires_at, can_invite)
  values (p_tenant, p_user, me.module_ids, false, me.expires_at, false);
end $$;
revoke all on function public.partner_invite_partner(uuid, uuid) from public, anon;
grant execute on function public.partner_invite_partner(uuid, uuid) to authenticated;

-- El colaborador ve a quién ha invitado (y nada más del equipo).
create policy membership_partner_invited on public.membership for select to authenticated
  using (public.is_partner(tenant_id) and invited_by = auth.uid());
create policy users_partner_invited on public.users for select to authenticated
  using (exists (select 1 from public.membership m where m.user_id = users.id and m.invited_by = auth.uid()));

-- El jefe/a de ventas ve a sus compañeros (como el resto del equipo interno).
drop policy users_select on public.users;
create policy users_select on public.users for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.membership mine join public.membership theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and mine.role in ('admin', 'lead', 'rep') and theirs.user_id = users.id)
);
