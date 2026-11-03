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

## Pendiente

- **Recordatorios a los 3 días por WhatsApp** con propuesta de mensaje: para escribir primero hace falta una plantilla
  aprobada (Utility) del tipo «Hoy te toca escribir a {{1}}. ¿Te propongo un mensaje?».
- Fotos y documentos (hoy: «De momento apunto texto y audios»).
