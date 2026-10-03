-- Jefe/a de ventas: gestiona equipo, colaboradores y playbook; no toca marca, catálogo ni precios.
-- Migración aparte: un valor nuevo de enum no se puede usar en la misma transacción que lo crea.
alter type public.member_role add value if not exists 'lead';
