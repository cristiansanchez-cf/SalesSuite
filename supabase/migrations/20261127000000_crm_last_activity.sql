-- «Se enfría» (docs/CRM_DINAMICO.md §11) solo necesita la ÚLTIMA interacción de verdad (no las notas) de cada empresa.
-- Antes se traían todas las interacciones de todas las empresas del mapa o de «Hoy»; con esta vista, una fila por
-- empresa. security_invoker: se lee con los permisos de quien pregunta (las mismas reglas que crm_activity).
create view public.crm_last_activity with (security_invoker = true) as
  select distinct on (a.account_id) a.tenant_id, a.account_id, a.outcome, a.happened_at
    from public.crm_activity a
   where a.outcome <> 'note'
   order by a.account_id, a.happened_at desc, a.created_at desc;

grant select on public.crm_last_activity to authenticated;
