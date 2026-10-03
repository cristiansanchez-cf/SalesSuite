# Avisos: campana, email y resumen semanal

Quien dirige el equipo tiene que enterarse de lo que pide su respuesta sin vivir dentro de la app ni recibir un email por cada cosa. No hay notificaciones push.

## Qué genera un aviso

Los avisos los crean **triggers de Postgres** a partir de hechos reales (`supabase/migrations/20261011000000_notifications.sql`). Ningún cliente puede crear un aviso para otra persona, y cada uno solo puede marcar los suyos como leídos o descartados (RLS + grants de columna).

| Tipo | Cuándo | Para quién | Severidad | Se cierra cuando… |
|---|---|---|---|---|
| `contribution_pending` | Alguien propone un truco o una mejora del playbook que hay que revisar | Admins y jefes/as de ventas (menos el autor) | Acción | Se acepta, se rechaza o se retira |
| `partner_referred` | Un colaborador invita a otro («DJ Sebastián viene invitado por DJ Antonio») | Admins | Acción | Lo abres |
| `member_added` | Un/a jefe/a de ventas suma a alguien al equipo | Admins | Info | Lo abres |
| `story_shared` | Alguien documenta un cierre (ganado o perdido) | Admins y jefes/as de ventas (menos el autor) | Info | Lo abres |

Próximos tipos, con el mismo mecanismo: conflicto de cuenta (zonas), venta declarada que confirmar y liquidación lista (comisiones), error al recibir datos de una API externa.

El aviso guarda **el tipo y sus datos**, no la frase. La frase, el icono y el enlace salen de `src/lib/notify/render.ts`, así que se pintan en el idioma de quien lo lee. Para añadir un tipo: trigger o RPC que llame a `public.notify_roles(...)`, su réplica en `src/lib/notify/db-demo.ts` y su entrada en `KINDS`.

## Campana

- Está a la derecha del logo, en la barra lateral. En el móvil, en la barra superior, y lleva a la página de avisos.
- Primero lo que pide acción; después lo informativo; después lo ya atendido.
- Cada aviso se puede descartar con la ✕. «Marcar todo como leído» no cierra lo que pide una acción: un aporte sigue pendiente hasta que se revisa.
- `/admin/notifications` muestra la lista completa (Pendientes / Todos).

## Emails (Resend)

Dos reglas para no llenar la bandeja (`src/lib/notify/job.ts`):

1. **Inmediato, agrupado.** Lo que pide acción y es nuevo se envía tras un margen de 5 minutos, en un solo email por persona y espacio. Si ya lo has abierto en la app, o se ha resuelto entretanto, no se envía. Nunca se envía dos veces.
2. **Resumen de los lunes.** Incluye lo que sigue abierto después de 2 días («ya lo has visto, pero te lo recuerdo») y las novedades informativas de la semana sin leer. Si no hay nada, no se envía. Como mucho, uno por semana.

Lo informativo nunca llega suelto. Cada persona puede desactivar los emails en **Mi cuenta → Avisos**; seguirá viendo la campana.

### Configuración

| Variable | Dónde | Para qué |
|---|---|---|
| `RESEND_API_KEY` | Servidor | API key de Resend (solo permiso de envío) |
| `RESEND_FROM` | Servidor | Remitente de un dominio verificado en Resend, p. ej. `Ventas <avisos@tudominio.com>` |
| `CRON_SECRET` | Servidor | El planificador llama con `Authorization: Bearer <CRON_SECRET>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | El cron lee los avisos de todos los espacios |
| `PUBLIC_SITE_URL` | Opcional | Origen de los enlaces si el espacio no tiene dominio principal |

`/api/health` indica `emailConfigured` y `cronConfigured` sin mostrar valores.

### Cron

`GET /api/cron/notifications` hace las dos cosas. El resumen solo sale los lunes (UTC); se puede forzar con `?digest=force` u omitir con `?digest=skip`.

- **Vercel Pro:** Cron Job cada 10 minutos (`*/10 * * * *`) a `/api/cron/notifications`. Vercel envía la cabecera con `CRON_SECRET` sola.
- **Vercel Hobby** (cron como mucho diario): usa un planificador externo cada 10 minutos, por ejemplo Supabase `pg_cron` + `pg_net` o un workflow programado de GitHub Actions, con la cabecera `Authorization`.

En modo demo no sale ningún email: el cron los guarda en memoria.

### Emails de acceso de Supabase (enlace mágico y código)

Son independientes de estos avisos: los envía Supabase Auth. Para que salgan desde tu dominio con Resend, configura el SMTP de Resend en Supabase (Authentication → SMTP). Pendiente: incorporar la guía de magic link / passwordless con Resend que tiene el equipo.

## Pruebas

- `supabase/tests/32_notifications.test.sql`: triggers, RLS, columnas que se pueden tocar y resolución.
- `src/lib/notify/notify.contract.ts`: el mismo contrato en demo y en Postgres + PostgREST, con el trabajo de emails incluido.
- `scripts/smoke-notifications.cjs`: campana, abrir, descartar, preferencia y cron, también en el móvil.
