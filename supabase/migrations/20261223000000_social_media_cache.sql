-- Traer fotos y vídeos de su Instagram o TikTok a la propuesta (docs/PERSONALIZE.md §Traer de sus redes).
-- La API de medios no deja listar el mismo perfil más de una vez por hora: lo listado se guarda aquí y se reutiliza.
-- Solo lo usa el equipo del espacio (y sus colaboradores, que también personalizan sus propuestas) (las miniaturas caducan en horas; las filas viejas se sustituyen al volver a listar).
create table public.social_profile_cache (
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  -- «instagram:usuario» o «tiktok:usuario».
  profile    text not null check (profile ~ '^(instagram|tiktok):[a-z0-9._]{1,40}$'),
  result     jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 200000),
  fetched_at timestamptz not null default now(),
  primary key (tenant_id, profile)
);
alter table public.social_profile_cache enable row level security;
create policy social_profile_cache_read on public.social_profile_cache for select to authenticated using (public.is_member(tenant_id) or public.is_partner(tenant_id));
create policy social_profile_cache_ins on public.social_profile_cache for insert to authenticated with check (public.is_member(tenant_id) or public.is_partner(tenant_id));
create policy social_profile_cache_upd on public.social_profile_cache for update to authenticated using (public.is_member(tenant_id) or public.is_partner(tenant_id)) with check (public.is_member(tenant_id) or public.is_partner(tenant_id));
revoke delete on public.social_profile_cache from authenticated, anon;
