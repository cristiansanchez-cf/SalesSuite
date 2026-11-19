-- Alguien sale del equipo con propuestas abiertas o empresas a su nombre → aviso a los admins para repartirlo
-- (docs/ORG.md §Traspasar). Lo quite un admin, un gerente o se borre su usuario: el aviso llega igual (no a quien lo quitó).
create or replace function public.notify_member_left() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n_dossiers int; n_accounts int;
begin
  if old.role = 'partner' then return null; end if;
  select count(*) into n_dossiers from public.dossier d
   where d.tenant_id = old.tenant_id and d.author_id = old.user_id and d.outcome = 'open' and d.status <> 'archived';
  select count(*) into n_accounts from public.account a where a.tenant_id = old.tenant_id and a.owner_id = old.user_id;
  if n_dossiers + n_accounts = 0 then return null; end if;
  perform public.notify_roles(old.tenant_id, array['admin']::public.member_role[], 'member_left', 'action', old.user_id::text,
    jsonb_build_object('name', coalesce(public.user_label(old.user_id), ''), 'dossiers', n_dossiers, 'accounts', n_accounts), auth.uid());
  return null;
end $$;
revoke all on function public.notify_member_left() from public, anon, authenticated;
create trigger notify_member_left after delete on public.membership
  for each row execute function public.notify_member_left();
