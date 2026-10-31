# Seguimiento comercial: diseño (para revisar)

> El seguimiento es donde se pierden más ventas: la propuesta se envía y nadie vuelve a escribir en el momento justo. Este documento propone cómo cubrirlo en SalesSuite por fases. Las **fases A y B están implementadas**, la C se hizo en el CRM y de la D hay una parte; lo demás queda diseñado. El seguimiento de **empresas** (no de propuestas) está en docs/CRM_DINAMICO.md §10 y §33.

## Fase A: próximo paso con fecha ✅ (implementada)

- Cada dossier tiene **próximo paso** (qué) y **fecha** (cuándo), con atajos de +2 días, +1 semana y +2 semanas.
- En el listado de dossiers:
  - chip con la fecha en cada dossier, en rojo si ha vencido;
  - filtro **⏰ Seguimientos**, ordenado por fecha;
  - aviso "tienes N seguimientos vencidos".
- **Preparar mensaje de seguimiento**, en un clic desde el dossier. Genera el contexto para el Cerebro con la etapa *Seguimiento*, la propuesta, su enlace y el próximo paso acordado.
- **Mapa de la cuenta**: personas reales con su papel (decide, paga, puede vetar…) y su postura (aliado, neutral, bloqueador). El guion avisa de quién falta por mapear.
- **Resultado** del dossier: en curso, ganado o perdido.

## Fase B: recordatorios ✅ (por email)

- **Resumen diario** por email a cada comercial: vencidos, para hoy, abiertas en 24 h y sin próximo paso, con *Preparar mensaje* y *Abrir*; a admins y gerentes, además, cómo va el equipo (propuestas sin próximo paso, vencidos por persona). Detalle: docs/NOTIFICATIONS.md §Resumen diario.
- Implementación: `src/lib/notify/daily.ts` y `daily-job.ts`, desde `GET /api/cron/notifications` (Supabase `pg_cron` + `pg_net` cada 10 min, docs/PUESTA_EN_MARCHA.md paso 8). Registro en `daily_digest_log`.
- Pendiente: por WhatsApp.

## Fase C: actividad ✅ (en el CRM) · cadencias 🔜

- La actividad se hizo en el CRM, por empresa y persona: `crm_activity` (canal, resultado, con quién, nota) y próximo paso propuesto por regla (`src/lib/crm/followup.ts`). Ver docs/CRM_DINAMICO.md §10.
- **Cadencias por sector**, definidas por el líder en el playbook. Ejemplo para ocio nocturno:

  | Día | Acción |
  |---|---|
  | D+0 | Enviar el enlace |
  | D+2 | WhatsApp de seguimiento |
  | D+5 | Llamada |
  | D+10 | Último intento con una novedad |

  Cada paso propone la jugada adecuada (las de etapa *Seguimiento*) y su técnica del Cerebro.

## Fase D: disparadores por comportamiento (a medias)

Hecho: la analítica de visionado (`dossier_view`, docs/ANALYTICS.md), el aviso «… ha abierto tu propuesta» en la campana (uno por propuesta y día), la lista «Escríbele hoy» en Analítica y las aperturas en el resumen diario. Pendiente, lo de abajo:

- "Ha abierto la propuesta 3 veces hoy" → avisar y proponer llamar ahora.
- "Lleva 5 días sin abrirla" → mensaje de reactivación.
- "Ha mirado mucho el precio" → preparar la objeción de precio.
- Datos: `dossier_view` (aperturas, tiempo y tiempo por sección) + reglas simples. El aviso llega con el contexto ya preparado.

## Fase E: Cerebro de Ventas en bucle 🔜

- El Cerebro recibe el contexto completo (ya disponible hoy en "Preparar mensaje" y en la exportación) y propone el mensaje.
- Tras el resultado (respondió / no respondió / ganado / perdido), el feedback vuelve al playbook como evidencia ("me funcionó") y alimenta las métricas de qué jugadas funcionan **en seguimiento**.
- Requisito: que el Cerebro exponga una API de servidor por tenant. Desde la app solo se puede consultar con el MCP del asistente del usuario.

## Preguntas para decidir

1. ¿Canal de recordatorios: email, WhatsApp (n8n) o ambos?
2. ¿Cadencias definidas por el líder por sector, o fijas al principio?
3. ¿El resultado "perdido" debe pedir un motivo (precio, timing, competidor…)? Sirve para aprender, pero añade fricción.
