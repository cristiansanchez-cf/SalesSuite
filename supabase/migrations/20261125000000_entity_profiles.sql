-- Fichas por tipo (docs/CRM_DINAMICO.md §24, criterio de Cristian): una promotora o un DJ no es un local. Por debajo
-- comparten la empresa (dueño, historial, personas, enlaces); por encima, cada tipo tiene su ficha («perfil» del tipo
-- en crm_settings.kinds: venue · promoter · dj), sus preguntas y su nota.

-- Redes que importan a promotoras y DJs (Facebook no: «si puedes estar en Facebook no va a ser buena promotora»).
alter table public.account
  add column tiktok    text check (length(tiktok) <= 300),
  add column music_url text check (length(music_url) <= 300),
  add constraint account_tiktok_http check (tiktok is null or tiktok ~* '^https?://'),
  add constraint account_music_http check (music_url is null or music_url ~* '^https?://');

-- Dónde trabaja: qué días (habitualmente; nunca es exacto), con qué frecuencia y, si es un DJ, si es residente o invitado.
alter table public.account_link
  add column days text[] not null default '{}' check (days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]),
  add column freq text check (freq in ('regular', 'sporadic', 'once')),
  add column role text check (role in ('resident', 'guest'));

-- Enjoy: DJs con ficha de DJ y Promotoras con ficha de promotora.
update public.crm_settings c
   set kinds = (select jsonb_agg(case when k ->> 'key' = 'dj' then k || '{"profile":"dj"}'::jsonb
                                      when k ->> 'key' = 'promotora' then k || '{"profile":"promoter"}'::jsonb
                                      else k end order by o)
                  from jsonb_array_elements(c.kinds) with ordinality e(k, o))
  from public.tenant t
 where t.id = c.tenant_id and t.slug = 'enjoy' and jsonb_array_length(c.kinds) > 0;
