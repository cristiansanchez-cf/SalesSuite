-- Fase 1: cualquier cambio en items o enlaces cuenta como edición del dossier
-- (el listado de la consola ordena por updated_at).
create or replace function public.touch_parent_dossier() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.dossier set updated_at = now()
  where id = coalesce(new.dossier_id, old.dossier_id);
  return null;
end $$;

revoke all on function public.touch_parent_dossier() from public, anon, authenticated;

create trigger dossier_item_touch_parent
  after insert or update or delete on public.dossier_item
  for each row execute function public.touch_parent_dossier();

create trigger share_link_touch_parent
  after insert or update or delete on public.share_link
  for each row execute function public.touch_parent_dossier();
