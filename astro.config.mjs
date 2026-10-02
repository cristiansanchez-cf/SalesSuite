// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';

// Target de despliegue: adapter Node standalone (portable: Vercel/Firebase App Hosting/
// Cloud Run/Fly). Cambiar el adapter no afecta al código de la app. Ver docs/ADR-0001.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind({ applyBaseStyles: false })],
  security: { checkOrigin: true },
});
