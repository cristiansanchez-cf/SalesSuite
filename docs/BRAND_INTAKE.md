# Datos de marca de Enjoy: qué necesitamos y en qué formato

Documento para el **agente/equipo del proyecto Enjoy**. Todo se entrega en `tenants/enjoy/` de este repo, como commit o como archivos sueltos que se copian ahí. Con eso se ejecuta `npm run tenant:bootstrap -- tenants/enjoy` y Enjoy queda dado de alta con su marca real.

Comprobar antes de entregar:

```bash
npm install
npm run tenant:bootstrap -- tenants/enjoy --dry-run   # no necesita Supabase; valida todo y lista lo que falta
```

## 1. Identidad visual → `tenants/enjoy/tenant.json` → `theme_tokens`

Ya está prerrellenado con lo que se sabe (rosa `#ff27bb`, lima `#e1ff00`, fuente YWFTKul). **Confirmar o corregir** cada valor con el design system real (`src/styles/tokens.css` de EnjoyWeb y el bloque `:root` de la página `bodas`):

| Clave | Qué es | Formato |
|---|---|---|
| `colors.bg` / `surface` | Fondo principal / secundario | `#rrggbb` |
| `colors.text` / `muted` / `border` | Texto, texto suave, bordes | `#rrggbb` |
| `colors.primary` / `primary-contrast` | Color de marca y texto encima | `#rrggbb` |
| `colors.accent` / `accent-contrast` | Acento y texto encima | `#rrggbb` |
| `radius.card` / `radius.button` | Redondeos | `28px`, `999px`… |
| `font.display` / `font.sans` | `font-family` de titulares y texto | `'YWFTKul', ui-sans-serif, sans-serif` |
| `font.faces[]` | Fuentes propias | `{ "family": "YWFTKul", "src": "asset:fonts/YWFTKul.woff2", "weight": "400 900" }` |

> Solo se aceptan estas claves (lista blanca de seguridad). Si el design system de Enjoy usa otros tokens, indicad la correspondencia y la añadimos.

## 2. Archivos → `tenants/enjoy/assets/`

Detalle en [`tenants/enjoy/assets/README.md`](../tenants/enjoy/assets/README.md). Mínimo:
- `logo.svg`, `favicon.png`, `og.png` (1200×630, la imagen que sale al compartir por WhatsApp)
- `fonts/YWFTKul.woff2`. **Confirmad que la licencia permite uso web** en un dominio distinto de la web principal.

## 3. Datos comerciales → `tenant.json`

| Campo | Qué poner |
|---|---|
| `brand.contact.whatsapp` | Número comercial con prefijo, solo dígitos (`34600111222`). Es el botón principal del dossier |
| `brand.contact.email` / `phone` / `website` | Contacto comercial (opcionales) |
| `brand.legal` | Razón social para el pie (opcional) |
| `domains` | `pitch.enjoytheclub.es` (primario). Confirmad el subdominio con quien gestione el DNS |
| `admins` | Emails de quienes gestionarán la consola en Enjoy. Reciben la invitación |

## 4. Módulos (lo más importante) → `catalog` y código fuente

### 4.1 Contenido (`catalog[]` en `tenant.json`)
Los textos actuales son **provisionales**. Para cada módulo: `key` (identificador estable), `block_type`, `name` (lo que ve el comercial en el catálogo), `description`, `default_price` (sin IVA, o `null`) y `props` (contenido). Los campos de cada tipo de bloque están en `src/modules/<block_type>/schema.ts`, con un ejemplo mínimo en `src/modules/registry.ts`. Los textos admiten `{company}` y `{prospect}`, que se rellenan con el prospecto de cada dossier.

Tipos de bloque disponibles hoy: `hero-pitch`, `tabs-showcase`, `pricing-card`. Para cada servicio que Enjoy vende (bodas, locales, eventos de empresa…) conviene:
- textos reales: titular, subtítulo, beneficios y pestañas;
- precio de catálogo, si existe;
- imágenes (`"asset:img/…"`), si las hay.

### 4.2 Diseño real (código de EnjoyWeb)
Para que los módulos sean **la UI real de Enjoy** y no una aproximación, necesitamos el código fuente de EnjoyWeb (`WEB/ComingSoon`). Lo ideal es dar acceso de lectura al repo a esta sesión de Claude. Si no es posible, basta con estos archivos:

| Archivo | Para |
|---|---|
| `src/styles/tokens.css`, `src/styles/global.css`, `tailwind.config.mjs` | Tokens exactos |
| `src/styles/home.css` (bloques `nh-*`) | CSS de hero, tabs, marquee, testimonios, pasos, FAQ, CTA, comparativa |
| `src/pages/es/soluciones/locales/index.astro` | Markup y JS de los bloques (para hacerlos por instancia) |
| `src/pages/bodas/index.astro` | Bloque de tema `:root` |
| `src/components/{Icon,Button,Card,Container,Section}.astro` | Átomos |
| Imágenes/mockups usados en esos bloques | Assets de módulos |

Con eso se portan `hero-pitch` y `tabs-showcase` al diseño exacto, y se añaden `logo-marquee`, `testimonials`, `steps-howitworks` (y `faq`, `final-cta`, `compare-before-after`), siguiendo [`MODULE_AUTHORING.md`](./MODULE_AUTHORING.md).

## 5. Mapa de mercado → `market` en `tenant.json`

A quién vende Enjoy: **sectores** (bodas, ocio nocturno, conciertos, festivales…), cada uno con:
- cliente ideal, cuándo descartarlo, cómo compran, ticket y ciclo;
- qué módulos encajan (`modules`: `module_key`, prioridad 1–3, por qué);
- sus **actores** (`personas`): papel (`decisor` | `pagador` | `influenciador` | `campeon` | `usuario` | `guardian`), qué quieren, qué les duele, qué miden, objeciones típicas (taxonomía del Cerebro), cómo abordarles, qué evitar, cómo pueden ayudar o tumbarlo, y qué les aporta cada módulo (`angles`).

El de `tenant.json` es **ejemplo**: validad sectores y actores reales. Es lo que más ayuda a un comercial nuevo y lo que da contexto al Cerebro de Ventas.

## 6. Playbook de ventas → `playbook` en `tenant.json`

Cómo se vende cada módulo: pitch, para quién, preguntas, objeciones con respuesta, pruebas, precio/upsell, guiones y consejos. El de `tenant.json` es **contenido de ejemplo** escrito para la demo; sustituidlo por el real (formato y tipos en [`PLAYBOOK.md`](./PLAYBOOK.md)). Cada jugada lleva `key` estable, `module_key` (o `null` para general), `kind`, y opcionalmente `stage`/`objection` (taxonomía del Cerebro de Ventas) y `technique_refs` (fichas del Cerebro por id, título, creador y enlace; **sin copiar guiones literales**). Reimportar actualiza solo lo que cambió y deja versión con nota.

## 7. Checklist de entrega

- [ ] `theme_tokens` confirmados con el design system
- [ ] `assets/`: logo, favicon, og, fuente (+ licencia web confirmada)
- [ ] `brand.contact` (WhatsApp como mínimo) y `admins`
- [ ] `catalog` con textos y precios reales
- [ ] `market`: sectores y actores reales (quién decide, quién paga, quién puede tumbarlo)
- [ ] `playbook` con cómo se vende de verdad cada módulo (lo puede redactar el CEO/líder; luego se mantiene desde la consola)
- [ ] Código `nh-*` de EnjoyWeb (acceso al repo o archivos de §4.2)
- [ ] `npm run tenant:bootstrap -- tenants/enjoy --dry-run` termina sin errores
