/**
 * La cualificación dicha en palabras (docs/ASSISTANT.md §Cualificar): «Pantallas: Sí», y las preguntas que faltan con
 * sus opciones, para Apuntar y para el asistente de WhatsApp («A Marquee le faltan: ¿Hay fiesta? (Es su negocio /
 * Algunas noches / No)…»). Mismas palabras que la tarjeta de cualificación de la ficha.
 */
import { DJ, FORMATS, OPTIONS, PARTY, SIZES, kindOfFormats, formatsOf, type Qualification } from './priority';
import { DJ_OPTIONS, PROMOTER_OPTIONS, STYLES } from './profiles';
import type { Profile } from '../accounts/types';
import { priorityMessages } from '../i18n/messages/priority';
import { profilesMessages } from '../i18n/messages/profiles';
import type { Locale } from '../i18n/core';
import type { QualPack } from './pack';
import { CHANNEL_SEGMENTS, CLIENT_SEGMENTS, DIVE_MULTI, INSTRUCTOR_QUESTIONS, questionsFor, segmentOf } from './diving';
import { divingMessages } from '../i18n/messages/diving';

/** Buceo (§47): «Reserva online: No se puede reservar», «¿Qué es?: Centro de buceo». */
function diveLabeler(locale: Locale) {
  const D = divingMessages[locale] ?? divingMessages.es;
  const strip = (s: string) => s.replace(/^¿|\?$/g, '');
  return (k: string, v: string): string => {
    if (k === 'dv_segment') return `${strip(D.segment)}: ${D.segments[v] ?? v}`;
    const q = D.q[k];
    return q ? `${strip(q[0])}: ${v.split(',').map((x) => q[1][x.trim()] ?? x).join(', ')}` : `${k}: ${v}`;
  };
}
/** Buceo: las que faltan. Sin segmento, primero «¿Qué es?»; luego las de su segmento, de más a menos puntos. */
function diveQuestions(profile: Profile, v: Record<string, unknown>, locale: Locale, max: number): QualQuestion[] {
  const D = divingMessages[locale] ?? divingMessages.es;
  const has = (k: string) => v[k] != null && v[k] !== '' && !(Array.isArray(v[k]) && (v[k] as unknown[]).length === 0);
  const toQ = (k: string): QualQuestion => ({ field: k, question: D.q[k]?.[0] ?? k, options: Object.entries(D.q[k]?.[1] ?? {}).map(([o, label]) => ({ v: o, label })) });
  if (profile === 'dj') {
    const order = ['dv_seller', 'dv_reach', 'dv_level', 'dv_owns', 'dv_specialty', 'dv_agencies'];
    return order.filter((k) => INSTRUCTOR_QUESTIONS.some((x) => x.key === k) && !has(k)).map(toQ).slice(0, max);
  }
  const seg = segmentOf(v);
  if (!seg) {
    const segs = profile === 'promoter' ? CHANNEL_SEGMENTS : CLIENT_SEGMENTS;
    return [{ field: 'dv_segment', question: D.segment, options: segs.map((x) => ({ v: x, label: D.segments[x]! })) }];
  }
  const best = (x: { options: Readonly<Record<string, number>> }) => Math.max(...Object.values(x.options));
  return questionsFor(seg).filter((x) => x.block !== 'adj' && !DIVE_MULTI.includes(x.key) && !has(x.key))
    .sort((a, b) => best(b) - best(a)).map((x) => toQ(x.key)).slice(0, max);
}

/** «Pantallas: Sí», «Noches a la semana: 4 o más», «Sin cobertura móvil». */
export function qualLabeler(locale: Locale, pack?: QualPack | null) {
  if (pack === 'diving') return diveLabeler(locale);
  const PR = priorityMessages[locale] ?? priorityMessages.es;
  const PRF = profilesMessages[locale] ?? profilesMessages.es;
  const strip = (s: string) => s.replace(/^¿|\?$/g, '');
  return (k: string, v: string): string => {
    const o = PR.options as Record<string, Record<string, string>>;
    if (k === 'kind') return `${PR.kind}: ${(PR.kinds as Record<string, string>)[v] ?? v}`;
    if (k === 'format') return `${PR.format}: ${v.split(',').map((x) => (PR.formats as Record<string, string>)[x] ?? x).join(' + ')}`;
    if (k === 'party') return `${strip(PR.party)}: ${(PR.parties as Record<string, string>)[v] ?? v}`;
    if (k === 'dj') return `${PR.dj}: ${(PR.djs as Record<string, string>)[v] ?? v}`;
    if (k === 'promoters') return `${strip(PR.promoters)}: ${v === 'yes' ? PR.promotersYes : PR.promotersNo}`;
    if (k === 'screens') return `${PR.screensQ}: ${(PR.options.screens as Record<string, string>)[v] ?? v}`;
    if (k in PRF.q) { const [l, oo] = (PRF.q as unknown as Record<string, [string, Record<string, string>]>)[k]; return `${strip(l)}: ${oo[v] ?? v}`; }
    if (k === 'pstyle' || k === 'dstyle') return `${PRF.style}: ${v.split(',').map((x) => (PRF.styles as Record<string, string>)[x] ?? x).join(', ')}`;
    if (k === 'size') return `${PR.size}: ${(PR.sizes as Record<string, string>)[v] ?? v}`;
    if (k === 'nights') return `${PR.hints.recurrence.venue}: ${o.nights[v] ?? v}`;
    if (k === 'events') return `${PR.hints.recurrence.promoter}: ${o.events[v] ?? v}`;
    if (k === 'recurring') return `${PR.hints.recurrence.concert} ${o.recurring[v] ?? v}`;
    if (k in PR.kills && v === 'true') return (PR.kills as Record<string, string>)[k];
    return `${(PR.criteria as Record<string, string>)[k] ?? k}: ${o[k]?.[v] ?? v}`;
  };
}

export interface QualQuestion { field: string; question: string; options: Array<{ v: string; label: string }> }

/**
 * Las preguntas que faltan, en orden de lo que más pesa, de la ficha de su tipo (local, promotora o DJ). Solo las que
 * no tienen respuesta. Como mucho `max`.
 */
export function qualQuestions(profile: Profile, q: Qualification | Record<string, unknown>, locale: Locale, max = 4, pack?: QualPack | null): QualQuestion[] {
  if (pack === 'diving') return diveQuestions(profile, (q ?? {}) as Record<string, unknown>, locale, max);
  const PR = priorityMessages[locale] ?? priorityMessages.es;
  const PRF = profilesMessages[locale] ?? profilesMessages.es;
  const v = (q ?? {}) as Record<string, unknown>;
  const has = (k: string) => v[k] != null && !(Array.isArray(v[k]) && (v[k] as unknown[]).length === 0) && v[k] !== '';
  const opts = (rec: Record<string, string>, keys: readonly string[]) => keys.map((k) => ({ v: k, label: rec[k] ?? k }));
  const prof = (k: string): QualQuestion => {
    const [l, o] = (PRF.q as unknown as Record<string, [string, Record<string, string>]>)[k];
    return { field: k, question: l, options: opts(o, Object.keys(o)) };
  };
  const style = (k: string): QualQuestion => ({ field: k, question: PRF.style, options: opts(PRF.styles as Record<string, string>, STYLES) });
  let list: QualQuestion[];
  if (profile === 'promoter') {
    list = (['pdyn', 'pevents', 'pstyle', 'pcontent', 'pagent'] as const).filter((k) => k in PROMOTER_OPTIONS || k === 'pstyle').map((k) => (k === 'pstyle' ? style(k) : prof(k)));
  } else if (profile === 'dj') {
    list = (['dres', 'dfollow', 'dgrow', 'dstyle'] as const).filter((k) => k in DJ_OPTIONS || k === 'dstyle').map((k) => (k === 'dstyle' ? style(k) : prof(k)));
  } else {
    // Local: lo que cambia cómo se mide (formato) y lo que más puntúa; la recurrencia según lo que es.
    const kind = kindOfFormats(formatsOf(v as Qualification)) ?? 'venue';
    const rec = kind === 'promoter' ? 'events' : kind === 'concert' ? 'recurring' : 'nights';
    const o = PR.options as Record<string, Record<string, string>>;
    list = [
      { field: 'format', question: PR.format, options: opts(PR.formats as Record<string, string>, FORMATS) },
      { field: 'party', question: PR.party, options: opts(PR.parties as Record<string, string>, PARTY) },
      { field: rec, question: PR.hints.recurrence[kind], options: opts(o[rec]!, Object.keys(OPTIONS[rec])) },
      { field: 'size', question: PR.size, options: opts(PR.sizes as Record<string, string>, SIZES) },
      { field: 'screens', question: PR.screensQ, options: opts(o.screens!, Object.keys(OPTIONS.screens)) },
      { field: 'dj', question: PR.dj, options: opts(PR.djs as Record<string, string>, DJ) },
      { field: 'decider', question: PR.criteria.decider, options: opts(o.decider!, Object.keys(OPTIONS.decider)) },
      { field: 'dynamics', question: PR.criteria.dynamics, options: opts(o.dynamics!, Object.keys(OPTIONS.dynamics)) },
    ];
  }
  return list.filter((x) => !has(x.field)).slice(0, max);
}
