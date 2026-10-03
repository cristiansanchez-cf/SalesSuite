-- Tarifas en dos pasos (docs/COMMISSIONS.md §Tarifas): el comercial elige primero QUÉ es («Charanga», «Sala de
-- conciertos», «Festival») y luego la tarifa, con la más típica ya marcada.
alter table public.price_option
  add column kind text check (kind is null or length(kind) between 1 and 60),
  add column is_default boolean not null default false;
