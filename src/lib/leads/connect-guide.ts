/**
 * Lo que se le pasa a quien hace la web o la app (Leads entrantes → Conecta tu web): un prompt para un desarrollador o
 * un agente de IA y el código para pegar. Sale del contrato (contract.ts, docs/LEADS.md §1) con los datos del espacio,
 * para que no se quede viejo.
 */
import { FIELDS, LEAD_TYPES } from './contract';

export interface GuideInput { endpoint: string; brand: string; origins: string[]; locale: 'es' | 'en' }

const example = (brand: string, locale: string) => ({
  schema: 'enjoy.lead.v2',
  idempotency_key: '<uuid único por envío>',
  brand,
  type: 'general',
  test: true,
  contact: { name: 'Ana López', email: 'ana@empresa.com', phone: '+34600123123' },
  fields: { event_type: 'other' },
  message: '…',
  consent: { marketing: false, whatsapp_notice_shown: true, legal_text_version: '2026-11-01', policy_url: 'https://<tu-web>/privacidad' },
  context: { locale, page_url: 'https://<tu-web>/contacto', time_to_submit_ms: 12000 },
});

const typesList = () => LEAD_TYPES.map((t) => {
  const f = FIELDS[t];
  const fs = f.map((x) => `${x.key}${x.required ? '*' : ''}${x.values ? ` (${x.values.join(' | ')})` : ''}`).join(', ');
  return `  - ${t}${fs ? `: ${fs}` : ''}`;
}).join('\n');

export function connectPrompt(g: GuideInput): string {
  const body = JSON.stringify(example(g.brand, g.locale), null, 2);
  const origins = g.origins.length ? g.origins.join(', ') : g.locale === 'es' ? '(todavía ninguna)' : '(none yet)';
  if (g.locale === 'en') {
    return `Connect our website contact form (or our app) to our CRM.

Every time someone submits the form, send this request from the browser (or from the phone app), not from a server:

POST ${g.endpoint}
Content-Type: application/json

Body (example):
${body}

Rules:
- schema: always "enjoy.lead.v2". brand: always "${g.brand}".
- idempotency_key: a unique id per submission (crypto.randomUUID()); reuse the same one if you retry.
- contact.name and contact.email are required. contact.phone with its country prefix if you have it (+34…).
- type and fields: use the type that fits the form; * = required. If none fits, use "general" with fields.event_type "other".
${typesList()}
- message: the free text of the form, if there is one.
- consent.marketing: true only if they ticked the marketing box. consent.policy_url: link to our privacy policy. consent.legal_text_version: the date of our legal text. If the form tells them we will write by WhatsApp, consent.whatsapp_notice_shown: true.
- context.locale (es, en, fr…), context.page_url, context.time_to_submit_ms (ms from opening the form to sending it). If there are UTM parameters, put them in context.attribution.current (utm_source, utm_medium, utm_campaign…).
- From a phone app: the same, plus context.source: "app".
- While testing, send "test": true (or test from localhost): it is stored as a test and nothing is sent. Remove it when going live.

Responses: 201 created and 200 duplicate (both are success; the body has next.channel "email" or "whatsapp" to say "we will write to you by email/WhatsApp in a few minutes"), 400 validation errors in "errors", 403 the website is not in the allowed list, 429 too many submissions, 503 lead intake is paused.

Allowed websites right now: ${origins}. If the form lives at another address, tell us so we add it.`;
  }
  return `Conecta el formulario de contacto de nuestra web (o de nuestra app) con nuestro CRM.

Cada vez que alguien envíe el formulario, manda esta petición desde el navegador (o desde la app del móvil), no desde un servidor:

POST ${g.endpoint}
Content-Type: application/json

Cuerpo (ejemplo):
${body}

Reglas:
- schema: siempre "enjoy.lead.v2". brand: siempre "${g.brand}".
- idempotency_key: un identificador único por envío (crypto.randomUUID()); el mismo si reintentas.
- contact.name y contact.email son obligatorios. contact.phone con prefijo si lo tienes (+34…).
- type y fields: el tipo que encaje con el formulario; * = obligatorio. Si no encaja ninguno, "general" con fields.event_type "other".
${typesList()}
- message: el texto libre del formulario, si lo hay.
- consent.marketing: true solo si marcó la casilla de comunicaciones. consent.policy_url: el enlace a nuestra política de privacidad. consent.legal_text_version: la fecha de nuestro texto legal. Si el formulario avisa de que le escribiremos por WhatsApp, consent.whatsapp_notice_shown: true.
- context.locale (es, en, fr…), context.page_url y context.time_to_submit_ms (milisegundos desde que abre el formulario hasta que lo envía). Si hay UTM, van en context.attribution.current (utm_source, utm_medium, utm_campaign…).
- Desde una app del móvil: lo mismo, con context.source: "app".
- Mientras pruebas, manda "test": true (o prueba desde localhost): se guarda como prueba y no se envía nada. Quítalo al publicar.

Respuestas: 201 creado y 200 repetido (las dos son éxito; traen next.channel "email" o "whatsapp" para decir «te escribimos por email/WhatsApp en unos minutos»), 400 errores de validación en "errors", 403 la web no está en la lista permitida, 429 demasiados envíos, 503 la entrada de leads está en pausa.

Webs permitidas ahora: ${origins}. Si el formulario está en otra dirección, avísanos para añadirla.`;
}

/** El código para pegar: una función que manda el formulario. */
export function connectSnippet(g: Pick<GuideInput, 'endpoint' | 'brand'>): string {
  return `<script>
// Llama a enviarLead(form) al enviar el formulario (name, email, phone, message).
async function enviarLead(form) {
  const abierto = window.__leadFormOpenedAt || Date.now();
  const d = new FormData(form);
  const res = await fetch('${g.endpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema: 'enjoy.lead.v2',
      idempotency_key: crypto.randomUUID(),
      brand: '${g.brand}',
      type: 'general',
      // test: true,  // descomenta para probar: se guarda como prueba y no se envía nada
      contact: { name: d.get('name'), email: d.get('email'), phone: d.get('phone') || null },
      fields: { event_type: 'other' },
      message: d.get('message') || null,
      consent: { marketing: d.get('marketing') === 'on', policy_url: location.origin + '/privacidad' },
      context: { locale: document.documentElement.lang || 'es', page_url: location.href, time_to_submit_ms: Date.now() - abierto },
    }),
  });
  return res.ok; // 201 o 200: gracias. Si no, muestra un error.
}
window.__leadFormOpenedAt = Date.now();
</script>`;
}
