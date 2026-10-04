-- Paso 0 de Aprende («Por qué existimos») y jugadas fijas de la bienvenida.
-- about: la jugada es de la empresa (visión, estrategia, modelo), no de cómo se vende; sale en su propio paso.
-- pinned: orden fijo (1..9) en la bienvenida mientras no haya cierres suficientes para ordenar por datos.
alter table public.play add column about boolean not null default false;
alter table public.play add column pinned smallint check (pinned is null or pinned between 1 and 9);

-- Progreso del paso 0 («empresa»).
alter table public.learning_progress drop constraint if exists learning_progress_topic_check;
alter table public.learning_progress add constraint learning_progress_topic_check
  check (topic in ('general', 'tour', 'empresa') or topic ~ '^[0-9a-f-]{36}$' or topic ~ '^sector:[a-z0-9][a-z0-9-]{0,60}$');
