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

## Caso: `live-screen` (Pantalla en vivo de Enjoy)

La pantalla real del local, interactiva, para enseñarla en la tablet: botonera de estados (Reclamo, Canción, Foto, Dedicatoria, Encima de tus visuales…; sin tramos de pago ni importes) con una frase de qué vende cada uno, el móvil pequeño que escanea el QR abajo a la derecha antes de cada petición y un recorrido solo (▶︎) que se para en cuanto el vendedor toca una pantalla.

- `engine.js` / `engine.css` son el motor del kit de Enjoy (`enjoy-screen-ui-kit.html`) **casi verbatim**. Únicos cambios: variables con prefijo `--es-` (las del dossier, `--color-*`, son tripletas RGB) y la rotación del reclamo se limpia en `destroy`. Por eso es la excepción a «no CSS global»: todo va bajo clases `es-*`.
- No tocar (decisiones de producto, ver el BRIEF del kit): unidades `cqw/cqh/cqmin`, fotos `contain` y carátulas `cover`, la paleta, el QR siempre en la misma esquina, el chip «GRATIS» pequeño.
- La configuración viaja en `<script type="application/json">` con `<` escapado (otra excepción acotada a `set:html`: es JSON, nunca HTML).
- Assets (QR real, fotos del público, capturas del móvil) son props: los del espacio. Sin carátulas, el cliente dibuja un vinilo de color.
- La pantalla **solo muestra**: no cobra ni gestiona la cola. No venderla como si lo hiciera.
- Sin importes: la propuesta nunca enseña tramos de pago (nada de «Platino 100 €»: asusta al cliente). `client.ts` fuerza `amount: 0`.
- `venueVideo` ({webm, mp4, poster}): visuales de ejemplo para el modo transparente cuando no hay vídeo del cliente.

## Caso: `app-steps` y `center-console` (Oquea)

- `app-steps` es la diapositiva de la guía de inicio de Oquea: el paso a la izquierda (chip con número, titular con
  `highlight` en el color de la marca, tarjetas con icono, aviso `check | info | bulb`) y 1–2 móviles a la derecha.
  `Screen.astro` recrea 16 pantallas de la app en HTML (`access`, `qr-activity`, `dive-saved`, `share-card`, `logbook`,
  `diver-profile`, `activities`, `create-activity`, `center-qr`, `crm-list`, `crm-diver`, `my-centres`, `team`,
  `dive-sites`) o enseña una captura (`image` + `src`). La app es clara siempre: blanco y grises fijos; el azul y el
  acento salen del tema. Usa el nombre, el logo y la primera foto del cliente. `tone: dark` = portada o cierre.
- `center-console` es la consola de escritorio (lateral 264, contenido 1180 × 640, tarjetas con borde y sin sombra).
  Vistas `today`, `activity`, `crm`, `centre`, cada una con su frase (`says`). `client.ts` la escala al hueco y la pasa
  sola hasta el primer toque; en móvil se dibuja en «compacto» (720 sin lateral), como la app por debajo de 1024.
  Las cifras son de ejemplo y lo dice en pantalla (`exampleLabel`).
- `[data-module]` es un envoltorio: la presentación lo pone en columna flexible, así que la rejilla va dentro.
- Variables CSS con prefijo propio (`--st-*`, `--ap*`, `--cp*`): `--p` a secas choca con otra del dossier.

## Caso: `site-verify` (SciScreen)

Material de partida: el kit del sello de SciScreen (12 nov 2026; `tenants/sciscreen/assets/seal/kit/`).

- Su web de verdad (`ctx.media.site`, de Personalizar → Su web) en un navegador redondeado, con la dirección en la barra.
  Sin captura, una página de ejemplo con su nombre y `fallback.claims`.
- **«Simulación» siempre**, en la esquina de su web (y encima de la página del sello). No se puede quitar: enseñar un
  sello en una marca que aún no está verificada sin decirlo sería una afirmación falsa.
- **El sello real** (`src/modules/SciSeal.astro`, el mismo marcado y medidas que el que se instala; «Verificado a día» y
  la fecha de hoy): compacto, placa o tarjeta; claro u oscuro según lo que haya debajo. `seals` (1–3) con su esquina de
  arriba a la izquierda en % de la captura; miden lo que medirían instalados (`--k` = ancho de la captura / 1440, como
  poco 0,45 en el móvil para que se lea). `press`: cuál pulsa el cursor.
- **Al pulsarlo se abre sciscreen.com**, no un panel de la marca: en pantalla grande la barra del navegador pasa a
  `sciscreen.com/es/sello/<id>` (un id con forma real, el mismo para la misma propuesta) y se abre la página pública del
  sello con su diseño: marca, estado («Vigente · Revisado el…»), URL verificada, fecha del dictamen, «Vigente hasta» y
  las afirmaciones publicadas, cada una con **su** evidencia y sus estudios (no hay un nivel de evidencia global). «←»
  vuelve a su web. En el móvil la página del sello sale debajo, con su propia barra.
- La escena (una vez, al verse la diapositiva): aparece el sello → el cursor va, lo pulsa → se abre sciscreen.com → baja
  a las afirmaciones, con una frase en cada momento (`captions`). El sello se pulsa también a mano; «Volver a verlo».
  Sin animaciones (`prefers-reduced-motion`): la página del sello, abierta.
- Textos: el sello certifica que **las afirmaciones de esa página** se han revisado contra la literatura científica;
  nunca el producto ni la marca.
- En pantalla grande el ancho sale del alto de la ventana, para que todo quepa sin bajar.
- Demo: espacio `sciscreen-demo` (`sciscreen.localhost`), propuesta `/d/demo-sciscreen-Vv7p#3` para una marca inventada.
  Pruebas: `scripts/smoke-site.cjs`.
