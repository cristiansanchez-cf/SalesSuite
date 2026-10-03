# ADR-0001 · Stack y decisiones abiertas del plan

Estado: **aceptado (Fase 0)** · Fecha: 2026-10-02 · Contexto: [`PLAN.md`](./PLAN.md) §4.2 y §12.

## Decisión

| Tema | Decisión | Por qué |
|---|---|---|
| Framework | **Astro 5 SSR** (`output: 'server'`) | Reutiliza 1:1 los `.astro` + CSS `nh-*` de Enjoy; el valor del producto es esa UI. |
| Datos/Auth | **Supabase** (Postgres + Auth + Storage + RLS) | Relacional para el CRM futuro; RLS por tenant. |
| Adapter | **`@astrojs/node` standalone** | Portable (Cloud Run / Firebase App Hosting / Fly / Render). Cambiar a `@astrojs/vercel` son 2 líneas en `astro.config.mjs`; ningún código de la app depende del adapter. |
| Target de despliegue recomendado | **Vercel** para el MVP (dominios por API, SSL automático); migrar a Cloudflare for SaaS si hay >~20 tenants con dominio propio. | No bloquear el MVP. El middleware ya soporta `X-Forwarded-Host` (`TRUST_FORWARDED_HOST=1`). |
| Dominios MVP | wildcard `*.cofundo.app` + CNAME `pitch.enjoytheclub.es`; ambos en la tabla `domain`. | Ya modelado (varios hosts por tenant). |
| Islas del builder (Fase 1) | **Svelte 5** (`@astrojs/svelte`), sin mezclar frameworks. | Bundle pequeño, encaja con el estilo Astro, dnd sencillo. |
| Camino público | El renderer usa la **clave anon** y solo 2 RPC `security definer` (`resolve_tenant`, `get_public_dossier`). **Sin service-role** en el camino público. | Superficie mínima de bypass de RLS (riesgo #4). |
| Orden | `dossier_item.position numeric` con rank fraccional (`src/lib/rank.ts`) + rebalanceo cuando los huecos < 1e-6. | Reordenar = 1 UPDATE. |
| i18n | **`locale` por dossier** (no trilingüe en MVP). Formato de precio con `Intl` según `locale`. | Suficiente para vender; el contenido viene del módulo/overrides. |
| Precio | Moneda **por dossier** (`dossier.currency`); importes **sin impuestos** (nota "IVA no incluido" configurable en `pricing-card`); en `per_module` **sí** se muestra el total (suma de items visibles con precio). | Pregunta abierta #9 cerrada para MVP. Multi-moneda por item: fuera. |
| Assets | Supabase Storage, bucket por tenant (`tenant-assets/<tenant_id>/…`). Fuentes por `theme_tokens.font.faces[].src` (https). | Pendiente de Fase 1. |
| Gobernanza de módulos | Build-time: **solo plataforma** (PR al repo) crea `block_type` nuevos; los **admins de tenant** crean `module`/`module_version` (variantes de props) desde la consola. | Sin ejecución de código de tenant en runtime. |

## Seguridad aplicada en Fase 0

- `theme_tokens`/`theme_override` validados con Zod (lista blanca de claves, hex, longitudes, fuentes https) antes de entrar en `<style>`.
- Props de módulo validadas contra `schema.ts`; `href` limitado a `https:`/`mailto:`/`tel:`/`#`/`/`. Un item inválido se **omite** (log) en vez de romper el dossier.
- FKs compuestas `(tenant_id, …)` → imposible mezclar items/versiones/enlaces entre tenants aunque un usuario pertenezca a varios.
- `tenant_id` de tablas hijas lo deriva un trigger del padre.
- `module_version` no-draft es inmutable (trigger).
- `share_link.token`: 24 bytes aleatorios base64url (32 chars), `check length >= 16`.
- `/d/*`: `noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`; todos los fallos de gate → mismo 404.
- Host desconocido → sin tenant → 404. El fallback `DEV_TENANT_SLUG` solo aplica a `localhost`/`127.0.0.1`.

## Fase 1 (consola) — decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Auth consola | Supabase Auth (email+contraseña y magic link, `shouldCreateUser: false`) con `@supabase/ssr` (cookies httpOnly). `getUser()` en cada petición. | Sin alta abierta: los usuarios los da de alta la plataforma/admin. |
| Ámbito | La consola se sirve en el **host del tenant** (`pitch.<tenant>/admin`); el usuario necesita `membership` en ESE tenant (si no, 403). | Un único dominio por tenant; cookies aisladas por host. |
| Arquitectura del builder | El cliente envía **ops** (Zod discriminated union) y recibe el estado completo. Reglas en un único `service.ts` sobre `AdminDb` (demo / Supabase con JWT del usuario). | Sin lógica duplicada en cliente; misma suite de contrato contra ambas BDs. |
| Permisos | El servicio comprueba rol/autor/tenant **y** la RLS lo repite en Supabase (test de sesión falsificada incluido). | Defensa en profundidad. |
| CSRF | `security.checkOrigin` de Astro **desactivado**: compara con el host interno del servidor y rompería los formularios bajo el dominio del tenant. Sustituto: `isSameOriginWrite` en el middleware (Origin == host real; si falta Origin, solo `Sec-Fetch-Site: same-origin`). La API además exige `application/json`. | Correcto para dominios dinámicos por tenant. |
| Drag & drop | `svelte-dnd-action` (ratón, táctil y teclado) + botones ↑↓ explícitos. | Tablet y accesibilidad. |
| Personalización | JSON de `prop_overrides` validado en servidor contra el `schema.ts` del módulo (422 con el motivo). Formulario generado desde Zod: pendiente. | Valor inmediato sin bloquear la fase. |
| Ediciones en vivo | Editar un dossier publicado se refleja al instante en sus enlaces (es el objetivo del producto). Despublicar o revocar → 404. | — |

## Fase 1.5 (producción) — decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Despliegue | **Vercel** por defecto: el adapter se elige solo con la variable `VERCEL`. Alternativa: **Docker** (Node standalone, puerto 8080). `DEPLOY_TARGET` lo fuerza. | Dominios y SSL por API en Vercel; Docker para Cloud Run/Fly sin cambiar código. |
| Modo demo | Solo en desarrollo o con `DEMO_MODE=1`. Build de producción sin Supabase → **503** + `/api/health`. | El demo tiene login sin contraseña: no puede activarse por olvido. |
| Emails de Auth | Plantillas propias con `{{ .RedirectTo }}&token_hash=…`; destino `/admin/auth/confirm` (`verifyOtp`). SMTP propio obligatorio. | Funciona multi-dominio y en otro dispositivo; las invitaciones por defecto (implícitas) no crean sesión de servidor. |
| Service role | Solo para **invitar** (`/admin/team`) y en el script de alta. Datos siempre con el JWT del usuario. | Superficie mínima de bypass de RLS. |
| Marca | `tenant.brand` (logo, favicon, OG, contacto, legal) separado de `theme_tokens`; ambos validados con Zod antes de renderizar. | Responsabilidades distintas; lista blanca de claves. |
| Assets | Bucket público `tenant-assets`; escritura solo por admins del tenant y solo en `<tenant_id>/…`; 5 MB; tipos de imagen y fuente. | Lectura pública para el dossier; escritura aislada por tenant. |
| Alta de tenants | `tenants/<slug>/tenant.json` + `assets/` + script idempotente que valida con los schemas de la app. | Reproducible, revisable en PR, sin SQL manual. |
| Caché de tenant | 60 s en memoria por instancia; se limpia en la instancia que guarda la marca. | Otras instancias tardan ≤ 60 s en ver el cambio: aceptable. |
