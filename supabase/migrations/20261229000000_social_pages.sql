-- «Cargar más» en las publicaciones de sus redes (docs/PERSONALIZE.md §Traer de sus redes): la caché de cada perfil
-- guarda todas las páginas pedidas (hasta 120 publicaciones), así que la fila puede pasar de 200 KB.
alter table public.social_profile_cache drop constraint if exists social_profile_cache_result_check;
alter table public.social_profile_cache add constraint social_profile_cache_result_check
  check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 1500000);
