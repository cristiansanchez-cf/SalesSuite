-- Enjoy: el tipo «Marca» (marcas de bebida, Uber…) con su pestaña, como DJs y Promotoras (docs/CRM_DINAMICO.md §21).
do $$
declare t uuid;
begin
  select id into t from public.tenant where slug = 'enjoy';
  if t is null then return; end if;
  insert into public.crm_settings (tenant_id) values (t) on conflict (tenant_id) do nothing;
  update public.crm_settings
     set kinds = kinds || '[{"key":"marca","label":"Marca","plural":"Marcas","icon":"star"}]'::jsonb
   where tenant_id = t and not exists (select 1 from jsonb_array_elements(kinds) k where k ->> 'key' = 'marca')
     and jsonb_array_length(kinds) < 12;
end $$;
