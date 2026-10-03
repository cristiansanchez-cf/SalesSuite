# Seguimiento comercial: diseño (para revisar)

> El seguimiento es donde se pierden más ventas: la propuesta se envía y nadie vuelve a escribir en el momento justo. Este documento propone cómo cubrirlo en SalesSuite por fases. La **fase A está implementada**; el resto queda diseñado.

## Fase A: próximo paso con fecha ✅ (implementada)

- Cada dossier tiene **próximo paso** (qué) y **fecha** (cuándo), con atajos de +2 días, +1 semana y +2 semanas.
- En el listado de dossiers:
  - chip con la fecha en cada dossier, en rojo si ha vencido;
  - filtro **⏰ Seguimientos**, ordenado por fecha;
  - aviso "tienes N seguimientos vencidos".
- **Preparar mensaje de seguimiento**, en un clic desde el dossier. Genera el contexto para el Cerebro con la etapa *Seguimiento*, la propuesta, su enlace y el próximo paso acordado.
- **Mapa de la cuenta**: personas reales con su papel (decide, paga, puede vetar…) y su postura (aliado, neutral, bloqueador). El guion avisa de quién falta por mapear.
- **Resultado** del dossier: en curso, ganado o perdido.

## Fase B: recordatorios 🔜

- **Resumen diario** por email (o WhatsApp vía n8n) a cada comercial: seguimientos de hoy y vencidos, con enlace directo a "Preparar mensaje".
- Implementación: un cron (Supabase `pg_cron` + Edge Function, o un workflow de n8n) que consulta `dossier.next_step_at` por autor. El índice `dossier_next_step_idx` ya existe.
- Para el líder: "dossiers publicados sin próximo paso" (propuestas abandonadas).

## Fase C: actividad y cadencias 🔜

- Tabla `activity` (llamada, mensaje, reunión, nota) por dossier y contacto, con fecha y resultado. Es la semilla del CRM: se convierte en `activity` de `contact`/`deal` sin migrar datos.
- **Cadencias por sector**, definidas por el líder en el playbook. Ejemplo para ocio nocturno:

  | Día | Acción |
  |---|---|
  | D+0 | Enviar el enlace |
  | D+2 | WhatsApp de seguimiento |
  | D+5 | Llamada |
  | D+10 | Último intento con una novedad |

  Cada paso propone la jugada adecuada (las de etapa *Seguimiento*) y su técnica del Cerebro.

## Fase D: disparadores por comportamiento 🔜 (con la analítica de visionado, Fase 2 del plan)

- "Ha abierto la propuesta 3 veces hoy" → avisar y proponer llamar ahora.
- "Lleva 5 días sin abrirla" → mensaje de reactivación.
- "Ha mirado mucho el precio" → preparar la objeción de precio.
- Datos: `dossier_event` (Fase 2) + reglas simples. El aviso llega con el contexto ya preparado.

## Fase E: Cerebro de Ventas en bucle 🔜

- El Cerebro recibe el contexto completo (ya disponible hoy en "Preparar mensaje" y en la exportación) y propone el mensaje.
- Tras el resultado (respondió / no respondió / ganado / perdido), el feedback vuelve al playbook como evidencia ("me funcionó") y alimenta las métricas de qué jugadas funcionan **en seguimiento**.
- Requisito: que el Cerebro exponga una API de servidor por tenant. Desde la app solo se puede consultar con el MCP del asistente del usuario.

## Preguntas para decidir

1. ¿Canal de recordatorios: email, WhatsApp (n8n) o ambos?
2. ¿Cadencias definidas por el líder por sector, o fijas al principio?
3. ¿El resultado "perdido" debe pedir un motivo (precio, timing, competidor…)? Sirve para aprender, pero añade fricción.
