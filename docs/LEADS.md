# Leads de las webs

El CRM es la **única puerta de entrada** de los leads de las webs de cada empresa (Enjoy, Oquea, SciScreen, Trama…).
La web solo recoge y envía. El CRM guarda, deduplica, filtra, puntúa y contacta (email con Resend y WhatsApp con la
Cloud API de Meta), sin servicios intermedios. Las claves viven solo en el servidor del CRM.

La conversión se decide **después del clic**: lo que más pesa es la velocidad del primer contacto y que el siguiente
paso sea fácil. Por eso la respuesta automática sale en segundos, el aviso a quien atiende es inmediato y la métrica
principal es el tiempo hasta el primer contacto humano en minutos laborables.

```
Web ──POST JSON──▶ https://<espacio>.ventas.cofundo.io/api/v1/leads
                     ├─ valida (v2 y v1) · antispam → cuarentena · normaliza · deduplica · puntúa
                     ├─ guarda «por validar» (fuera del CRM principal) con la prueba legal
                     ├─ programa: email automático + aviso interno (+ WhatsApp 1 y 2 si procede)
                     └─ 201 { id, next }   (< 2 s; los envíos salen en segundo plano)
cola (lead_message) ◀── /api/cron/leads cada minuto  +  envío inmediato tras responder (waitUntil)
WhatsApp ──webhook──▶ /api/v1/whatsapp/webhook  → para la secuencia, «respondió», aviso a quien atiende
```

Código: `src/lib/leads/` (contrato, normalización, horarios, CORS, textos, puntuación, entrada, cola, webhook, consola).
Base de datos: migración `20261215000000_leads.sql` (pruebas SQL `77_leads`). Consola: CRM → **Leads web**.

## 1. Contrato (v2)

`POST https://<espacio>.ventas.cofundo.io/api/v1/leads` · `Content-Type: application/json` · desde el navegador.
Enjoy: `https://enjoy.ventas.cofundo.io/api/v1/leads`. El espacio lo decide el dominio; `brand` tiene que ser el suyo
(si no, `400 {errors:{brand:'unknown'}}`).

**Pruebas:** el mismo endpoint. Lo que llega desde `http://localhost:*`/`http://127.0.0.1:*` o con `"test": true` se
guarda como prueba (pestaña *Pruebas*), nunca envía nada y no cuenta en las métricas. Funciona aunque la entrada esté
apagada en Ajustes.

### CORS
- Preflight `OPTIONS` → `204` con `Access-Control-Allow-Origin: <origen>`, `Allow-Methods: POST, OPTIONS`,
  `Allow-Headers: Content-Type`, `Max-Age: 86400`, `Vary: Origin`. Un origen fuera de la lista → `403` sin cabeceras.
- Lista blanca por espacio (Leads → Ajustes). Enjoy: `https://enjoytheclub.es`, `https://www.enjoytheclub.es`,
  `https://corporativeweb-b0ce4.web.app` y los previews **de ese sitio** `https://corporativeweb-b0ce4--*.web.app`
  (no cualquier `*.web.app`: cualquiera puede crear uno). `localhost` y `127.0.0.1` siempre, como prueba.
- Sin `Origin` (curl, servidor) se admite.

### Cuerpo
Como lo propuso la web, con estos cambios (todos opcionales, compatibles hacia atrás):

| Campo | Cambio |
|---|---|
| `test` | `true` → prueba (ver arriba). |
| `contact.phone_country` | ISO2 (`ES`, `FR`…). Si no viene: el prefijo del número; si no hay, el idioma (`fr`→FR); si no, ES. |
| `consent.whatsapp_notice_shown` | Nombre nuevo de `whatsapp_contact` (se aceptan los dos). Es un **aviso** mostrado, no un consentimiento. |
| `consent.whatsapp_text_version` | Versión del texto del aviso de WhatsApp que vio (prueba para Meta). |
| `context.attribution.*.gbraid` / `wbraid` | Google Ads en iPhone (cuando no hay `gclid`). También `fbp`/`fbc` si algún día hay Meta Ads (solo con `cookie_consent.ads`). |
| `antispam.turnstile_token` | Si se activa Cloudflare Turnstile (`TURNSTILE_SECRET` en el servidor). Sin token, todo funciona igual. |

- `submitted_at` del cliente se guarda, pero la hora que vale como prueba es la del servidor (`consent.received_at`).
- Límites: cuerpo 32 KB (`413`), `message` 5.000 caracteres, 30 campos en `fields`, todo string.
- `fields` por tipo: los de la web (`general.event_type` y `wedding_partner.company` obligatorios; valores cerrados en
  `event_type`, `attendees`, `budget`, `how_heard`; `wedding_date` en `YYYY-MM-DD`). Lo demás se guarda tal cual.
- **v1** (`enjoy.lead.v1`) se sigue aceptando: exige `consent.privacy: true` y no avisa de WhatsApp (solo email).

### Respuestas
| Código | Cuándo | Cuerpo |
|---|---|---|
| `201` | Creado | `{ id, next: { channel: 'whatsapp' \| 'email', eta: 'minutes' \| 'today' \| 'next_business_day', at?, booking_url? } }` |
| `200` | `idempotency_key` repetido | La misma respuesta que la primera vez + `duplicate: true` (la web lo trata como éxito, con su `next`). |
| `400` | Validación | `{ errors: { 'contact.email': 'invalid', 'fields.event_type': 'required', schema: 'unknown_schema' … } }` |
| `403` | Origen no permitido | `{ error: 'origin_not_allowed' }` |
| `413` / `415` | Cuerpo grande / no es JSON | |
| `429` | Más de 8 envíos en 10 minutos desde la misma IP | |
| `503` | Entrada apagada en Ajustes (`leads_disabled`) o servidor sin configurar | |

`next.channel = 'whatsapp'` solo si hay WhatsApp configurado, el lead vio el aviso y el teléfono es válido; si no,
`email` con `eta: 'minutes'` (la confirmación llega en segundos). `next.at` es la hora exacta del primer WhatsApp.
`eta: 'today'` solo sale si no se le va a escribir solo: sin remitente configurado, ya recibió el email automático en
las últimas 24 h, se dio de baja o lo sospechoso (cuarentena). Las **pruebas** (`test: true` o desde localhost) responden
lo mismo que un lead real, pero no se envía nada.
`next.booking_url` (https, opcional): el enlace de reserva de su tipo e idioma (Ajustes → Vídeo y reserva por tipo; si no,
el del tipo «general» y luego el general). Si no está claro qué es (marca, prensa…), el general. Si no hay ninguno, no
viene. Va también en la respuesta `200` de un duplicado (la de la primera vez).
Lo sospechoso responde con el mismo formato (`201`, sin pistas de por qué) y va a cuarentena.

```bash
curl -i -X POST https://enjoy.ventas.cofundo.io/api/v1/leads -H 'Content-Type: application/json' -d '{
  "schema":"enjoy.lead.v2","idempotency_key":"prueba-1","brand":"enjoy","type":"venue","test":true,
  "contact":{"name":"Prueba","email":"prueba@example.com","phone":"600123123"},
  "fields":{"venue_name":"Sala Prueba","city":"Valencia"},
  "consent":{"marketing":false,"whatsapp_notice_shown":true,"legal_text_version":"2026-11-01","policy_url":"https://enjoytheclub.es/es/politica-de-privacidad/"},
  "context":{"locale":"es","page_path":"/es/","cta":{"id":"test","label":"Test"},"time_to_submit_ms":10000}
}'
```

## 2. Entrada
- **Antispam invisible → cuarentena** (no se borra ni se contacta ni se avisa; se revisa en la pestaña *Cuarentena*):
  `time_to_submit_ms < 2500`, email desechable, 3 enlaces o más en el mensaje, nombre = email o con enlace, 3 envíos o
  más del mismo email en una hora, Turnstile fallido. Por IP: `429` a partir de 8 en 10 minutos (se guarda solo el hash).
- **Normalización:** email en minúsculas y clasificado (`business`, `free_webmail`, `disposable`, `role`; el webmail
  gratuito se acepta y solo baja la puntuación). Teléfono a E.164 (`libphonenumber-js`); si no se puede, no hay WhatsApp.
- **Duplicados:** contacto = email normalizado (por espacio); cuenta = dominio, salvo webmail y desechables. Un envío
  repetido **suma una actividad** (CTA, página, mensaje) al mismo lead; la primera atribución **nunca se sobrescribe**;
  la última sí. Con una conversación de WhatsApp abierta (secuencia en marcha, respuesta suya o un primer mensaje en los
  últimos 30 días) no se reinicia la secuencia. El email automático, como mucho uno al día.

## 2b. Clasificar antes de escribir
El tipo de formulario no basta: una marca de bebidas que busca un acuerdo puede escribir desde «locales» o desde
«otro». Antes de mandar nada automático (`src/lib/leads/classify.ts`):

1. **Reglas, al momento (en la entrada):** el formulario dice qué se espera (local, DJ, festival, boda; «otro»,
   proveedores de bodas, desarrollo a medida y lista de espera no tienen mensaje automático). Si en lo que escribió hay
   señales de marca o alianza (patrocinio, distribución, «nuestra marca», marca de bebidas, inversión…), prensa,
   trabajo o alguien que nos vende algo, **no hay WhatsApp automático** y `next` es `email`.
2. **IA, antes del primer envío (en la cola, con Haiku, si hay `ANTHROPIC_API_KEY`):** con el dominio del email, la
   empresa, el mensaje y el contexto del espacio (qué vende y a quién, `lead_settings.ai_context`, que se actualiza al
   guardar los ajustes o los mensajes). Puede **quitar** el automático (si no coincide o la confianza es < 0,75: se
   cancelan los WhatsApp), nunca darlo si las reglas lo quitaron.
3. Cuando no hay automático: el email sale **neutro** («Gracias por escribir… te contesto personalmente», sin nombrar lo
   que pidió), en la bandeja aparece «Marca o alianza · Lo sigues tú» y el aviso a quien atiende lo dice. Si la web ya
   le había dicho «te escribo por WhatsApp», el aviso pide escribirle a mano.

## 2c. Mensajes de cada empresa
Leads → Ajustes → **Mensajes**, por idioma: asunto y cuerpo del email, WhatsApp 1 y 2 y la pregunta del WhatsApp 1
según lo que pidió. **Proponer con IA** los escribe a partir de qué vende la empresa, a quién y quién firma (no guarda:
se revisa y se guarda). Solo se guarda lo que difiere de los de por defecto. Los de WhatsApp tienen que llevar
`{{1}}`, `{{2}}` y `{{3}}` y coincidir con la plantilla aprobada en Meta (si se cambian, nueva aprobación).

## 2e. Vídeo y reserva por tipo
Leads → Ajustes → Email → **Vídeo y reserva por tipo de lead**: para `general`, `venue`, `dj`, `festival`, `wedding`,
`wedding_partner` y `custom_dev`, en `es`, `en` y `fr` (`lead_settings.media`, migración `20261220000000_lead_media.sql`).
Cada lead usa los de su tipo en su idioma; lo vacío, los del tipo «general» en su idioma y, si tampoco, el vídeo y el enlace
generales de arriba. Un lead `general` que dice qué es (`event_type`: venue, dj…) usa los de ese tipo. Se usan en:
- el email automático: `{video}` («Mientras, aquí tienes un vídeo corto para verlo en marcha: …») y `{reserva}`. Un
  texto propio del email tiene que llevar `{video}` para que salga;
- el `{{3}}` del WhatsApp 2: la reserva o, si no hay, el vídeo;
- `next.booking_url` de la respuesta (el botón «Elige hora para hablar» de la web).
Si no está claro qué es (marca, prensa…), el email no lleva vídeo y la reserva es la general. Enjoy viene con los vídeos
de su web (locales, testimonio de DJ y festival, en los tres idiomas); las bodas usan el general.

## 2d. Firma del email
Leads → Ajustes → **Firma del email**: nombre, cargo y empresa, teléfono, dirección, email, web, logo (PNG o JPG por
https: Gmail no muestra SVG) y texto legal. Va donde esté `{firma_email}` en el email automático (en los textos por
defecto, tras la despedida), maquetada con tablas y estilos en línea para que se vea igual en Gmail y Outlook, y en
texto en la versión sin formato. Sin firma, `{firma_email}` es el nombre de quien firma y la marca.

## 3. Ciclo de vida y métrica
`new → contacted → replied/booked → meeting → opportunity → won | lost`, además de `nurture`, `discarded` (motivo
obligatorio) y `spam`. Cada cambio queda en el historial con fecha, hora y quién. Los leads entran **por validar**,
fuera del CRM principal; **Validar** crea la persona (y su empresa, si se sabe: local, empresa o evento) con la etiqueta
`web` y el origen en las notas.

**Métrica clave:** `first_response_at − created_at` en minutos laborables (lunes a viernes no festivos, 9-20 h hora del
espacio). Cuenta el **primer contacto humano**: «Lo he contactado yo» o cualquier cambio de etapa que no sea nuevo, spam
o descartado. El WhatsApp automático pasa el lead a `contacted` pero no cuenta como respuesta humana. Arriba de la
bandeja: mediana de 30 días, cuántos en menos de 5 minutos y de dónde vienen.

## 4. Envíos
Todo pasa por la cola `lead_message`: se reclama antes de enviar (dos ejecuciones no mandan dos veces), se comprueba
otra vez si sigue teniendo sentido y se reintenta 3 veces (a los 5 y 10 minutos).

- **Email automático** (Resend, a todos, también con WhatsApp): en segundos, aspecto de texto plano, firmado, repite lo
  que pidió, dice qué pasará y cuándo, enlace de reserva, sin promoción. Remitente y `Reply-To` de Ajustes.
  `List-Unsubscribe` + `List-Unsubscribe-Post` (baja con un clic) y enlace de baja al pie.
- **Aviso interno** a los emails de Ajustes, al momento: todos los datos, CTA, página, origen, puntuación y qué
  pasará. `Reply-To` = el lead. Cuando contesta por WhatsApp, otro aviso: «te toca a ti».
- **WhatsApp** (si hay `WHATSAPP_TOKEN`, número y plantillas en Ajustes, el lead vio el aviso y el teléfono es válido):
  - Mensaje 1 a los 1-3 minutos entre las 8:00 y las 22:00 (hora del espacio); fuera de ese horario, a las 9:00
    siguientes (`next.eta` lo refleja).
  - Mensaje 2 al día laborable siguiente (~10:00), solo si no ha contestado.
  - Se para en cuanto responde, reserva, pide que no le escriban («baja», «stop»…), lo para una persona o cambia a una
    etapa de seguimiento o cierre. Desde ahí sigue Cristian en persona. Nada de IA conversando.
- **Bajas:** una lista por espacio que respetan todos los envíos (email, WhatsApp o todo). Desde el enlace del email,
  por WhatsApp o a mano en la ficha.
- Se miden respuestas y reservas, no aperturas.

## 5. Puntuación (reglas)
Encaje: tipo de lead, tamaño (asistentes, invitados, presupuesto), tipo de email, si sabemos quién/dónde. Intención:
boda cercana, mensaje con detalle, botón de contacto o precio, página de precios, vuelve a escribir. Encaje alto e
intención alta → **caliente** (fila destacada y 🔥 en el aviso); encaje bajo → **poco encaje**. El porqué de cada punto
se ve en la ficha. Lo que se sabe queda estructurado en `lead.facts` para un modelo futuro.

## 6. Prueba legal y anuncios
Cada envío guarda el bloque `consent` completo (con `legal_text_version`, `policy_url`) más la URL, la hora del
servidor, el origen y el hash de la IP (art. 7.1 RGPD). `consent_marketing` solo se activa con `marketing: true` (el
nurture solo se mandará a esos). `gclid`, `gbraid`, `wbraid`, `fbclid` y UTMs del primer y último contacto quedan
guardados; la subida de conversiones a Google Ads (reunión o ganado, hasta 90 días tras el clic) se hará **solo** con
`cookie_consent.ads = true` (`consent_ads`).

## 7. Puesta en marcha

1. **Migración** `20261215000000_leads.sql` (GitHub → Actions → Producción → `migraciones`). Deja los ajustes de Enjoy
   creados y **apagados**.
2. **Vercel → Environment Variables** (ya están `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`,
   `CRON_SECRET`): opcional `LEADS_SECRET` (si no, usa `CRON_SECRET`). Para WhatsApp, cuando haya número:
   `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`. `/api/health` dice si están.
3. **Cron cada minuto** (Supabase → SQL Editor; el `CRON_SECRET` se pega desde el gestor, nunca en un chat):
   ```sql
   select cron.schedule('ventas-leads', '* * * * *', $$
     select net.http_get(
       url := 'https://enjoy.ventas.cofundo.io/api/cron/leads',
       headers := jsonb_build_object('Authorization', 'Bearer PEGA_AQUI_EL_CRON_SECRET')
     );
   $$);
   ```
   Una sola tarea sirve para todas las empresas. Sin ella, el email automático y el aviso salen igual (envío inmediato),
   pero los WhatsApp programados no.
4. **Resend de cada empresa.** Cada empresa usa **su propia cuenta de Resend** (su dominio, su factura, su
   reputación; el plan gratuito vale porque cada cuenta tiene su dominio):
   - En su Resend → *Domains* → *Add domain* con su dominio (p. ej. `enjoytheclub.es`, región EU). Los registros que
     muestra Resend van en `send.<dominio>` y `resend._domainkey.<dominio>`: no tocan el MX ni el correo que ya usan.
   - **DMARC** en el dominio, si no tiene: `_dmarc TXT "v=DMARC1; p=none; rua=mailto:hello@<dominio>"`.
   - En su Resend → *API Keys* → crear una clave (permiso completo para que la consola pueda mostrar el estado del
     dominio, o «Sending access» si se prefiere) y pegarla en **Leads web → Ajustes → Cuenta de Resend**. Se comprueba,
     se guarda cifrada (`lead_secret`, solo la lee el servidor) y no se vuelve a mostrar (solo `re_…abcd`).
   - Sin clave propia, el espacio envía con la cuenta de la plataforma (`RESEND_API_KEY`), que solo sirve si el
     remitente es de un dominio verificado en esa cuenta.
   - **Importante:** las claves se cifran con `LEADS_SECRET` (o `CRON_SECRET` si no hay). Ponlo en Vercel antes de
     guardar claves y no lo cambies: si cambia, habría que volver a pegar las claves.
   - Para el nurture, más adelante, un subdominio aparte (`news.<dominio>`) para proteger la reputación del principal.
5. **Leads → Ajustes** (admin): remitente (`hello@enjoytheclub.es`), nombre (`Cristian · Enjoy the Club`), *Responder a*
   (un buzón compartido que se lea, p. ej. `hello@`), firma, a quién avisar, enlace de reserva, webs permitidas, festivos. Revisar la vista previa. Arriba de Ajustes, «Lo que tienes» dice qué falta; **Activar** (arriba a la
   derecha) solo se puede con lo obligatorio listo (cuenta de email y dominio, remitente y respuestas, a quién avisar).
   En pruebas (pausado) solo entran los envíos de prueba. Se llega desde Leads web (bandeja) o desde Configurar → Empresa.
6. **Dar la URL a la web** (`https://enjoy.ventas.cofundo.io/api/v1/leads`) y probar con `"test": true` o desde
   localhost; luego un envío real.
7. **WhatsApp, cuando haya SIM:**
   - Meta Business verificado → WhatsApp Business Platform → añadir el número (recibe un SMS o llamada: por eso hace falta
     la SIM). Si ese número ya se usa en la app de WhatsApp Business, mirar la opción de usarlo a la vez en la app y en
     la API; si no, se contesta desde otra app o desde el CRM (pendiente).
   - Crear las plantillas de abajo (categoría *Utility*, idiomas `es_ES`, `en`, `fr`), con los nombres que se pondrán en
     Ajustes (p. ej. `lead_hola_es`, `lead_recordatorio_es`…).
   - Token permanente de un *System User* con `whatsapp_business_messaging` → `WHATSAPP_TOKEN`.
   - Webhook: URL `https://enjoy.ventas.cofundo.io/api/v1/whatsapp/webhook`, token de verificación =
     `WHATSAPP_VERIFY_TOKEN`, suscribir `messages`. `WHATSAPP_APP_SECRET` = el App Secret de la app de Meta. Un solo
     webhook sirve para todas las empresas (el número dice de cuál es).
   - En Ajustes: el `phone_number_id`, los nombres de las plantillas y **Enviar por WhatsApp**.
   - Se llama a la Graph API v25.0 (`src/lib/leads/whatsapp.ts`; vigente hasta julio de 2028). Subirla antes de que caduque.
   - Categoría: el WhatsApp 1 responde a lo que pidió (servicio, *Utility*). El 2 es un recordatorio: si Meta lo pasa a
     *Marketing*, sigue funcionando pero cuesta más (en España ~0,06 € frente a ~0,017 €).
   - En la web, el aviso bajo el teléfono debe nombrar WhatsApp y la marca (es la prueba de que aceptó que le escribieran
     por ahí) y mandar `whatsapp_notice_shown` y `whatsapp_text_version`.

## 8. Plantillas (para revisar y pedir la aprobación a Meta)
Con la voz de quien firma (Ajustes → Firma) y en el idioma del lead (`es`, `en`, `fr`; otros → `en`). Son mensajes de
servicio sobre lo que pidió, sin promoción. Variables: `{{1}}` nombre, `{{2}}` lo que pidió (generado: «Sala X en
Valencia», «vuestra boda del 14 de junio de 2027»…), `{{3}}` una pregunta según el tipo (mensaje 1) o el enlace de
reserva (mensaje 2; si no hay, el vídeo). Fuente: `src/lib/leads/templates.ts` (si se cambian aquí, cambiarlas también
en Meta). Ajustes → Leads muestra la vista previa con los datos reales del espacio.

### ES

**wa1 (plantilla para Meta)**

```
Hola {{1}}, soy Cristian, de Enjoy the Club. He visto tu mensaje sobre {{2}} y quería escribirte yo directamente.

{{3}}

Con eso te digo cómo lo veo.

Cristian
```

Ejemplo (local «Sala X» en Valencia):

```
Hola Laura, soy Cristian, de Enjoy the Club. He visto tu mensaje sobre Sala X en Valencia y quería escribirte yo directamente.

¿Qué noches abrís y cuánta gente os suele venir?

Con eso te digo cómo lo veo.

Cristian
```

**wa2 (plantilla para Meta)**

```
Hola {{1}}, te escribo de nuevo por lo de {{2}}. Si te va mejor hablarlo, elige aquí la hora que te venga bien: {{3}}

Y si prefieres seguir por aquí, contéstame cuando puedas.

Cristian
```

Ejemplo (local «Sala X» en Valencia):

```
Hola Laura, te escribo de nuevo por lo de Sala X en Valencia. Si te va mejor hablarlo, elige aquí la hora que te venga bien: https://cal.com/cristian

Y si prefieres seguir por aquí, contéstame cuando puedas.

Cristian
```

**Email automático (con WhatsApp)** — asunto: «Sobre Sala X en Valencia»

```
Hola Laura:

Gracias por escribir. Me llega tu mensaje sobre Sala X en Valencia y lo leo yo.

Te escribo por WhatsApp en unos minutos para que me cuentes un poco más.

Si prefieres hablarlo directamente, elige aquí la hora que te venga bien: https://cal.com/cristian

Y si quieres añadir algo, responde a este email.

Un saludo,
Cristian
Enjoy the Club

—
Si no quieres que te escribamos más: https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?…
```

**Email automático (solo email)** — asunto: «Sobre Sala X en Valencia»

```
Hola Laura:

Gracias por escribir. Me llega tu mensaje sobre Sala X en Valencia y lo leo yo.

Te contesto yo personalmente a este mismo email, normalmente en el día.

Si prefieres hablarlo directamente, elige aquí la hora que te venga bien: https://cal.com/cristian

Y si quieres añadir algo, responde a este email.

Un saludo,
Cristian
Enjoy the Club

—
Si no quieres que te escribamos más: https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?…
```

### EN

**wa1 (plantilla para Meta)**

```
Hi {{1}}, it's Cristian from Enjoy the Club. I saw your message about {{2}} and wanted to get back to you myself.

{{3}}

With that I can tell you how I see it.

Cristian
```

Ejemplo (local «Sala X» en Valencia):

```
Hi Laura, it's Cristian from Enjoy the Club. I saw your message about Sala X in Valencia and wanted to get back to you myself.

Which nights are you open and how many people do you usually get?

With that I can tell you how I see it.

Cristian
```

**wa2 (plantilla para Meta)**

```
Hi {{1}}, following up on {{2}}. If it's easier to talk it through, pick a time that suits you here: {{3}}

Or just reply here whenever you can.

Cristian
```

Ejemplo (local «Sala X» en Valencia):

```
Hi Laura, following up on Sala X in Valencia. If it's easier to talk it through, pick a time that suits you here: https://cal.com/cristian

Or just reply here whenever you can.

Cristian
```

**Email automático (con WhatsApp)** — asunto: «About Sala X in Valencia»

```
Hi Laura,

Thanks for getting in touch. I've got your message about Sala X in Valencia and I'm reading it myself.

I'll message you on WhatsApp in a few minutes so you can tell me a bit more.

If you'd rather talk it through, pick a time that suits you here: https://cal.com/cristian

And if you want to add anything, just reply to this email.

Best,
Cristian
Enjoy the Club

—
If you'd rather not hear from us again: https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?…
```

**Email automático (solo email)** — asunto: «About Sala X in Valencia»

```
Hi Laura,

Thanks for getting in touch. I've got your message about Sala X in Valencia and I'm reading it myself.

I'll reply to this email personally, usually the same day.

If you'd rather talk it through, pick a time that suits you here: https://cal.com/cristian

And if you want to add anything, just reply to this email.

Best,
Cristian
Enjoy the Club

—
If you'd rather not hear from us again: https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?…
```

### FR

**wa1 (plantilla para Meta)**

```
Bonjour {{1}}, c'est Cristian, de Enjoy the Club. J'ai vu ton message à propos de {{2}} et je voulais te répondre moi-même.

{{3}}

Avec ça, je te dis ce que j'en pense.

Cristian
```

Ejemplo (local «Sala X» en Valencia):

```
Bonjour Laura, c'est Cristian, de Enjoy the Club. J'ai vu ton message à propos de Sala X à Valencia et je voulais te répondre moi-même.

Vous ouvrez quels soirs et combien de monde vient en général ?

Avec ça, je te dis ce que j'en pense.

Cristian
```

**wa2 (plantilla para Meta)**

```
Bonjour {{1}}, je reviens vers toi pour {{2}}. Si c'est plus simple d'en parler, choisis ici le créneau qui te convient : {{3}}

Sinon, réponds-moi ici quand tu peux.

Cristian
```

Ejemplo (local «Sala X» en Valencia):

```
Bonjour Laura, je reviens vers toi pour Sala X à Valencia. Si c'est plus simple d'en parler, choisis ici le créneau qui te convient : https://cal.com/cristian

Sinon, réponds-moi ici quand tu peux.

Cristian
```

**Email automático (con WhatsApp)** — asunto: «À propos de Sala X à Valencia»

```
Bonjour Laura,

Merci pour ton message à propos de Sala X à Valencia. Je le lis moi-même.

Je t'écris sur WhatsApp d'ici quelques minutes pour que tu m'en dises un peu plus.

Si tu préfères en parler directement, choisis ici le créneau qui te convient : https://cal.com/cristian

Et si tu veux ajouter quelque chose, réponds simplement à cet e-mail.

À bientôt,
Cristian
Enjoy the Club

—
Si tu ne veux plus recevoir de messages de notre part : https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?…
```

**Email automático (solo email)** — asunto: «À propos de Sala X à Valencia»

```
Bonjour Laura,

Merci pour ton message à propos de Sala X à Valencia. Je le lis moi-même.

Je te réponds personnellement à cet e-mail, en général dans la journée.

Si tu préfères en parler directement, choisis ici le créneau qui te convient : https://cal.com/cristian

Et si tu veux ajouter quelque chose, réponds simplement à cet e-mail.

À bientôt,
Cristian
Enjoy the Club

—
Si tu ne veux plus recevoir de messages de notre part : https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?…
```


## 9. Pendiente (siguientes fases)
- **Cadencia completa:** después de los 2 WhatsApp, 5-6 toques en 10-14 días por 2-3 canales que se paran solos.
- **Nurture** cada 2-4 semanas, solo con `consent_marketing`, desde el subdominio de marketing.
- **Reserva automática:** webhook del calendario (Cal.com/Calendly) para pasar a `booked` y parar la secuencia sola.
- **Google Ads:** exportar o subir conversiones cualificadas por `gclid`/`gbraid`/`wbraid` (solo `consent_ads`).
- **Contestar desde el CRM** si el número de WhatsApp no puede compartirse con la app.
- Marcar como fallidos los WhatsApp que Meta devuelva como no entregados (hoy quedan en los registros).
