-- «Lo que sabemos» de cada empresa (docs/CRM_DINAMICO.md §20): los datos clave que el comercial va contando (a mano o
-- con «Apuntar con IA»): cómo es el sitio, qué le encaja… Cada uno con su fecha y quién lo dijo. Lo edita quien puede
-- editar la empresa (RLS de siempre).
alter table public.account
  add column facts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) <= 200 and pg_column_size(facts) <= 80000);
