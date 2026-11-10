-- Traducción de lo que escribe el equipo (docs/I18N.md §Lo que escribe el equipo): notas, interacciones, «lo que
-- sabemos», próximo paso, resumen de Investigar… Se traduce una vez, al pulsar «Traducir», y se guarda: quien lo vuelva a
-- abrir en ese idioma lo ve ya traducido sin llamar a la IA. Clave: la huella del texto original (si cambia, otra).
create table public.text_translation (
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  locale      text not null check (locale in ('es', 'en', 'pt', 'ko')),
  source_hash text not null check (length(source_hash) between 16 and 64),
  text        text not null check (length(text) between 1 and 20000),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, locale, source_hash)
);
alter table public.text_translation enable row level security;
-- La lee el equipo del espacio. La escribe solo el servidor (service role), después de traducir: nadie del equipo
-- puede colar una «traducción» a los demás.
create policy text_translation_select on public.text_translation for select to authenticated using (public.is_member(tenant_id));
revoke all on public.text_translation from anon;
revoke insert, update, delete on public.text_translation from authenticated;
