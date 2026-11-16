-- Propuesta pública en otro idioma: las frases que la receta escribió en la propuesta (prop_overrides) salen con la
-- receta traducida (get_public_content_phrases). Solo las que ya están en la propuesta; nada más de la receta.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- Oquea (demo, coreano): un sector con una receta, su traducción y la propuesta coreana con el título del ángulo.
insert into public.segment (id, tenant_id, key, name, proposal) values (
  '00000000-0000-4000-8000-0000000b5e99', '00000000-0000-4000-8000-000000000b01', 'prueba-frases', 'Prueba',
  '{"choices":[{"key":"angulo","options":[{"key":"abrir","label":"Abrir mercado (pista interna)","rules":[{"patch":"portada","set":{"title":"{company}, centro fundador"}}]}]}]}'
);
insert into public.content_i18n (tenant_id, locale, kind, ref, texts, source_hash) values (
  '00000000-0000-4000-8000-000000000b01', 'ko', 'segment', '00000000-0000-4000-8000-0000000b5e99',
  '{"proposal/choices/0/options/0/label":"시장 열기","proposal/choices/0/options/0/rules/0/set/title":"{company}, 창립 센터"}', 'abcdefgh'
);
update public.dossier_item set prop_overrides = prop_overrides || '{"title":"{company}, centro fundador"}'
where id = (select id from public.dossier_item where dossier_id = '00000000-0000-4000-8000-0000000b0d51' order by position limit 1);

set role anon;
select pg_temp.assert(
  public.get_public_content_phrases('demo-oquea-ko-5Rt8', '00000000-0000-4000-8000-000000000b01') = '{"{company}, centro fundador":"{company}, 창립 센터"}'::jsonb,
  'el anónimo, con el enlace: solo la frase que está en la propuesta (no la pista interna de la receta)');
select pg_temp.assert(
  public.get_public_content_phrases('no-existe-0000', '00000000-0000-4000-8000-000000000b01') = '{}'::jsonb,
  'enlace que no existe: nada');
select pg_temp.assert(
  public.get_public_content_phrases('demo-oquea-ko-5Rt8', '00000000-0000-4000-8000-000000000e01') = '{}'::jsonb,
  'otro espacio: nada');
reset role;

-- Una propuesta despublicada ya no da nada.
update public.dossier set status = 'draft' where id = '00000000-0000-4000-8000-0000000b0d51';
set role anon;
select pg_temp.assert(public.get_public_content_phrases('demo-oquea-ko-5Rt8', '00000000-0000-4000-8000-000000000b01') = '{}'::jsonb, 'despublicada: nada');
reset role;
update public.dossier set status = 'published' where id = '00000000-0000-4000-8000-0000000b0d51';
