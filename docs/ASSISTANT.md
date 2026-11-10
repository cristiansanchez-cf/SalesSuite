# Asistente de WhatsApp

Quien es del equipo escribe, manda un audio o reenvía mensajes de un cliente al **número de WhatsApp del espacio** (el
mismo de los leads: Leads → Ajustes → WhatsApp) y el asistente lo apunta en la ficha de su empresa. Es «Apuntar con IA»
(docs/CRM_DINAMICO.md §20) por WhatsApp: mismos permisos, misma separación por empresa y nada se guarda sin «Guardar».

## Un número para todas las empresas

El chat con uno mismo de WhatsApp no pasa por Meta, así que nadie puede escribirse a sí mismo para apuntar: hace falta
otro número. Por eso el asistente tiene **su propio número** (`ASSISTANT_WHATSAPP_PHONE_ID`), uno para toda la
plataforma, y cada persona del equipo le escribe desde su WhatsApp de trabajo (el de Mi cuenta). El número de cada
empresa se queda para hablar con sus leads. Sin esa variable, todo sigue como antes (el asistente en el número de cada
empresa).

- **Una empresa:** va directo, como siempre.
- **Varias** (`src/lib/assistant/hub.ts`): al empezar el día pregunta «¿Para qué empresa trabajas hoy?» con un botón por
  empresa (o una lista si son más de tres; con más de diez, numeradas). Lo que mande antes de elegir se guarda (como
  mucho 10 mensajes) y se apunta en cuanto elige. Vale el botón, el número o el nombre exacto.
- **Hasta mañana:** la elección dura el día (en su zona horaria de Mi cuenta). **«empresa»** (o «cambiar de empresa»)
  vuelve a preguntar cuando quiera.
- **Recordatorio de la mañana:** sale de ese número con las plantillas `equipo_recordatorio_es/en/fr` (otros nombres
  con `ASSISTANT_REMINDER_TEMPLATES=es=…,en=…,fr=…`), **uno al día por persona**: de la empresa con la que trabajó la
  última vez si tiene algo; si no, de la primera que tenga. Esa empresa queda elegida para que su «sí» vaya a ella.
- **Desconocidos:** lo que llega a ese número de alguien que no es del equipo no se contesta ni va a leads.
- Estado en `wa_assistant_session` (migración `20261231000000_wa_assistant_hub.sql`, solo el servidor).

**Ponerlo en marcha:**
1. Un número que no esté en ningún WhatsApp (una línea nueva, virtual o un fijo que reciba la llamada de verificación).
2. Meta → la app (la misma que el número de la empresa) → WhatsApp → *Add phone number*. Si está en otra cartera de
   Meta con otro token, `ASSISTANT_WHATSAPP_TOKEN`; si está en otra app, también `ASSISTANT_WHATSAPP_APP_SECRET` y el
   mismo webhook (`/api/v1/whatsapp/webhook`).
3. Vercel: `ASSISTANT_WHATSAPP_PHONE_ID` = su *Phone number ID* → Redeploy. `/api/health` dice `assistantNumberConfigured`.
4. Las plantillas del recordatorio en la cuenta de WhatsApp de ese número (tabla de abajo).
5. Cada persona: su WhatsApp de trabajo en **Mi cuenta → Teléfono** y escribir «hola» al número del asistente.

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
