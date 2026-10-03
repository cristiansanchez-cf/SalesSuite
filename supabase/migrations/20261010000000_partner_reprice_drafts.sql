-- Cambiar el precio de una cuenta de colaborador ya no toca en silencio lo que el cliente tiene en la mano
-- (docs/UX_REVIEW.md #10): el trigger reprecia solo los borradores. Aplicarlo a las propuestas ya
-- enviadas es una decisión explícita del admin, que hace el servicio (savePartnerAccount con applyToSent).
create or replace function public.partner_account_reprice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.dossier d
     set price_mode = case when new.price_policy = 'hidden' then 'none' else 'per_module' end::public.price_mode,
         total_price = null
   where d.partner_account_id = new.id and d.status = 'draft';
  update public.dossier_item i
     set price_override = public.partner_price(new.price_policy, new.price_adjust_pct, v.default_price)
    from public.dossier d, public.module_version v
   where d.id = i.dossier_id and d.partner_account_id = new.id and d.status = 'draft' and v.id = i.module_version_id;
  return null;
end $$;
revoke all on function public.partner_account_reprice() from public, anon, authenticated;
