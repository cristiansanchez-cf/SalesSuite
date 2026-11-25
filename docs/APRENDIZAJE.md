# Aprender de las conversaciones (beta)

Durante la beta, quien usa el CRM ha aceptado que veamos sus conversaciones con el asistente para mejorarlo (criterio de
Cristian, 25-nov-2026). Se guardan, y cada 3 días la IA las revisa y dice qué problemas tiene la gente y qué proponemos.

## Qué se guarda (`assistant_log`)

- **WhatsApp** (`src/lib/assistant/process.ts`): cada mensaje que manda la persona (texto, audio ya transcrito,
  reenviado, captura, contacto, botón), con el paso en que estaba la conversación antes y después (`idle → confirm`…),
  y cada respuesta del asistente tal cual, con sus botones. Si un audio no se entiende o un envío falla, también.
- **MCP** (`src/pages/api/mcp.ts`): cada herramienta que usa su IA (Claude, ChatGPT), con lo que pidió y lo que salió.
- **Recordatorio de la mañana**: qué plantilla salió y con qué agenda.
- Los mensajes que llegan antes de elegir empresa (número del asistente con varias empresas) no se guardan aún.

Solo lo ve el **superadmin** (RLS `is_superadmin()`); escribe solo el servidor (clave de servicio). Se **borra a los 90
días** (`RETENTION_DAYS`). Se apaga con `ASSISTANT_LEARNING=0` (ni guarda ni revisa). Migración
`20270128000000_assistant_learning.sql`.

## La revisión (`assistant_review`, `src/lib/learning/review.ts`)

- **Cuándo:** el cron `/api/cron/leads` mira a las 5:00 UTC si han pasado 3 días desde la anterior
  (`REVIEW_EVERY_DAYS`); `?review=force` la lanza ya. También el botón «Revisar ahora» de la página.
- **Qué:** las conversaciones desde la revisión anterior (se cortan tras una hora sin mensajes), como texto, a Claude
  Sonnet (`REVIEW_MODEL`), con las cifras del periodo calculadas sin IA: personas, conversaciones, mensajes, audios
  (y no entendidos), reenviados, capturas, guardados, «Cambiar», cancelados, elegir empresa, «¿qué tengo hoy?», usos por
  MCP, recordatorios y errores. Como mucho ~160.000 caracteres (si hay más, las más recientes).
- **Qué devuelve:** un resumen, cómo lo usan de verdad y los problemas (fallo, no se entienden, piden algo que no hay,
  cuesta, o funciona bien), cada uno con cuántas veces y a cuántas personas, ejemplos literales, la causa probable y una
  propuesta concreta. Si falla la IA, la revisión queda con el error y las cifras.
- El gasto va a `learning.review` en Costes (sin espacio: es de la plataforma).

## Dónde se ve

**Plataforma → Aprender de las conversaciones** (`/admin/platform/aprendizaje`): la última revisión (cifras, resumen,
problemas con su propuesta), las anteriores y las conversaciones tal cual de los últimos 3, 7 o 30 días, por persona
(lo que manda, lo que contesta el asistente, el paso, las herramientas MCP y los errores).

## Siguiente

- Avisar por WhatsApp o correo al superadmin cuando haya una revisión nueva con problemas de prioridad alta.
- Guardar también lo de antes de elegir empresa (hub) y los usos de «Apuntar» desde la web.
- Al acabar la beta: pedir el consentimiento en Mi cuenta (o anonimizar) antes de seguir guardando.
