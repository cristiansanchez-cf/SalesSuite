-- Tablero de ventas (docs/CRM_DINAMICO.md §34): la columna de cada empresa sale de su historial. Esta vista da, por
-- empresa, lo justo: cuántas interacciones de verdad (sin notas), la primera y la última, la primera vez que contestó
-- y lo último que pasó. security_invoker: con los permisos de quien lee (los de crm_activity).
create view public.crm_activity_summary with (security_invoker = true) as
  select a.tenant_id, a.account_id,
         count(*) filter (where a.outcome <> 'note')::int as real,
         min(a.happened_at) filter (where a.outcome <> 'note') as first_at,
         max(a.happened_at) as last_at,
         min(a.happened_at) filter (where a.outcome in ('replied', 'interested', 'meeting')) as first_reply_at,
         (array_agg(a.outcome order by a.happened_at desc, a.created_at desc) filter (where a.outcome <> 'note'))[1] as last_outcome
    from public.crm_activity a
   group by a.tenant_id, a.account_id;

grant select on public.crm_activity_summary to authenticated;
