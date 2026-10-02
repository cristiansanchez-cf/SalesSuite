# Plan / Handoff: Constructor de Dossiers Dinámicos (White-Label Multi-Tenant)

> Este documento es a la vez el **plan** y la **guía de handoff** para el agente de arquitectura/implementación que construirá el MVP. Recoge los requisitos de negocio hablados con el fundador, el alcance del MVP, la arquitectura recomendada, el modelo de datos, el sistema de módulos (con código de ejemplo) y el plan de verificación.
>
> Las decisiones que este plan dejaba abiertas se cierran en [`ADR-0001-stack.md`](./ADR-0001-stack.md). El estado de implementación está en el [`README`](../README.md).

---

## 1. Contexto (por qué hacemos esto)

El fundador gestiona varias startups (**Enjoy the Club, Oquea, Trama, …**). Todas comparten el mismo problema en su red comercial: los vendedores necesitan **presentaciones siempre actualizadas** y **presupuestos rápidos** por cliente, sin depender de un diseñador ni de PDFs/Notion desactualizados.

Hoy el proceso comercial es doloroso:
- Las presentaciones son estáticas y envejecen (las startups cambian de funcionalidades muy rápido).
- Cambiar un precio o reordenar servicios obliga a reexportar / pedir a diseño.
- Un PDF no transmite el producto; una **UI animada e interactiva** sí.
- Un enlace vivo se abre más que un PDF adjunto.

**Visión:** un producto **white-label multi-tenant** donde un comercial, en 3 clics, compone un **dossier dinámico** por prospecto (elige módulos de servicio, los ordena, oculta los que no aplican, pone precio) y genera un **enlace vivo** servido bajo la marca de su empresa (`pitch.enjoytheclub.es`). La UI de cada servicio es **código** (animada, interactiva) heredado del propio design system de cada empresa, así que siempre está actualizada.

**Resultado buscado del MVP:** que **Enjoy the Club sea el primer caso de éxito** — un comercial crea un dossier de boda/local, lo publica y lo presenta desde un subdominio de Enjoy, con la marca de Enjoy, usando módulos de UI construidos con código (que aportaremos nosotros reutilizando el repo actual de Enjoy).

Fases posteriores (fuera del MVP, pero el diseño debe dejarlas preparadas): analítica de visionado, enlaces de pago/contrato ligados al precio, y un CRM completo con import (Notion/CSV), scraping y auto-registro por IA/MCP.

---

## 2. Alcance del MVP (confirmado)

**DENTRO del MVP:**
1. **Auth mínima** + consola de administración.
2. **CRUD de dossiers**: crear/editar/publicar/archivar.
3. **Builder de dossier**: elegir módulos del catálogo del tenant, **reordenar** (drag & drop), **ocultar**, y fijar **precio por dossier** (sin precio / total / por módulo, con overrides).
4. **Enlace vivo compartible** (tokenizado, SSR, temado, sin login).
5. **Catálogo mínimo de módulos** (4–6) refactorizados desde Enjoy.
6. **Enjoy como primer tenant** servido en su subdominio.

**FUERA del MVP** (son *seams* en el modelo de datos, no se construyen):
- Analítica de visionado (abierto/tiempo/scroll).
- Enlaces de pago + contrato ligados al precio.
- CRM (contactos, deals, owners, import Notion/CSV, scraping, IA/MCP).

---

## 3. Decisiones confirmadas (no revisar)

| Decisión | Valor |
|---|---|
| Alcance primer MVP | Solo dossiers dinámicos |
| Entrega white-label | **Subdominio por tenant** (`pitch.<dominio-tenant>`) |
| Repositorio | **Repo nuevo e independiente, asociado a Cofundo** (producto genérico multi-tenant; Enjoy = primer tenant) |
| Stack | **Abierto** — recomendación por defecto abajo; lo finaliza el agente de arquitectura |
| Proveedor de la UI de módulos | Nosotros (Claude), reutilizando el repo de Enjoy; se entregará como código a los demás agentes |

---

## 4. Arquitectura recomendada

### 4.1 Vista general

```
                    ┌──────────────────────────────────────────────┐
                    │  Base de datos relacional (Postgres) + Auth    │
                    │  tenant · domain · users · membership ·         │
                    │  module · module_version · dossier ·            │
                    │  dossier_item · share_link   (RLS por tenant)   │
                    └───────────────▲───────────────▲───────────────┘
                   authed (RLS)     │               │  RPC token-gated (render público)
        ┌───────────────────────────┴──┐      ┌─────┴───────────────────────────────┐
        │  CONSOLA ADMIN (Astro+islands)│      │  RENDERER DE DOSSIER (Astro SSR)      │
        │  /admin/*  login · builder     │      │  pitch.<tenant>/d/<token>             │
        │  elegir · reordenar · ocultar  │      │  resuelve tenant por Host header ·    │
        │  precio · generar enlace       │      │  carga items ordenados · fija versión·│
        └────────────────────────────────┘      │  inyecta tema · renderiza módulos     │
                                                 └───────────────▲───────────────────────┘
                                                                 │  block_type → componente
                                                 ┌───────────────┴───────────────────────┐
                                                 │  REGISTRY DE MÓDULOS (build-time)       │
                                                 │  hero-pitch · tabs-showcase · marquee · │
                                                 │  testimonials · steps · pricing-card    │
                                                 │  cada uno: .astro + schema.ts + client  │
                                                 └─────────────────────────────────────────┘
  Edge: SSR (Vercel o Firebase App Hosting o Cloudflare) + dominios/SSL por tenant
```

- **Un repo, dos superficies** en una sola app Astro: grupo de rutas `/admin/*` (consola autenticada) y el renderer público servido en subdominios de tenant (`/d/<token>`). Mantenerlos en el mismo proyecto Astro maximiza la reutilización del registry, tokens y componentes.
- **Resolución de tenant** en `src/middleware.ts`: lee el `Host` header → tabla `domain` → adjunta `{ tenant, theme_tokens }` a `Astro.locals`. Todo lo demás (scoping admin, tema del renderer) lo lee de ahí.

### 4.2 Recomendación de stack (por defecto, a confirmar por el agente de arquitectura)

**Recomendado: Astro SSR (`output: 'server'`) + Supabase (Postgres + Auth + Storage + RLS) + edge con dominios por tenant.**

Razón principal: **el valor del producto es que los módulos son la UI real de cada empresa, animada y siempre actual.** Astro permite reutilizar los componentes `.astro` y el CSS `nh-*` de Enjoy **1:1**. Next.js obligaría a portar todo a React (se tira el activo); Firestore es la forma equivocada para el end-state relacional (CRM).

| Criterio | Next.js + Supabase | Firebase (Firestore+App Hosting) | **Astro SSR + Supabase (recomendado)** |
|---|---|---|---|
| Reutilizar UI Astro de Enjoy | Malo (reescribir en React) | Regular | **Excelente** |
| CRM relacional futuro | Excelente (Postgres) | Malo (NoSQL) | **Excelente (Postgres)** |
| Analítica (alto volumen de escritura) | Bueno | Bueno (query vía BigQuery) | **Bueno** |
| Multi-tenant + RBAC | Excelente (RLS) | Regular | **Excelente (RLS)** |
| SSR del dossier | Excelente | Bueno | **Excelente (núcleo de Astro)** |
| Dominio por tenant | Bueno (Vercel) | Torpe | **Excelente (Cloudflare for SaaS / Vercel)** |
| Velocidad para equipo pequeño | Bueno | Fricción de datos a futuro | **Bueno (un solo lenguaje)** |

**Decisiones de despliegue que deja abiertas el agente de arquitectura:**
- **Target SSR**: Vercel (más rápido de arrancar) vs **Firebase App Hosting** (ya usáis Firebase; también corre Astro SSR) vs Cloudflare Pages/Workers (pareja natural con Cloudflare for SaaS, pero con restricciones de edge runtime). No bloquear el MVP por esto.
- **Dominios por tenant**: Cloudflare for SaaS (SSL por hostname a escala) o API de dominios de Vercel. Para arrancar ya: un wildcard `*.cofundo.app` + un CNAME desde el subdominio de Enjoy; la tabla `domain` mapea cualquiera de los dos hosts al tenant.
- **Framework de islas** para la interactividad del builder (drag&drop): elegir **uno** (Svelte o React/Solid) y no mezclar.

> La web actual de Enjoy sigue en Firebase Hosting intacta; este producto es repo/despliegue independiente. (Nota: en EnjoyWeb conviven dos proyectos Firebase `corporativeweb-b0ce4` vs `b2b-web-7c039` y no hay workflow de deploy a prod — **no copiar ese CI** al repo nuevo.)

---

## 5. Modelo de datos (núcleo)

Todas las tablas llevan `tenant_id` (salvo `users`) y están protegidas por RLS. Claves principales y *seams* para fases futuras:

- **tenant**: `id`, `slug`, `name`, `status`, `theme_tokens jsonb` (overrides de ~20 CSS vars + fuente), `default_locale`.
- **domain** *(tabla aparte → varios/custom domains sin tocar tenant)*: `id`, `tenant_id`, `hostname` (`pitch.enjoytheclub.es`), `is_primary`, `ssl_status`, `verification jsonb`.
- **users** *(1:1 con `auth.users`)*: `id`, `email`, `display_name`.
- **membership** *(join rol×tenant)*: `user_id`, `tenant_id`, `role (admin|rep)`, unique(user,tenant).
- **module** *(identidad de catálogo, por tenant)*: `id`, `tenant_id`, `key` (slug estable), `block_type` (clave del registry), `name`, `description`, `is_catalog`, unique(tenant,key).
- **module_version** *(payload versionado — seam de inmutabilidad)*: `id`, `module_id`, `version int`, `default_props jsonb`, `default_price numeric null`, `default_currency`, `status (draft|published|archived)`, unique(module,version).
- **dossier**: `id`, `tenant_id`, `author_id`, `title`, `prospect_name`, `prospect_company`, `prospect_meta jsonb` *(seam CRM → futuro `contact_id`)*, `status`, `locale`, `price_mode (none|total|per_module)`, `total_price null`, `currency`, `theme_override jsonb null` *(seam tema por dossier)*, timestamps.
- **dossier_item** *(lista ordenada y sobreescribible)*: `id`, `dossier_id`, `module_version_id` *(fija versión → el dossier no se rompe)*, `position numeric` *(rank fraccional → reorder barato)*, `visible bool`, `price_override null`, `prop_overrides jsonb`.
- **share_link** *(separado del dossier → rotar/revocar, varios enlaces, atribución de analítica futura)*: `id`, `dossier_id`, `token` (inadivinable), `is_active`, `expires_at null`, `password_hash null` *(futuro)*, timestamps.

**Seams para no sufrir migraciones en fases futuras:**
- **Analítica (F2):** nueva tabla `dossier_event(tenant_id, dossier_id, share_link_id, session_id, event_type, payload, created_at)` append-only, particionable, offload a ClickHouse/Tinybird. El FK `share_link_id` ya existe.
- **Pagos/contrato (F3):** el precio ya vive en dossier/item; añadir `offer(...)` o columnas nullable `payment_link_url`/`contract_url` en `dossier_item`. Puramente aditivo.
- **CRM (F4):** añadir `contact`/`deal`/`activity` + FK nullable `contact_id` en `dossier` y backfill desde `prospect_meta`. Sin reestructurar filas existentes.

---

## 6. Sistema de módulos (el núcleo técnico)

### 6.1 Definición de un módulo

Un módulo = tres ficheros co-ubicados en el renderer:

```
src/modules/<block_type>/
  Component.astro   # la UI animada; consume CSS vars: var(--primary), var(--radius-card)...
  schema.ts         # contrato Zod de props (reutiliza el patrón de content.config.mjs)
  client.ts         # JS por-INSTANCIA: export function init(root) { ... } (NO querySelector global)
```

Registry central:

```ts
// src/modules/registry.ts
export const REGISTRY = {
  'hero-pitch':        () => import('./hero-pitch/Component.astro'),
  'tabs-showcase':     () => import('./tabs-showcase/Component.astro'),
  'logo-marquee':      () => import('./logo-marquee/Component.astro'),
  'testimonials':      () => import('./testimonials/Component.astro'),
  'steps-howitworks':  () => import('./steps-howitworks/Component.astro'),
  'pricing-card':      () => import('./pricing-card/Component.astro'),
} as const;
export type BlockType = keyof typeof REGISTRY;
```

### 6.2 Cómo resuelve el renderer (pseudocódigo)

```astro
---
// src/pages/d/[token].astro  (SSR)
const { tenant } = Astro.locals;                 // de middleware por Host
const { dossier, items } = await loadByToken(Astro.params.token); // RPC token-gated
// items: ordenados por position, visible=true, con module_version + overrides
---
<ThemedShell tokens={{...tenant.theme_tokens, ...dossier.theme_override}}>
  {items.map(async (it) => {
    const Comp = (await REGISTRY[it.block_type]()).default;
    const props = resolveProps(it);              // default_props ⊕ prop_overrides ⊕ precio
    return <div data-item-id={it.id}><Comp {...props} /></div>;
  })}
</ThemedShell>
```

- **Props por dossier**: `module_version.default_props` ⊕ `dossier_item.prop_overrides` ⊕ precio resuelto (`price_override ?? default_price`, según `price_mode`), validado contra `schema.ts`.
- **Build-time, no runtime-fetched** para el MVP: SSR-safe, sin sandbox, rápido y seguro. Consecuencia: añadir un módulo = un deploy (aceptable para pocos tenants). Módulos subidos por el tenant en runtime se posponen (ejecución de código/sandbox).
- **Versionado**: `dossier_item` fija `module_version_id`. Editar un módulo crea una **nueva** `module_version`; los dossiers publicados conservan su versión. El admin ofrece "actualizar a la última versión" por item.

### 6.3 El refactor difícil: JS por instancia (riesgo #1)

Hoy el JS de Enjoy es **global de página** (p. ej. `document.querySelector('.nh-tabs')`, un único `data-active`, un solo timer de auto-advance). Un dossier puede contener **dos instancias de `tabs-showcase`**, así que cada módulo debe:
1. Renderizar dentro de un root con id único (`data-item-id`).
2. Exponer en `client.ts` un `init(root)` que consulte **solo dentro de `root`** y guarde estado/timers por instancia.
3. Inicializarse por instancia (script Astro por componente o directiva de isla).

Es la **mayor tarea de ingeniería del MVP**; hay que presupuestarla explícitamente porque condiciona la corrección de composición/reorden.

### 6.4 Inyección de tema (white-label) — patrón ya probado en Enjoy

El shell emite un `<style>` que fija los `theme_tokens` del tenant (⊕ `dossier.theme_override`) como CSS custom properties en el wrapper raíz, + el `@font-face`. **Mismo mecanismo que la página `bodas`** de Enjoy (bloque de override de `:root`). Los componentes no se tocan: re-skin por tenant con cero cambios de código.

### 6.5 Módulos de arranque (4–6) refactorizados desde Enjoy

Desde `src/styles/home.css` (familia `nh-*`):
- `hero-pitch` ← `nh-hero`
- `tabs-showcase` ← `nh-tabs` (+ mock animado `nh-kissmock`/`nh-sender`) — **módulo estrella animado**
- `logo-marquee` ← `nh-marquee`
- `testimonials` ← `nh-tcarousel`/`nh-testimonials`
- `steps-howitworks` ← `nh-steps`
- `pricing-card` ← **NUEVO** (greenfield; consume `price_mode`/precio). Stretch: `compare-before-after` ← `nh-compare`, `faq` ← `nh-faq`, `final-cta` ← `nh-cta`.

### 6.6 Receta para añadir un módulo nuevo (tenant dev con Claude/Codex)

Entregar un `MODULE_AUTHORING.md`: (1) copiar una carpeta starter; (2) pegar los estilos `nh-*` / design system del tenant; (3) definir props en `schema.ts`; (4) añadir una línea al registry; (5) insertar filas `module` + `module_version`. Los estilos pegados heredan el tema automáticamente porque referencian las CSS vars compartidas.

---

## 7. White-label + subdominios

- **Resolución**: petición a `pitch.enjoytheclub.es` → `middleware.ts` lee `Host` → lookup en `domain` → `tenant` + `theme_tokens` en `Astro.locals` → el renderer inyecta el tema.
- **DNS/SSL**: el tenant añade `CNAME pitch → plataforma`. Usar **Cloudflare for SaaS** (SSL automático por hostname) o la API de dominios de Vercel. MVP inmediato: wildcard `*.cofundo.app` + un CNAME desde el subdominio de Enjoy.
- **Onboarding de tenant**: insertar `tenant` (+`theme_tokens`) → `domain` → primer `membership` (admin) → seed del catálogo `module`/`module_version` → el tenant añade CNAME → la plataforma provisiona el cert.

---

## 8. Auth & acceso (mínimo MVP)

- **Supabase Auth** (magic-link o email+password) solo para la consola admin.
- **Scoping + RBAC** vía `membership(user_id, tenant_id, role)`. En MVP, normalmente un tenant por usuario.
- **RLS**: cada fila con `tenant_id` legible/escribible solo si `auth.uid()` tiene `membership` en ese tenant. `rep` → CRUD de sus dossiers; `admin` → gestiona módulos, todos los dossiers, miembros.
- **Renderer público sin auth**: lee vía un RPC `security definer` (o endpoint server con service-role) que recibe el `share_link.token`, valida `is_active`/`expires_at` y `dossier.status='published'`, y devuelve solo campos seguros para render. **Única ruta que salta RLS** — revisarla con cuidado.

---

## 9. Renderer del enlace compartible

- **URL**: `https://pitch.enjoytheclub.es/d/<token>` (token inadivinable).
- **SSR, temado, sin login.** `output:'server'`; tema desde `Astro.locals.tenant`.
- **Gates**: solo `status='published'` + `share_link` activo y no expirado; si no, **404** (no filtrar existencia).
- **Vivo, no PDF**: módulos animados en cliente; JS por instancia (§6.3). Apto para tablet (los bloques de Enjoy ya son responsive/mobile-first).
- **Render de precio** según `price_mode` (`none` oculta; `per_module` por item; `total` una cifra).

---

## 10. Mapa de reutilización (desde el repo de Enjoy)

Repo substrato: `…/Enjoy/Repos/EnjoyWeb/WEB/ComingSoon`

**Reutilizar directamente:**
- Tokens CSS-var — `src/styles/tokens.css`, `src/styles/global.css` (el *seam* white-label).
- Mapeo var→Tailwind — `tailwind.config.mjs` (descartar el duplicado obsoleto `tailwind.config.js`).
- CSS de bloques `nh-*` — `src/styles/home.css` (refactorizar en módulos).
- Átomos + shell — `src/components/{Icon,Button,Card,Container,Section,Prose}.astro`, `src/layouts/BaseLayout.astro`.
- Patrón Zod + i18n — `src/content.config.mjs`, `src/i18n/routes.ts` (base para schemas de props + locale del dossier).
- **Plantilla de tema** — `src/pages/bodas/index.astro` (bloque de override `:root` = mecanismo exacto de tema por tenant).
- Markup fuente + JS a re-escopar — `src/pages/es/soluciones/locales/index.astro`.

**Construir de cero:** esquema Supabase/RLS/Auth, middleware tenant+domain, consola admin + builder dnd, registry + contratos de props, **JS por instancia**, modelo de precios + `pricing-card`, sistema de share-link, renderer SSR con token-gating.

---

## 11. Roadmap por fases

**Fase 0 — Fundación**
1. Repo nuevo (Cofundo): scaffold Astro SSR (`output:'server'`, adapter), Tailwind 3 con el mapeo `var(--…)`.
2. Portar tokens + átomos (`Icon/Button/Card/Container/Section`) + shell SEO.
3. Refactorizar 4–6 bloques `nh-*` en módulos escopados (+ fix de JS por instancia) y el registry.
4. Proyecto Supabase: esquema + RLS + Auth. `middleware.ts` de resolución de tenant.

**Fase 1 — MVP (ajustado)**
5. Consola admin: CRUD de dossier, picker de módulos, reorder dnd, ocultar, precio (`none|total|per_module` + overrides), generar/revocar share-link.
6. Renderer público SSR en `pitch.enjoytheclub.es`.
7. Seed de Enjoy como primer tenant: `theme_tokens`, mapeo de dominio, usuario admin, catálogo de módulos publicado.

**Fase 2 — Analítica:** tabla `dossier_event` + script de captura (open/tiempo/scroll) + dashboard.
**Fase 3 — Pagos/contrato:** `offer`/columnas nullable ligadas al precio; CTA en el renderer.
**Fase 4 — CRM + MCP/IA:** `contact`/`deal`/`activity`, import Notion/CSV, backfill `contact_id`, auto-registro MCP/IA. *(Posible integración con **AIBrains** — las "fichas" de técnicas de venta por MCP — para asistencia IA al comercial. Producto aparte; integración opcional, no MVP.)*

---

## 12. Riesgos y preguntas abiertas (para el agente de implementación)

1. **JS por instancia** es el riesgo top — los IIFE actuales son globales de página. Presupuestar tiempo real.
2. **Target de despliegue** (Vercel vs Firebase App Hosting vs Cloudflare) afecta a dominios custom y edge runtime. Decidir antes de cablear Cloudflare for SaaS.
3. **Framework de islas** del builder — elegir uno (Svelte/React/Solid).
4. **Corrección de RLS + el RPC de bypass del renderer** — crítico de seguridad; revisar la única ruta service-role.
5. **i18n del dossier** — ¿trilingüe o `locale` por dossier basta? (Recomendado: locale por dossier en MVP.)
6. **Almacenamiento de assets** — imágenes/logos del tenant en Supabase Storage, scoped por tenant.
7. **Gobernanza de módulos** — build-time = deploy por módulo nuevo; ¿quién puede crearlos (dev del tenant vs plataforma)?
8. **Orden** — rank fraccional (estilo LexoRank) recomendado, para no renumerar al reordenar.
9. **Semántica de precio** — moneda, impuestos, y si `per_module` suma a un total mostrado.

---

## 13. Plan de verificación end-to-end (MVP)

1. **Seed**: tenant Enjoy + `theme_tokens` + `domain` (`pitch.enjoytheclub.es` o wildcard) + usuario admin + 4–6 `module_version` publicadas.
2. **Login** en `/admin` como `rep`.
3. **Crear** dossier para "Sala X": elegir 4 módulos, **arrastrar** el #3 arriba, **ocultar** uno, `price_mode=per_module` con un `price_override`.
4. **Publicar** → generar enlace.
5. **Abrir** el enlace en el subdominio de Enjoy (navegador + tablet): orden correcto, módulo oculto ausente, precios correctos, **tema de Enjoy aplicado** (rosa `#ff27bb` / lima `#e1ff00`, fuente YWFTKul), animaciones corriendo (tabs auto-advance), **sin login**.
6. **Negativo**: dossier no publicado y enlace revocado → 404; usuario de otro tenant no ve el dossier en admin (RLS).
7. **Multi-instancia**: dossier con dos módulos animados → animan independientemente (prueba del escopado).
8. **Prueba de re-tema**: segundo tenant de prueba (otros `theme_tokens`) sobre los mismos módulos → re-skin sin tocar código (confirmación white-label estilo bodas).

---

## 14. Handoff — cómo continúa esto

- Este plan es la **guía de negocio + MVP + arquitectura** para el agente de arquitectura/implementación. Ese agente **finaliza el stack** (recomendado: Astro SSR + Supabase + edge con dominios por tenant) y el target de despliegue.
- **Nosotros (Claude) somos proveedores del código de la UI de módulos**: a partir del repo de Enjoy, entregaremos los 4–6 módulos de arranque (`Component.astro` + `schema.ts` + `client.ts`) y el `MODULE_AUTHORING.md`, para que Enjoy sea el **primer caso de UI con código** en la app white-label.
- **Repo**: nuevo, independiente, asociado a Cofundo; Enjoy = primer tenant servido en subdominio.
- Siguiente paso tras aprobar este plan: arrancar **Fase 0** (scaffold del repo + portado de tokens + primer módulo `hero-pitch` escopado como prueba del patrón), y en paralelo preparar el esquema Supabase + RLS.
