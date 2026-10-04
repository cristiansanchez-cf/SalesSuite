-- Tarifas «a medida» (docs/COMMISSIONS.md §Tarifas): se ven en la lista (para que el comercial sepa que existen y qué hacer)
-- pero no se eligen en una propuesta: «Sala +20.000 · no se cotiza sin prueba de carga», «Activación de marca · la lleva
-- fundador». La nota es el aviso que acompaña a la tarifa.
alter table public.price_option
  add column note text check (note is null or length(note) between 1 and 120),
  add column quote_only boolean not null default false;

create or replace function public.dossier_price_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.price_option; r text := public.my_role(new.tenant_id);
begin
  if new.price_option_id is not null and (tg_op = 'INSERT' or new.price_option_id is distinct from old.price_option_id) then
    select * into o from public.price_option x where x.id = new.price_option_id and x.tenant_id = new.tenant_id;
    if o.id is null or not o.active then raise exception 'Tarifa no disponible' using errcode = 'check_violation'; end if;
    if o.quote_only then raise exception 'Esta tarifa es a medida: no se elige en una propuesta' using errcode = 'check_violation'; end if;
    new.price_mode := 'total'; new.total_price := o.amount; new.currency := o.currency;
    return new;
  end if;
  if r in ('rep', 'lead') and new.price_mode = 'total' then
    if tg_op = 'INSERT' then
      if new.price_option_id is null then new.price_mode := 'none'; new.total_price := null; end if;
    elsif new.price_option_id is null or new.total_price is distinct from old.total_price or new.currency is distinct from old.currency then
      raise exception 'El precio lo fija tu empresa: elige una tarifa' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
