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
- Estado en `wa_assistant_session` (migración `20270102000000_wa_assistant_hub.sql`, solo el servidor).

**Ponerlo en marcha:**
1. Un número que no esté en ningún WhatsApp (una línea nueva, virtual o un fijo que reciba la llamada de verificación).
2. Meta → la app (la misma que el número de la empresa) → WhatsApp → *Add phone number*. Si está en otra cartera de
   Meta con otro token, `ASSISTANT_WHATSAPP_TOKEN`; si está en otra app, también `ASSISTANT_WHATSAPP_APP_SECRET` y el
   mismo webhook (`/api/v1/whatsapp/webhook`).
3. Vercel: `ASSISTANT_WHATSAPP_PHONE_ID` = su *Phone number ID* → Redeploy. `/api/health` dice `assistantNumberConfigured`.
4. Las plantillas del recordatorio en la cuenta de WhatsApp de ese número (tabla de abajo).
5. Cada persona: su WhatsApp de trabajo en **Mi cuenta → Teléfono** y escribir «hola» al número del asistente.

**En la consola** (docs/PLAN_AJUSTES.md, paso 5): **Configurar → Asistente** enseña a qué número escribe el equipo
(el común si está, si no el de la empresa; se pide a Meta, o `ASSISTANT_WHATSAPP_NUMBER`), quién tiene ya el teléfono
puesto, un mensaje para pasar al equipo y cómo van los recordatorios. En **Mi cuenta**, el teléfono es obligatorio para
quien vende (se guarda con prefijo, E.164) y la tarjeta «Tu asistente de WhatsApp» dice a qué número escribir, desde
cuál, y avisa si alguien pone el número del propio asistente (un número no puede escribirse a sí mismo).

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
   **Guardar** / **Cambiar** (o «sí» / «no»). «Cambiar» (o escribir otra cosa con el resumen delante) **corrige sobre lo
   que contó**: se vuelve a separar lo de antes con la corrección encima, y la empresa elegida (o «crear») y su ciudad
   se mantienen. En los reenviados y las capturas, «Cambiar» pregunta otra empresa.
   - **Empresa nueva**: su ciudad sale de lo que contó («La Parada en Almería», `places.ts`: sus zonas y el catálogo de
     España); si no hay, la pregunta (y busca también en Google). «no sé»: sin ciudad. Se crea la zona si falta.
   - **Conversación pegada** («[19/11/26, 10:21:09] Cristian: …», lo que copia WhatsApp): va literal en la interacción,
     tras el resumen, para guardar cómo le hablamos.
3. **Reenviados**: los mensajes reenviados se juntan; a la primera pregunta de qué empresa es la conversación. Con el
   nombre, el resumen como «WhatsApp · contestó» con los textos juntos.
4. **Capturas de pantalla** (`src/lib/assistant/screenshot.ts`): la captura de una conversación con un cliente (WhatsApp,
   Instagram, email…). Claude (`NOTES_MODEL`, con la imagen) saca los mensajes **tal cual**, en orden, con quién dijo
   cada uno, y el nombre que sale arriba. Se apunta como los reenviados: busca la empresa por el **pie de foto** si lo
   hay, si no por ese nombre (si duda, pregunta), y guarda la interacción con la conversación literal
   («Nosotros · 10:02: …» / «Cliente (Marta) · 10:15: …»), canal WhatsApp, Instagram o email. Varias capturas seguidas
   se juntan. Así queda el registro de **cómo le hablamos**, para ver después qué funciona (criterio de Cristian). No
   se guarda la imagen, solo el texto. Coste: `assistant.screenshot` en Costes. Sin `ANTHROPIC_API_KEY`: «Aún no puedo
   leer capturas». Si no es una conversación: lo dice.
5. **Audios**: Whisper (`OPENAI_API_KEY`, modelo `whisper-1`); responde «He entendido: «…»» y sigue como un texto. Sin
   clave: «escríbemelo».
6. «cancelar» empieza de cero; lo que queda a medias caduca a la media hora. «hola» o «ayuda»: cómo se usa.

### Respuesta inmediata

Criterio de Cristian: tarda 5–6 s en contestar y, mientras, uno se pone nervioso y escribe más. Nada más llegar un
mensaje se marca como leído y sale **«escribiendo…»** (Cloud API: `status: read` + `typing_indicator`, hasta 25 s o
hasta que contestemos; sin coste). Con un **audio** o una **captura**, que tardan, antes de ponerse llega «🎧 Escuchando
tu audio… dame unos segundos» (o «👀 Leyendo tu captura…») y vuelve el «escribiendo…».

El eco «🎙️ He entendido: «…»» repite el audio entero (hasta 3.500 caracteres, ~4 min de habla); antes se cortaba a 800
(~55 s) y parecía que no lo había entendido entero, aunque sí lo había transcrito todo.

### Con muy poco, pregunta antes de guardar

Criterio de Cristian: «he estado hablando con X» no es para guardar todavía. Un mensaje corto que solo dice con quién
ha hablado (`tooThin` en flow.ts: «he estado hablando / hablé / acabo de hablar con …», sin «que», «dijo», «quiere», días
ni dos puntos) → «Genial 👍 ¿Y qué te ha dicho X?» y espera (estado `context`). Lo siguiente (texto o audio) se junta
con eso y va al resumen. «Apúntalo» apunta lo que hay.

### Arreglar fichas con IA

Criterio de Cristian: «le ha costado un montón… he tenido que ponerlo exacto, palabra por palabra». Con frases fijas
unas comillas distintas (“ ” del móvil) ya lo rompían. Ahora, si el mensaje suena a arreglar fichas (`EDIT_HINT`:
corrige, cambia, descarta, «es una promotora», vincula, se llama, está en…), una IA pequeña (`edits.ts`, Haiku con
salida JSON) entiende con sus palabras qué empresas y qué cambios: **nombre, ciudad, tipo, descartar o recuperar, con qué
local trabaja** (una promotora interna o un DJ) y **una nota**. Si no es un arreglo (cuenta una visita), sigue como
siempre. Cada empresa se busca por su nombre de ahora (también sin la ciudad pegada); si hay varias parecidas, pregunta
cuál con número. Resumen «✏️ Esto es lo que cambio» con Guardar / Cambiar; nada cambia hasta Guardar. Sin clave de IA,
quedan las frases fijas de abajo.

### Arreglar nombre y ciudad, y descartar (caso Euforía)

- **Al preguntar cuál es**: «Euforía. Está en Murcia» → nombre «Euforía» y ciudad Murcia (`nameAndRest`, `saidPlace`);
  «sí, crear Euforia» crea con ese nombre sin volver a buscar. Antes todo iba al nombre.
- **Corrigiendo antes de guardar**: la ciudad que dices ahora manda sobre la de antes («no está en Madrid, está en
  Murcia»: cuenta la que no se niega); «se llama solo X» cambia el nombre de la nueva.
- **Recién guardado** (media hora, estado `saved`): «es solo Euforía», «está en Murcia, no en Madrid» arreglan esa
  empresa (`ops.edit`: solo nombre y ciudad; lo demás se queda).
- **Cualquier empresa, cuando sea**: «Corrige [nombre de ahora]: se llama X y está en Y», también sin dos puntos («corrige el nombre de X. Se llama solo Y», «cambia el nombre de X a Y», «corrige X, está en Z») (`fixCommand`). Si el nombre de ahora lleva la ciudad pegada («Euforía y está en Murcia»), también la busca sin ella y arregla la ciudad. «Corrige X» sin decir qué: explica cómo (no lo apunta como algo nuevo). Si hay varias
  parecidas, las enseña y pide el nombre exacto. Quien la lleva (o un gerente) puede; si no, lo dice.
- **Descartar**: lo que la IA propone descartar («no les interesa», «no encaja»…) sale en el resumen («🚫 Se descarta: …»)
  y se descarta al pulsar Guardar, con su motivo: queda en «Descartadas» y en el tablero como perdida, para que nadie
  vuelva a venderles lo mismo. Antes el asistente lo ignoraba.

### Cualificar

Criterio de Cristian: «¿se puede cualificar desde WhatsApp? Decir oye, tiene pantallas, hace tal… o proponer: hay
varias preguntas sin responder, me dices un poco y lo cualificamos».

- **En el resumen**, lo que se va a marcar en la cualificación («📋 Cualificación: Tamaño: Mediano · Pantallas: Sí»),
  sacado de lo que cuenta (la IA de Apuntar ya lo hacía; ahora se ve antes de guardar). Mismas palabras que la ficha
  (`src/lib/crm/qual-labels.ts`, compartido con Apuntar).
- **Tras guardar** una empresa, si le faltan preguntas importantes (las que más pesan de la ficha de su tipo: local,
  promotora o DJ), las propone con sus opciones: «📋 A Club Sol le faltan: • ¿Hay fiesta? (Es su negocio / Algunas
  noches / No)… ¿Me lo cuentas y lo marco?». Lo que conteste, con sus palabras, se marca («📋 Marcado en Club Sol:
  Pantallas: Sí. Aún faltan: …»); «luego» deja de preguntar.
- **«Cualifica X»** en cualquier momento: sin más, pregunta lo que falta; «cualifica X: tiene pantallas, hacen 2 fiestas
  al mes» lo marca directamente.
- Seguridad (caso Jumanji): solo se marca lo que la IA saca de ESA empresa; un relato largo nunca es una respuesta de
  cualificación ni un arreglo de fichas, y una corrección corta («es solo Euforia», «está en Murcia») va antes.
  Servicio: `qualGaps` y `qualifyFrom` (crm).

### Contactos compartidos

Criterio de Cristian: «le pases un contacto y le digas este es Jorge, es el encargado del 12 Torremolinos, y cree a la
persona, le ponga encargado, apunte su número y lo vincule… para todos los casos de documentar contactos».

- La tarjeta de contacto de WhatsApp (`type: contacts`) llega como texto (`contactCard` en lib/leads/whatsapp.ts:
  «Contacto compartido: Jorge Pérez · Teléfono: … · Email: … · Cargo: …»).
- **Primero la tarjeta**: «📇 Tengo el contacto de Jorge Pérez. ¿Quién es y de qué empresa?» (estado `card`, varias
  tarjetas se juntan); lo siguiente que diga va junto con la tarjeta a «Apuntar».
- **Primero lo cuenta**: si ya está el resumen (o esperando los mensajes), la tarjeta se junta con lo que contó.
- La IA pone la persona en `people` con su nombre, teléfono, email y el cargo que diga; el resumen la enseña («👤 Jorge
  Pérez · Encargado · +34…») y al «Guardar» se crea (o se completa si ya existía, sin pisar nada) y se vincula a la
  empresa con ese cargo (`notePeople`).

### En prueba

«Tnsi se va a pasar en prueba 2 meses» → `trial_until`; el resumen dice «⏳ En prueba hasta el…» y al guardar la pone en
prueba (docs/CLIENTS.md §En prueba). Si no se puede (p. ej. bloqueada), lo dice.

### Conversación en varios mensajes

Criterio de Cristian: al copiar mensajes de WhatsApp (lo ideal: salen con fecha y quién los dijo), WhatsApp solo deja
pegarlos todos si la caja está vacía. Si antes escribió «he estado hablando con X, mira lo que le he puesto:», solo entra
uno.

- **Pegado a medias** (`halfPasted`): una sola línea con fecha de WhatsApp y texto propio delante → no apunta nada; guarda
  lo que contó y responde «Pega primero los mensajes (solo eso) y yo lo junto con lo que me acabas de contar».
- **«Ahora te paso los mensajes»** (`announcesChat`, solo en un mensaje corto y al final: en un audio largo «te paso»
  es parte de lo que cuenta): espera (estado `context`, media hora) y junta lo que llegue: la
  conversación pegada, los reenviados (sin preguntar de qué empresa: ya lo dijo; se cierra con «listo») o capturas. Si al
  final no hay mensajes, «apúntalo» apunta lo que contó.
- **Después del resumen**: si pega la conversación que faltaba, se añade a lo que contó (no es una corrección).
- En todos los casos la conversación va literal en la interacción («Conversación:»); también desde «Apuntar con IA» en la
  web. En la ficha se pinta como un chat (lib/crm/convo.ts + components/admin/ChatThread.astro): el resumen arriba, los
  3 últimos mensajes y «Ver conversación entera», un modal con lo último abajo y «Cargar anteriores» de 40 en 40.

### Recordatorio de la mañana: por qué no llega

- **«Probarlo ahora»** (Mi cuenta, debajo de los avisos, con el recordatorio activado): lo manda ya, sin esperar a las
  9 ni mirar si ya salió hoy, y dice en pantalla qué ha pasado (`testReminder` → `remindOne`): enviado (con cuántos),
  nada en «Hoy», sin activar o sin móvil, sin número del asistente en el servidor, sin plantilla, o el error tal cual de
  Meta (p. ej. «Template name does not exist… (132001)»: falta crear o aprobar `equipo_recordatorio_es` en la cuenta de
  WhatsApp «Asistente CRM»).
- **Sin nada en «Hoy»** no se manda nada. Para decirle «hoy no tienes nada pendiente», una plantilla más (Utility, con
  `{{1}}` = nombre) y `ASSISTANT_REMINDER_EMPTY_TEMPLATES="es=equipo_sin_pendientes_es"` en Vercel.
- El cron lanza los recordatorios con el número del asistente aunque no esté el WhatsApp de los leads (`WHATSAPP_TOKEN`):
  antes hacía falta ese token aunque el asistente tuviera el suyo.

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

Mira los espacios donde es del equipo y, si es superadmin (entra en cualquiera sin ser miembro), también los
espacios donde lleva empresas. «Probarlo ahora» prueba el espacio en el que está; si ahí no le llega, lo dice.

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

- Documentos (PDF) y fotos que no son conversaciones.
- Ver en «Qué ha funcionado» qué frases y aperturas acaban en cita o en venta (las conversaciones ya se guardan literales).
