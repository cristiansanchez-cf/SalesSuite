# Analítica de dossiers

Para qué: saber **a quién escribir hoy**. Si un cliente ha abierto la propuesta tres veces y nadie le ha contestado, es el mejor momento para llamarle.

## Qué se mide

Cada vez que alguien abre el enlace público de una propuesta (`/d/<token>`):

| Dato | Cómo |
|---|---|
| Apertura | Una visita nueva al cargar la página |
| Persona distinta | Un id aleatorio guardado en ese navegador (no es un nombre ni un email) |
| Dispositivo | Móvil, tableta u ordenador, por el ancho de la pantalla |
| Tiempo | Solo con la pestaña visible; máximo 4 h por visita |
| Hasta dónde lee | El punto más bajo al que llega (0–100 %) |
| Tiempo por sección | Lo que cada bloque de la propuesta está en pantalla (al menos un 30 % visible) |

El navegador lo manda al abrir, cada 15 s y al cerrar (`/api/track`). La base de datos solo deja **subir** los valores de una visita, nunca bajarlos.

Las vistas previas internas (desde la consola) no cuentan. Si abres tú el enlace público, sí cuenta: para revisarla, usa la vista previa.

## Dónde se ve

- **Analítica** (menú Vender): cifras del equipo o tuyas, y tres listas:
  - **Escríbele hoy:** la han abierto, sigue en juego y no tiene próximo paso (o está vencido);
  - **Abiertas en las últimas 48 h**;
  - **Nadie la ha abierto:** publicada hace más de 2 días y sin aperturas → «¿le llegó el enlace?».
- **Cada propuesta:** aperturas, personas, tiempo total, hasta dónde lee, tiempo por sección (con «Lo más leído») y la lista de visitas.
- **Lista de propuestas y editor:** «3 aperturas · última hace 2 h».
- **Campana:** «Club Sol ha abierto tu propuesta», como mucho una vez por propuesta y día.

## Seguridad

- Solo se registra con un enlace **válido**: activo, sin caducar, de una propuesta publicada y del dominio de su empresa. Un enlace revocado no suma nada.
- Nadie puede inventar visitas: solo existe la función `track_dossier_view`. Nadie puede editar ni borrar filas.
- Freno al abuso: como mucho 20 visitas nuevas por navegador y hora.
- Ve la analítica quien ve la propuesta: misma regla que la propuesta (RLS).

## Pendiente de decidir

- **Aviso legal:** el id del navegador se guarda en `localStorage`. No identifica a nadie, pero conviene mencionarlo en el aviso de privacidad de cada empresa.
- **Email o WhatsApp al abrir:** hoy solo avisa la campana. Cuando llegue WhatsApp (docs/FOUNDATIONS.md §8), el aviso «te acaban de abrir la propuesta» es candidato natural.

## Archivos

- `supabase/migrations/20261017000000_dossier_views.sql` (tabla, RLS, función y aviso) · `supabase/tests/37_dossier_views.test.sql`
- `src/lib/analytics/*` (cálculos, datos demo y Supabase) · `src/lib/analytics/analytics.test.ts`
- `src/pages/api/track.ts` · `src/components/dossier/DossierView.astro` (script de medición)
- `src/pages/admin/analytics.astro` · `src/pages/admin/dossiers/[id]/analytics.astro`
- `scripts/smoke-analytics.cjs`
