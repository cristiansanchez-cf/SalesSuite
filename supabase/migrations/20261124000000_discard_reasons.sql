-- Descartar en la calle (docs/CRM_DINAMICO.md §23): motivos de quien visita, además de los de limpiar el CRM.
--   no_fit         no encaja con lo que vendemos
--   not_interested lo han dicho ellos: no les interesa
--   avoid          mejor no ir (p. ej. el dueño trata mal): que los demás lo sepan antes de ir
alter table public.account drop constraint if exists account_discard_reason_check;
alter table public.account add constraint account_discard_reason_check
  check (discard_reason in ('not_sector', 'partner', 'duplicate', 'closed', 'other', 'no_fit', 'not_interested', 'avoid'));
