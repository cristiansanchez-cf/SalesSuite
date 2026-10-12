-- Titular de la empresa (docs/CRM_DINAMICO.md §25): la razón social («Ocio Cosmic, S.L.») y su CIF, como salen en el
-- aviso legal de su web. Solo el de una sociedad: el DNI/NIE de un autónomo es un dato personal y no se guarda.
-- Sirve para ver qué locales son del mismo dueño y proponer juntarlos en un grupo (nunca se juntan solos).
alter table public.account
  add column legal_name text check (length(legal_name) <= 200),
  add column tax_id     text check (tax_id ~ '^[A-Z0-9]{8,14}$' and tax_id !~ '^([0-9]{8}|[XYZKLM][0-9]{7})[A-Z]$');

create index account_tax_id_idx on public.account (tenant_id, tax_id) where tax_id is not null;
