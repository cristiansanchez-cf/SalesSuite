-- «Aprende» visual (docs/FOUNDATIONS.md §6): se enseña el producto antes de explicarlo.
-- 1. Recorrido del producto por empresa («Lo que vendes, en 1 minuto»): pasos con imagen. Lo escribe el alta del espacio.
alter table public.tenant add column tour jsonb not null default '[]'::jsonb
  check (jsonb_typeof(tour) = 'array' and jsonb_array_length(tour) <= 8);

-- 2. Foto de cada sector (fondo de su tarjeta y de su ficha). https o ruta del propio sitio.
alter table public.segment add column image text
  check (image is null or image ~ '^(https://[^\s"''()]+|/[^/\s"''()][^\s"''()]*)$');

-- 3. Progreso: además de 'general' y cada módulo, el recorrido ('tour') y cada sector ('sector:<clave>').
alter table public.learning_progress drop constraint if exists learning_progress_topic_check;
alter table public.learning_progress add constraint learning_progress_topic_check
  check (topic in ('general', 'tour') or topic ~ '^[0-9a-f-]{36}$' or topic ~ '^sector:[a-z0-9][a-z0-9-]{0,60}$');
