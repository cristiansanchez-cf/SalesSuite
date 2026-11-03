# Asistente de WhatsApp

Quien es del equipo escribe, manda un audio o reenvía mensajes de un cliente al **número de WhatsApp del espacio** (el
mismo de los leads: Leads → Ajustes → WhatsApp) y el asistente lo apunta en la ficha de su empresa. Es «Apuntar con IA»
(docs/CRM_DINAMICO.md §20) por WhatsApp: mismos permisos, misma separación por empresa y nada se guarda sin «Guardar».

## Quién es quién

- **Del equipo:** el teléfono de **Mi cuenta** (`users.phone`) coincide con quien escribe y tiene membresía de admin,
  gerente o comercial en el espacio del número. Vale con o sin prefijo (coinciden los últimos 9 dígitos o más). Los
  colaboradores no usan el asistente.
- **Lo demás** (leads y desconocidos) sigue como siempre (docs/LEADS.md §WhatsApp). A un desconocido no se le contesta.
- Se actúa como esa persona (`contextAs`, como Correos al CRM): sus permisos, su nombre en el historial.

## La conversación (`src/lib/assistant/flow.ts`)

1. **Lo que cuenta** (texto o audio): «Apuntar» lo separa por empresa y la busca por el nombre (sin IA).
   - Si está clara (parecido ≥ 0,9 y sin otra cerca) va sola.
   - Si duda, pregunta: «¿Cuál es «Salamandra»? 1) Grupo Salamandra · Valencia 2) … 0) Crear «Salamandra»». Se
     contesta con el número, «0» para crearla, «saltar» para no apuntar esa, o el nombre bien escrito.
2. **El resumen**: empresa, canal y resultado, lo que pasó, lo que sabemos y el próximo paso, con los botones
   **Guardar** / **Cambiar** (o «sí» / «no»). «Cambiar» no guarda nada: se manda otra vez.
3. **Reenviados**: los mensajes reenviados se juntan; a la primera pregunta de qué empresa es la conversación. Con el
   nombre, el resumen como «WhatsApp · contestó» con los textos juntos.
4. **Audios**: Whisper (`OPENAI_API_KEY`, modelo `whisper-1`); responde «He entendido: «…»» y sigue como un texto. Sin
   clave: «escríbemelo».
5. «cancelar» empieza de cero; lo que queda a medias caduca a la media hora. «hola» o «ayuda»: cómo se usa.

## Técnica

- Webhook `POST /api/v1/whatsapp/webhook`: separa lo del equipo y lo procesa en segundo plano (`waitUntil`) para
  contestar a Meta enseguida. En demo, sin `WHATSAPP_APP_SECRET`, admite mensajes sin firma y contesta antes de responder.
- Estado por persona y espacio en `wa_assistant_state` (migración `20261224000000_wa_assistant.sql`; solo service role),
  con los últimos mensajes ya procesados (Meta reintenta) y una versión para los reenviados que llegan a la vez.
- `assistant_member_by_phone(dígitos)`: quién del equipo tiene ese teléfono (solo service role).
- Respuestas con texto libre y botones (`sendText`, `sendButtons` en `src/lib/leads/whatsapp.ts`): Meta las permite
  sin plantilla durante 24 h desde el último mensaje de la persona, que es siempre el caso (contesta a lo que escribe).
- Pruebas: `src/lib/assistant/assistant.test.ts` (la conversación y de punta a punta en demo) y
  `supabase/tests/82_wa_assistant.test.sql`.

## Recordatorios de la mañana

Cada mañana, entre las 9:00 y las 12:00 de su zona horaria, el asistente escribe a quien lo tenga activado en **Mi
cuenta → Avisos** («Recordatorio por WhatsApp»; hace falta su móvil en Mi cuenta). Le cuenta lo de «Hoy» en sus empresas:

- lo que **se enfría**: contestó y llevamos 3 días laborables sin hacer nada;
- lo **vencido**;
- lo que **toca hoy**.

Son 5 como mucho. Si no tiene nada, no se le escribe. Solo se le escribe una vez al día (`wa_reminder_log`). Lo lanza el
cron de `/api/cron/leads` cada 10 minutos (`?reminders=force` para probarlo).

Para escribir primero, WhatsApp exige una **plantilla aprobada** (categoría *Utility*). Se apunta en Leads → Ajustes →
WhatsApp → «Recordatorio al equipo». Sin plantilla, o sin número, no se manda nada y se vuelve a intentar en la siguiente
pasada. Lo que hay que dar de alta en Meta (WhatsApp Manager → Plantillas):

| Nombre | Idioma | Texto | Botones (respuesta rápida) |
|---|---|---|---|
| `equipo_recordatorio_es` | es | Hola {{1}}, hoy tienes {{2}} seguimientos pendientes en el CRM: {{3}}. ¿Te preparo una propuesta de mensaje para cada uno? | «Sí, prepáralos» · «Más tarde» |
| `equipo_recordatorio_en` | en | Hi {{1}}, you have {{2}} follow-ups due in the CRM today: {{3}}. Shall I draft a message for each one? | «Yes, draft them» · «Later» |
| `equipo_recordatorio_fr` | fr | Bonjour {{1}}, vous avez {{2}} relances à faire aujourd'hui dans le CRM : {{3}}. Je vous propose un message pour chacune ? | «Oui, prépare-les» · «Plus tard» |

En cada variable, Meta pide un ejemplo: {{1}} el nombre de pila («Marta»), {{2}} el número de seguimientos («3») y {{3}}
la lista de empresas («Club Sol, Sala Marina y 1 más»).

Si contesta que sí (el botón o un «sí», «vale», «dale»), le llega **una propuesta de mensaje por empresa**. La escribe
Claude Haiku con el último contacto, el próximo paso y los datos clave de la empresa (`src/lib/assistant/draft.ts`). Cada
propuesta lleva dos botones:

- **Hecho**: apunta en el CRM que le ha escrito por WhatsApp, y la regla propone el siguiente paso.
- **Mañana**: el próximo paso pasa a mañana a las 10:00.

Si dice «más tarde» o «no», no pasa nada: lo tiene en «Hoy». Si escribe otra cosa larga, se apunta como siempre. La
pregunta espera su respuesta todo el día (14 horas).

## Pendiente

- Fotos y documentos (hoy: «De momento apunto texto y audios»).
