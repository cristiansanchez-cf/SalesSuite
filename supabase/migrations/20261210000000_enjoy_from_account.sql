-- Propuesta desde la ficha (docs/PROPOSAL_PRESETS.md §Desde la ficha): el emparejamiento ficha → receta de cada sector
-- de Enjoy (tenants/enjoy/tenant.json → market[].proposal.fromAccount). Solo añade esa clave a las recetas que ya
-- existen: no toca nada más de lo que el espacio haya cambiado desde la web. Idempotente.

update public.segment s set proposal = jsonb_set(s.proposal, '{fromAccount}', '{"match": {"profile": ["venue"]}, "answers": [{"answer": "tipo:grupo", "if": {"scale": ["group"]}}, {"answer": "sin-pantalla", "if": {"screens": ["no"]}}, {"answer": "dj", "if": {"dj": ["resident", "both"]}}, {"answer": "oficina", "if": {"decider": ["offsite"]}}]}'::jsonb)
  from public.tenant t where s.tenant_id = t.id and t.slug = 'enjoy' and s.key = 'ocio-nocturno' and s.proposal is not null;

update public.segment s set proposal = jsonb_set(s.proposal, '{fromAccount}', '{"match": {"profile": ["promoter"]}, "answers": [{"answer": "dinamicas", "if": {"pdyn": ["yes"]}}], "musicStyle": {"from": ["pstyle"], "map": {"latin": "reggaeton", "commercial": "exitos-es", "pop": "exitos-es", "international": "internacional", "erasmus": "internacional", "tardeo": "clasicos-es"}}}'::jsonb)
  from public.tenant t where s.tenant_id = t.id and t.slug = 'enjoy' and s.key = 'promotoras' and s.proposal is not null;

update public.segment s set proposal = jsonb_set(s.proposal, '{fromAccount}', '{"match": {"kind": ["concert"]}}'::jsonb)
  from public.tenant t where s.tenant_id = t.id and t.slug = 'enjoy' and s.key = 'conciertos' and s.proposal is not null;

update public.segment s set proposal = jsonb_set(s.proposal, '{fromAccount}', '{"match": {"profile": ["venue"], "format": ["festival"]}}'::jsonb)
  from public.tenant t where s.tenant_id = t.id and t.slug = 'enjoy' and s.key = 'festivales' and s.proposal is not null;

update public.segment s set proposal = jsonb_set(s.proposal, '{fromAccount}', '{"match": {"profile": ["venue"], "format": ["hotel"]}}'::jsonb)
  from public.tenant t where s.tenant_id = t.id and t.slug = 'enjoy' and s.key = 'hoteles' and s.proposal is not null;
