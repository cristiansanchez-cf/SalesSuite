# App de Enjoy → CRM: contrato para el agente de la app

> Para el agente que construye en la app de Enjoy (admins y DJs) las pantallas que hablan con el CRM: el alta del local
> en la prueba, «Talk to Enjoy» al acabar la prueba y «Request another venue». Fuente de verdad: `docs/LEADS.md`
> (§1 contrato, §1b App). Si algo de aquí choca con eso, gana `LEADS.md`.

## 1. Endpoint

```
POST https://enjoy.ventas.cofundo.io/api/v1/leads
Content-Type: application/json
```

- **Desde el móvil del usuario**, con el `fetch` de la app. No desde vuestro servidor: el CRM limita a 8 envíos cada 10
  minutos por IP y todas las altas saldrían de la misma.
- **Sin claves.** El endpoint es público; la app nativa no manda `Origin` y el CRM la admite. (Si la app fuera una web
  empaquetada —Capacitor, Ionic…—, avisad: su origen hay que tratarlo aparte.)
- `schema: "enjoy.lead.v2"`, `brand: "enjoy"`, `type: "venue"`, `context.source: "app"`.

## 2. Las tres pantallas

| Pantalla | `fields.intent` | `fields` además | `context.cta.id` | Qué hace el CRM |
|---|---|---|---|---|
| Create your venue (2 de 2) | `trial_signup` | `venue_name`, `city`, `app_venue_id` | `app-create-venue` | **Nada automático**: ni email ni WhatsApp (la bienvenida la da la app). Avisa a Cristian, que le escribe en persona. |
| Talk to Enjoy (prueba terminada) | `trial_ended` | `venue_name`, `app_venue_id` | `app-trial-ended` | Email de confirmación y WhatsApp en 1-3 min: «…sobre tu periodo de prueba de Sala X. ¿Te viene bien que lo hablemos hoy o mañana?» |
| Request another venue | `extra_venue` | `venue_name` (el nuevo), `city`, `current_venue` (el que ya tiene) | `app-extra-venue` | Email y WhatsApp: «…sobre un nuevo local: Sala Norte en Logroño. ¿Para cuándo quieres tener el nuevo local en marcha?» |

- Otra `intent` → `400 {errors:{'fields.intent':'invalid'}}`.
- Todo string; claves `^[a-z_]{1,40}$`; máximo 30 campos y 300 caracteres cada uno. `app_venue_id` es vuestro id
  interno del local (no datos personales).
- El CRM junta por email: las tres pantallas de la misma persona son **un solo lead** con varias actividades.

## 3. Contacto: de la sesión, sin preguntar

- `contact.name`, `contact.email` (obligatorios) y `contact.phone` (con prefijo, `+34 612 345 678`), del perfil del
  usuario con sesión. **No se piden en las pantallas 8 y 9.**
- **Nombre:** si no lo hay (Apple solo lo da en el primer inicio de sesión), pedir solo el nombre. **Nunca mandar el
  email como nombre**: va a cuarentena.
- **Apple «Ocultar mi email»** (`…@privaterelay.appleid.com`): se manda tal cual. Para que le lleguen los emails, en
  Apple Developer → Certificates, IDs & Profiles → *Services* → **Sign in with Apple for Email Communication** hay que
  registrar el dominio del remitente del CRM (el de Leads web → Ajustes → Email, verificado en Resend) y las
  direcciones desde las que escribe Cristian a mano. Lo hace Cristian, una vez. Si no, Apple rechaza esos emails.
- Emails desechables (mailinator…) van a cuarentena. Para probar, `test: true` (§6).

## 4. Cuerpo (ejemplo: Request another venue)

```json
{
  "schema": "enjoy.lead.v2",
  "idempotency_key": "9b2f…-uuid",
  "brand": "enjoy",
  "type": "venue",
  "contact": { "name": "Laura Gómez", "email": "laura@salax.es", "phone": "+34 612 345 678" },
  "fields": { "intent": "extra_venue", "venue_name": "Sala Norte", "city": "Logroño", "current_venue": "TEST PROD" },
  "message": null,
  "consent": {
    "marketing": false,
    "whatsapp_notice_shown": true,
    "whatsapp_text_version": "2026-11-05",
    "legal_text_version": "2026-11-05",
    "policy_url": "https://enjoytheclub.es/es/politica-de-privacidad/"
  },
  "context": {
    "source": "app",
    "locale": "en",
    "form_version": "app-1.0",
    "page_path": "/app/venues/request",
    "cta": { "id": "app-extra-venue", "label": "Send request", "location": "choose-venue" },
    "time_to_submit_ms": 4200,
    "submitted_at": "2026-11-05T10:00:00.000Z"
  }
}
```

- `idempotency_key`: un UUID por envío; el **mismo** si se reintenta (red caída, doble toque) → `200 duplicate`.
- `consent.whatsapp_notice_shown: true` solo si la pantalla enseña el aviso de WhatsApp («We'll write to you by WhatsApp
  at this number»), con `whatsapp_text_version` = la versión de ese texto. `marketing`: la casilla opcional de
  novedades (sin marcar por defecto). En el alta, además `terms_accepted: true` (la casilla obligatoria).
- `locale`: el idioma de la app del usuario (`es`, `en`, `fr`; otro → mensajes en inglés).
- `time_to_submit_ms`: desde que se abre la hoja o la pantalla. Con `source: "app"` no se penaliza enviar rápido, pero
  mandadlo igual.
- `message`: si en algún momento hay un campo libre.

## 5. Respuesta y qué enseñar (pantalla «Request sent»)

| Código | En la app |
|---|---|
| `201` / `200 duplicate` | Éxito, con el texto de `next` (abajo). |
| `400` | `{errors:{campo:'invalid'\|'required'}}`: marcar el campo. |
| `429` | «Try again in a few minutes.» |
| `403` / `503` / red | Error genérico y un modo de contacto alternativo (email de Enjoy). Reintento con la misma clave. |

`next = { channel: 'whatsapp' | 'email', eta: 'minutes' | 'today' | 'next_business_day', at?, booking_url? }`

- **No prometer lo que el CRM no va a hacer.** Construir el texto con `next`:
  - `whatsapp` + `minutes` → «Cristian will message you on WhatsApp in a few minutes.»
  - `whatsapp` + `next_business_day` → «… on WhatsApp tomorrow morning» (`at` = la hora exacta; fuera de 8-22 h sale a las 9).
  - `email` + `minutes` → «Cristian will email you in a few minutes.»
  - `today` → «Cristian will get back to you today.»
- `booking_url` → botón «Choose a time to talk». Si no viene, no hay botón.
- **Alta de prueba:** el CRM no manda nada automático, así que en esa pantalla no uséis `next`; vale el texto actual
  («Cristian will write to you in the first days»).
- **Antes de enviar** (cabecera de «Talk to Enjoy»): texto neutro («Cristian will get back to you soon»), no «today».
- El email automático sale como mucho uno al día por persona: si escribe dos veces el mismo día, `next` lo refleja.

## 6. Pruebas

- `"test": true` en todo lo que no sea la app de producción (desarrollo, TestFlight, cuentas de prueba): el CRM lo guarda
  en la pestaña *Pruebas*, **no envía nada** y responde igual que a un lead real.
- No probar con emails reales de clientes ni con desechables sin `test: true`.

## 7. Qué no hace falta

- Ni lista de orígenes (CORS) ni claves.
- Ningún consentimiento nuevo para WhatsApp: el aviso de la pantalla es el que vale. El texto del WhatsApp 1 ahora dice
  «la solicitud que nos enviaste sobre…» (sin «desde la web»); Cristian lo actualiza en Meta.
