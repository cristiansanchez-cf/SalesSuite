-- Cualificación por espacio (docs/CRM_DINAMICO.md §45). Las preguntas, los pesos, los tramos de tamaño y los paquetes de
-- la cualificación eran de Enjoy para todos: cualquier espacio sin configurar veía su ficha como la de un local de ocio
-- nocturno. Ahora es un paquete con nombre que el espacio tiene o no: «nightlife» (ocio nocturno, lo de siempre de
-- Enjoy). Sin paquete (null): ni cualificación, ni nota, ni «Le encaja»; la IA solo saca lo general.
alter table public.crm_settings
  add column if not exists qualification text check (qualification in ('nightlife'));

-- Enjoy, la de ocio nocturno (como hasta ahora). Los demás espacios, sin cualificación hasta que se elija una.
insert into public.crm_settings (tenant_id, qualification) select t.id, 'nightlife' from public.tenant t where t.slug = 'enjoy'
on conflict (tenant_id) do update set qualification = 'nightlife' where public.crm_settings.qualification is null;
