-- Mapa del CRM (docs/CRM_DINAMICO.md §16): cada ciudad (zona) puede tener su punto en el mapa, para situar ahí las
-- empresas que aún no tienen ubicación exacta (las que sí la tienen usan la suya, de Google). Lo pone un/a admin
-- («Situar ciudades en el mapa»), con la política de zonas de siempre (zone_admin).
alter table public.zone
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180);
