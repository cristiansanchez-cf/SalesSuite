-- Tamaño en tramos (docs/CRM_DINAMICO.md §30, pedido de Cristian): el campo «Aforo» (un número, abajo en la Ficha)
-- repetía «Tamaño del local» de la Cualificación. Queda un solo dato: el tamaño en tramos (pequeño, mediano, grande,
-- masivo), que cambian si el sitio hace conciertos o festivales. En Enjoy, el aforo apuntado pasa a su tramo (sin pisar
-- lo que ya tuviera) y el campo se archiva (se puede recuperar en Campos; sus valores no se borran).
-- Tramos (priority.ts SIZE_LIMITS): local hasta 150 / 500 / 1.500; conciertos 500 / 2.000 / 10.000; festival 5.000 /
-- 20.000 / 50.000.
do $$
declare f record;
begin
  for f in
    select c.id, c.tenant_id, c.key from public.crm_field c join public.tenant t on t.id = c.tenant_id
    where t.slug = 'enjoy' and c.type = 'number' and c.archived_at is null and (c.key = 'aforo' or c.label ~* '^aforo$')
  loop
    update public.account a
       set qualification = a.qualification || jsonb_build_object('size', case
             when fmt ? 'festival' then case when n <= 5000 then 'small' when n <= 20000 then 'medium' when n <= 50000 then 'large' else 'huge' end
             when fmt ? 'concerts' then case when n <= 500 then 'small' when n <= 2000 then 'medium' when n <= 10000 then 'large' else 'huge' end
             else case when n <= 150 then 'small' when n <= 500 then 'medium' when n <= 1500 then 'large' else 'huge' end end)
      from (select x.id, (x.fields ->> f.key)::numeric as n,
                   case jsonb_typeof(x.qualification -> 'format') when 'array' then x.qualification -> 'format'
                        when 'string' then jsonb_build_array(x.qualification -> 'format') else '[]'::jsonb end as fmt
              from public.account x
             where x.tenant_id = f.tenant_id and jsonb_typeof(x.fields -> f.key) = 'number') v
     where a.id = v.id and v.n > 0 and not (a.qualification ? 'size');
    update public.crm_field set archived_at = now() where id = f.id;
  end loop;
end $$;
