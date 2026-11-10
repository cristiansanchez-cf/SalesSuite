import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { localizeError } from '~/lib/i18n/errors';
import { claudeTranslator, fixtureTranslator } from '~/lib/i18n/translate';
import { demoUgcStore, foreignTexts, supabaseUgcStore, translateTexts, UGC_MODEL, ugcSystem } from '~/lib/i18n/ugc';

/**
 * Traducir lo que escribe el equipo (docs/I18N.md §Lo que escribe el equipo). Al abrir una página, el navegador manda
 * los textos del equipo que están en otro idioma y recibe los ya traducidos (sin IA). Con `translate: true` (el botón
 * «Traducir»), se traduce lo que falta, se guarda y se devuelve.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const locale = locals.locale ?? 'es';
  const body = (await request.json().catch(() => ({}))) as { texts?: unknown; translate?: unknown };
  const texts = foreignTexts(body.texts, locale);
  if (!texts.length) return Response.json({ translations: {} });
  const tenantId = admin.session.tenantId;
  const demo = appMode() === 'demo' || !admin.supabase;
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const store = demo ? demoUgcStore() : supabaseUgcStore(admin.supabase!, key ? createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null);
  let translator = null;
  if (body.translate === true) {
    const apiKey = env('ANTHROPIC_API_KEY');
    translator = apiKey
      ? claudeTranslator(apiKey, { company: locals.tenant?.name ?? '', glossary: [], model: UGC_MODEL, system: ugcSystem(locals.tenant?.name ?? ''), use: 'i18n.team' })
      : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureTranslator() : null;
    if (!translator) return Response.json({ error: localizeError('Falta ANTHROPIC_API_KEY en el servidor', locale) }, { status: 503 });
    if (!demo && !key) return Response.json({ error: localizeError('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor', locale) }, { status: 503 });
  }
  try {
    const translations = await translateTexts(store, tenantId, locale, texts, translator);
    return Response.json({ translations }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.warn('[translate]', e instanceof Error ? e.message : e);
    return Response.json({ error: localizeError('La IA no ha respondido; prueba en un momento', locale) }, { status: 503 });
  }
};
