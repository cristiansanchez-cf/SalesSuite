# Cómo añadir un módulo

Un módulo = carpeta `src/modules/<block_type>/` con 3 ficheros + 1 línea en el registry + filas en BD.

```
src/modules/<block_type>/
  Component.astro   # UI. Solo consume tokens: bg-primary, text-muted, rounded-card, font-display, var(--color-…)
  schema.ts         # Zod: contrato de props (con .default() para lo opcional)
  client.ts         # (opcional) export function init(root: HTMLElement) { …; return cleanup }
```

## 1. Copia un starter
`hero-pitch` (estático + animación ligera) o `tabs-showcase` (interactivo con timers).

## 2. Pega el markup/estilos del design system del tenant
- Sustituye colores/radios/fuentes literales por tokens (`rgb(var(--color-primary))`, `var(--radius-card)`, clases Tailwind `bg-primary`, `rounded-card`…). Así hereda el tema de cualquier tenant.
- Estilos en `<style>` del componente (Astro los escopa) — **no** CSS global.
- Textos que admiten personalización: pásalos por `interpolate()` (`{prospect}`, `{company}`).

## 3. Contrato de props (`schema.ts`)
- Todo lo que el comercial/admin puede cambiar es prop. Límites de longitud siempre.
- URLs: valida esquema (ver `hero-pitch/schema.ts`). Nunca `set:html` con props.
- Exporta `type XProps = z.infer<typeof xSchema>` y úsalo en `Component.astro` junto a `ModuleBaseProps` (`ctx`: `itemId`, `locale`, `prospectName`, `price`, `total`, …).

## 4. JS por instancia (obligatorio si hay JS)
El mismo módulo puede aparecer **N veces** en un dossier.

```ts
// client.ts
export function init(root: HTMLElement) {
  const tabs = root.querySelectorAll('[role=tab]');   // ✅ solo dentro de root
  // document.querySelector('.nh-tabs')                // ❌ global
  let timer: ReturnType<typeof setTimeout>;            // ✅ estado en el closure
  return () => clearTimeout(timer);                    // ✅ cleanup
}
```

```astro
<!-- Component.astro -->
<div data-module="mi-modulo">…</div>
<script>
  import { mountAll } from '../runtime';
  import { init } from './client';
  mountAll('mi-modulo', init);   // Astro ejecuta este script 1 vez; mountAll inicializa cada root 1 vez
</script>
```

- IDs de DOM (aria-controls, etc.): derívalos de `ctx.itemId`.
- Pausa timers fuera de pantalla con `onVisibility` y respeta `prefersReducedMotion()`.

## 5. Registry
```ts
// src/modules/registry.ts
'mi-modulo': { schema: miModuloSchema, load: () => import('./mi-modulo/Component.astro') },
```

## 6. Catálogo del tenant (BD)
```sql
insert into public.module (tenant_id, key, block_type, name)
values ('<tenant>', 'mi-modulo-bodas', 'mi-modulo', 'Mi módulo · Bodas') returning id;
insert into public.module_version (module_id, version, default_props, default_price, status)
values ('<module_id>', 1, '{"title": "…"}', 450, 'published');
```
Para cambiar contenido de un módulo publicado: **nueva** `module_version` (las publicadas son inmutables).
En desarrollo, añade lo mismo a `supabase/seed/fixtures.json` y ejecuta `npm run db:seed:build`.

## 7. Checklist
- [ ] `npm run check && npm test && npm run build`
- [ ] Dos instancias en un dossier demo funcionan independientes (`scripts/smoke-e2e.cjs`)
- [ ] Se ve bien con el tema `retheme-test` (http://retheme.localhost:4321/d/demo-retheme-Hx8v)
- [ ] Móvil/tablet (los módulos son mobile-first)
