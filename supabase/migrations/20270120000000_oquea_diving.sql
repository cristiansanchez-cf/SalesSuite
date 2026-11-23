-- Oquea (docs/CRM_DINAMICO.md §47): la cualificación de buceo y sus tres pestañas, según «OQUEA · Criterios de
-- cualificación de leads» v1.0 (23-nov-2026).
--  · Paquete «diving»: segmento (PREM, CENTRO, TOUR, ONG, CLUB, OTRO), nota por bloques, ajustes y nivel (A, B, C,
--    CANAL, DESCARTADO). Las preguntas y la nota están en src/lib/crm/diving.ts.
--  · Tipos: Centros y operadores (el principal, ficha de cliente) · ONGs y clubs (organizador) · Instructores
--    (profesional: dónde trabaja, fijo, colabora o dueño).
-- Solo si Oquea sigue sin cualificación y con el tipo de siempre: no pisa lo que el admin haya cambiado.
alter table public.crm_settings drop constraint if exists crm_settings_qualification_check;
alter table public.crm_settings add constraint crm_settings_qualification_check check (qualification in ('nightlife', 'diving'));

insert into public.crm_settings (tenant_id, qualification) select t.id, 'diving' from public.tenant t where t.slug = 'oquea'
on conflict (tenant_id) do update set qualification = 'diving' where public.crm_settings.qualification is null;

update public.crm_settings s set kinds = '[
  {"key": "company", "label": "Centro u operador", "plural": "Centros y operadores", "icon": "anchor", "profile": "venue"},
  {"key": "ong", "label": "ONG o club", "plural": "ONGs y clubs", "icon": "heart-handshake", "profile": "promoter"},
  {"key": "instructor", "label": "Instructor", "plural": "Instructores", "icon": "graduation-cap", "profile": "dj"}
]'::jsonb
from public.tenant t
where t.id = s.tenant_id and t.slug = 'oquea'
  and jsonb_array_length(s.kinds) <= 1 and coalesce(s.kinds -> 0 ->> 'key', 'company') = 'company';
