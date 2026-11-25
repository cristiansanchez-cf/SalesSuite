/**
 * Qué ha pasado con los WhatsApp del asistente (docs/ASSISTANT.md §Recordatorios). Meta acepta el envío al momento,
 * pero si luego no lo entrega lo dice por el webhook (statuses). Se guarda cada envío y su último estado para decirlo
 * en «Probarlo ahora» (Mi cuenta) y en el informe de recordatorios, con el motivo en palabras.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';

export type DeliveryKind = 'reminder' | 'team_lead';
export type DeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';
export interface Delivery { wamid: string; status: DeliveryStatus; error: string | null; at: string }
export interface DeliveryStore {
  track(x: { wamid: string; tenantId: string; userId: string; kind: DeliveryKind }): Promise<void>;
  /** Lo que dice el webhook. Solo de los envíos que se siguen; no se vuelve atrás (leído no pasa a entregado). */
  update(wamid: string, status: string, error: string | null): Promise<void>;
  last(userId: string, kind: DeliveryKind): Promise<Delivery | null>;
}

const RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
const MEM = Symbol.for('salessuite.waDelivery');
type G = typeof globalThis & { [MEM]?: Map<string, Delivery & { userId: string; kind: DeliveryKind }> };
const mem = () => ((globalThis as G)[MEM] ??= new Map());

export function demoDeliveryStore(): DeliveryStore {
  return {
    async track(x) { mem().set(x.wamid, { wamid: x.wamid, status: 'accepted', error: null, at: new Date().toISOString(), userId: x.userId, kind: x.kind }); },
    async update(wamid, status, error) {
      const d = mem().get(wamid);
      if (!d || !(status in RANK) || RANK[status] < RANK[d.status]) return;
      mem().set(wamid, { ...d, status: status as DeliveryStatus, error, at: new Date().toISOString() });
    },
    async last(userId, kind) {
      const all = [...mem().values()].filter((d) => d.userId === userId && d.kind === kind);
      const d = all.at(-1);
      return d ? { wamid: d.wamid, status: d.status, error: d.error, at: d.at } : null;
    },
  };
}

export async function deliveryStore(): Promise<DeliveryStore | null> {
  if (appMode() === 'demo') return demoDeliveryStore();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async track(x) {
      const r = await sb.from('wa_delivery').insert({ wamid: x.wamid, tenant_id: x.tenantId, user_id: x.userId, kind: x.kind });
      if (r.error) console.warn('[wa_delivery] track', r.error.message);
    },
    async update(wamid, status, error) {
      if (!(status in RANK)) return;
      // Sin retroceder: un estado más bajo no pisa a uno más alto (los avisos de Meta pueden llegar desordenados).
      const lower = Object.keys(RANK).filter((k) => RANK[k] <= RANK[status] && k !== status);
      const r = await sb.from('wa_delivery').update({ status, error, updated_at: new Date().toISOString() }).eq('wamid', wamid).in('status', [...lower, status]);
      if (r.error) console.warn('[wa_delivery] update', r.error.message);
    },
    async last(userId, kind) {
      const r = await sb.from('wa_delivery').select('wamid, status, error, updated_at').eq('user_id', userId).eq('kind', kind).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const x = r.data as { wamid: string; status: DeliveryStatus; error: string | null; updated_at: string } | null;
      return x ? { wamid: x.wamid, status: x.status, error: x.error, at: x.updated_at } : null;
    },
  };
}

/** El motivo de Meta en palabras (los códigos más comunes); si no lo conocemos, el texto de Meta tal cual. */
export function failureReason(error: string | null, locale = 'es'): string {
  const code = /\b(\d{6})\b/.exec(error ?? '')?.[1];
  const es: Record<string, string> = {
    '131042': 'falta un método de pago en la cuenta de WhatsApp del asistente (Meta → Configuración del negocio → Cuentas de WhatsApp → Configuración de pago)',
    '131026': 'ese número no puede recibirlo: ¿tiene WhatsApp y ha aceptado sus condiciones? Revisa el teléfono de Mi cuenta (con prefijo)',
    '131049': 'Meta lo ha frenado para no saturar a esa persona; vuelve a intentarlo mañana',
    '131047': 'han pasado más de 24 horas desde su último mensaje: hace falta una plantilla aprobada',
    '132000': 'el número de datos no cuadra con la plantilla aprobada en Meta',
    '132001': 'la plantilla no existe en ese idioma o aún no está aprobada en Meta',
    '132015': 'Meta ha pausado la plantilla por su calidad',
    '132016': 'Meta ha desactivado la plantilla',
    '133010': 'el número del asistente no está dado de alta (registrado) en la API de WhatsApp',
    '131056': 'demasiados mensajes seguidos a ese número; espera un poco',
    '130472': 'Meta no lo ha entregado en un experimento propio; vuelve a intentarlo',
  };
  const en: Record<string, string> = {
    '131042': 'the assistant WhatsApp account has no payment method (Meta → Business settings → WhatsApp accounts → Payment settings)',
    '131026': 'that number cannot receive it: does it have WhatsApp and has it accepted its terms? Check the phone in My account (with country code)',
    '132001': 'the template does not exist in that language or is not approved yet in Meta',
    '133010': 'the assistant number is not registered in the WhatsApp API',
  };
  const map = locale.startsWith('es') ? es : { ...es, ...en };
  return (code && map[code]) || (error ?? '').slice(0, 200) || (locale.startsWith('es') ? 'Meta no ha dicho por qué' : 'Meta did not say why');
}
