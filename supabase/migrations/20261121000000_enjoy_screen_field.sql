-- En Enjoy, «¿Tiene pantalla?» (campo de la ficha, una casilla) repetía el criterio «Pantallas» de la Cualificación,
-- que además distingue «no, pero quiere» y «no se sabe». Se archiva el campo (se puede recuperar en Campos; sus valores
-- no se borran) y lo que estaba marcado pasa a la cualificación, sin pisar lo que ya tuviera.
do $$
declare f record;
begin
  for f in
    select c.id, c.tenant_id, c.key from public.crm_field c join public.tenant t on t.id = c.tenant_id
    where t.slug = 'enjoy' and c.type = 'checkbox' and c.archived_at is null
      and (c.key ~ '^tiene-pantallas?$' or c.label ~* '^¿?tiene pantallas?\??$')
  loop
    update public.account a
       set qualification = a.qualification || '{"screens":"yes"}'::jsonb
     where a.tenant_id = f.tenant_id and (a.fields -> f.key) = 'true'::jsonb and not (a.qualification ? 'screens');
    update public.crm_field set archived_at = now() where id = f.id;
  end loop;
end $$;
