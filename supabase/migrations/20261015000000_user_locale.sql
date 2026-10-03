-- Idioma preferido de cada persona (docs/I18N.md). null = el del navegador o el del espacio.
alter table public.users add column locale text check (locale is null or locale in ('es', 'en', 'pt', 'ko'));
