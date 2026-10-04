-- Tamaño y ciclo de venta de cada sector: textos de la fuente que no se recortan (p. ej. el ciclo de ocio nocturno
-- explica qué día ir y por qué). De 200 a 600 caracteres.
alter table public.segment drop constraint if exists segment_sales_cycle_check;
alter table public.segment drop constraint if exists segment_deal_size_check;
alter table public.segment add constraint segment_sales_cycle_check check (length(sales_cycle) <= 600);
alter table public.segment add constraint segment_deal_size_check check (length(deal_size) <= 600);
