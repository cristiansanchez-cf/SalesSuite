-- Combinaciones de serie (docs/PROPOSAL_PRESETS.md §Combinaciones de serie): el espacio trae, desde tenant.json,
-- combinaciones ya hechas por sector («Fidelización», «Clientes internacionales»…) con una línea de cuándo usarla y
-- su orden. Las crea el alta (created_by null: solo un admin las borra). Se traducen como el resto del contenido.
alter table public.proposal_template
  add column note text check (note is null or length(note) <= 240),
  add column position int not null default 0;

alter table public.content_i18n drop constraint if exists content_i18n_kind_check;
alter table public.content_i18n add constraint content_i18n_kind_check
  check (kind in ('play', 'segment', 'persona', 'facet', 'module', 'module_version', 'segment_module', 'tenant', 'proposal_template'));
