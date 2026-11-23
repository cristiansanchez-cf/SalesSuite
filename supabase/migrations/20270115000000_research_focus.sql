-- Investigación con IA: qué mirar (docs/CRM_DINAMICO.md §13 «Qué mirar»). Criterio de Cristian: «va a haber empresas que
-- necesiten info de la empresa viendo si la web está cuidada o no… que sea configurable: que cuando le das a
-- "Investigación con IA" puedas personalizar qué quieres que mire» (p. ej. si la web es antigua, si cumple con aviso
-- legal, privacidad y cookies, para ofrecerles una web nueva).
-- { focus: lo que el equipo quiere saber de cada empresa (texto), web: revisar su web (la app la abre y comprueba) }.
-- La lee el equipo y la cambia el admin (las políticas de crm_settings).
alter table public.crm_settings
  add column if not exists research jsonb not null default '{}'::jsonb
    check (jsonb_typeof(research) = 'object' and pg_column_size(research) <= 8000);
