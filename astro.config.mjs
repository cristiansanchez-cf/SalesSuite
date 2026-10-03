// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import tailwind from '@astrojs/tailwind';
import svelte from '@astrojs/svelte';

/**
 * Adapter según dónde se construye (ver docs/SETUP.md §5):
 * - Vercel (recomendado): la variable VERCEL la pone Vercel en sus builds → @astrojs/vercel.
 * - Resto (Docker / Cloud Run / Fly / local): Node standalone → `node dist/server/entry.mjs`.
 * DEPLOY_TARGET=vercel|node fuerza uno u otro.
 */
const target = process.env.DEPLOY_TARGET ?? (process.env.VERCEL ? 'vercel' : 'node');

export default defineConfig({
  output: 'server',
  adapter: target === 'vercel' ? vercel() : node({ mode: 'standalone' }),
  integrations: [tailwind({ applyBaseStyles: false }), svelte()],
  // CSRF propio en src/middleware.ts (isSameOriginWrite): checkOrigin de Astro compara con el host
  // interno del servidor, no con el dominio del tenant, y rechazaría los formularios en producción.
  security: { checkOrigin: false },
});
