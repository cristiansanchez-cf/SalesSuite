-- Oquea: «qué mirar» activado (criterio de Cristian: «déjaselo activado a Oquea»). Venden webs: quieren saber si la web
-- de la empresa es antigua, si cumple con aviso legal, privacidad y cookies y si el SEO básico está mal (docs/CRM_DINAMICO.md
-- §13 «Qué mirar»).
-- Solo si aún no tienen nada puesto: lo que guarde su admin manda.
insert into public.crm_settings (tenant_id, research)
select t.id, jsonb_build_object(
  'focus', E'¿Su web parece antigua o descuidada? (diseño, año del copyright, si se ve bien en el móvil)\n¿Cumple la normativa? Aviso legal, política de privacidad, política de cookies y banner de cookies.\n¿Tiene el SEO básico bien? (título, descripción para Google, encabezados, si se deja encontrar)',
  'web', true)
  from public.tenant t
 where t.slug = 'oquea'
on conflict (tenant_id) do update set research = excluded.research, updated_at = now()
 where public.crm_settings.research = '{}'::jsonb;
