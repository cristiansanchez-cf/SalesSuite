# Oquea · Entrega de marca y UI para Cofundo Ventas

> Respuesta del agente con acceso a los repos de Oquea. Cubre **dos repositorios**
> — `oquea-web` (web pública, Astro) y `OqueaApp` (app de producto, Flutter) — más
> lo que vive en **Figma**. Valores y rutas son reales; lo que no está en código
> se marca **PENDIENTE** con quién lo sabría.
> Repos: `github.com/Oquea/oquea-web` · `OqueaApp` (Flutter, local). Figma PROD:
> archivo `cgUfyZggGl48N3OWugHOEz` (*Oquea-CE, PROD VERSION*).

---

## 1. Identidad visual (design tokens)

Fuente de verdad: **`oquea-web/src/styles/tokens.css`** (sincronizado del OQUEA
Design System v1.4.0). Tema **claro** (light-first), sin dark mode.

| Token | Qué es | Valor | Fuente |
|---|---|---|---|
| `bg` | Fondo principal | `#FFFFFF` | tokens.css `--color-bg` / `--oq-white` |
| `surface` | Fondo secundario / secciones alternas | `#FBFBFB` | `--color-bg-secondary` / `--oq-grey-50` |
| `surface` (tarjeta) | Tarjetas | `#FFFFFF` + borde | patrón: fondo blanco + `border` |
| `text` | Texto principal | `#292929` | `--color-text-primary` / `--oq-grey-950` |
| `text-secondary` | Texto secundario | `#464646` | `--color-text-secondary` / `--oq-grey-800` |
| `muted` | Texto terciario / apagado | `#7C7C7C` (y `#989898`) | `--color-text-muted` / `--color-text-tertiary` |
| `border` | Bordes y líneas | `#EFEFEF` (tarjeta `#ECECEC`) | `--color-border` / `--color-border-card` |
| `primary` | Color de marca / CTA / activo | `#3757BE` | `--color-primary-dark` |
| `primary-contrast` | Texto sobre primary | `#FFFFFF` | — |
| `primary` (identidad) | Azul de marca "medio" | `#406AD0` | `--color-primary` |
| `primary-darker` (navy) | Fondos oscuros / titulares | `#1F294C` | `--oq-linkwater-900` |
| `accent` | Acento | `#D0FF00` (lima) | `--oq-accent` |
| `accent-contrast` | Texto sobre acento | `#1F294C` (navy) | ⚠️ **el acento es SOLO relleno, nunca color de texto** |
| `radius.card` | Redondeo de tarjetas | `24px` | `--radius-2xl` |
| `radius.button` | Redondeo de botones | `999px` (cápsula) | `--radius-full` |
| `radius` (internos) | Chips/inputs | `6 / 8 / 12 / 16px` | `--radius-sm…xl` |
| Tema | Claro / oscuro / ambos | **Solo claro** (marketing y producto). No hay dark mode | DS + README |

**Tokens adicionales** (útiles para recrear pantallas):
- **Paleta Linkwater (azules) completa:** `#F1F6FD · #E4EDFA · #C8DBF5 · #A1C4EF · #75A5E5 · #5585DC · #406AD0 · #3757BE · #32499B · #2D3F7B · #1F294C` (0→900).
- **Grises:** `#FBFBFB · #EFEFEF · #DCDCDC · #BDBDBD · #989898 · #7C7C7C · #656565 · #464646 · #3D3D3D · #292929`.
- **Error:** `#FF2323` / `#FF5757` / fondo `#FFF0F0`.
- **Motion:** `fast 150ms · normal 250ms · slow 400ms`; curvas `ease cubic-bezier(.4,0,.2,1)`, `ease-out (0,0,.2,1)`, `spring (.34,1.56,.64,1)`.
- **Sombras:** por norma **ninguna**; solo excepciones de marketing (CTA, tarjetas flotantes, mockups) — definidas en el README del repo web.
- **Espaciado** (escala cerrada): `4·8·12·16·20·24·32·40`. **Tipografía UI:** `10·12·14·16·18·20·24`.

---

## 2. Tipografía

| Rol | Familia | Pesos usados | Archivos |
|---|---|---|---|
| **UI (todo)** | **Gilroy** (fallback Inter) | 300, 400, 500, 600, 700 (existen 100–900 + itálicas) | `oquea-web/public/fonts/Gilroy-*.otf` (15 archivos) |
| **Display / marketing** | **DM Serif Display** (alias de "403 Zorn" en el DS) | 400 (+ itálica) | Google Fonts (sin archivo local) |
| **Acento emocional** (1–2 palabras) | **Caveat** (alias de "Billion Dreams") | 400–700 | Google Fonts (sin archivo local) |

⚠️ **Dos cosas importantes:**
1. **Formato:** las Gilroy están en **`.otf`, no `.woff2`**. Para web conviene
   convertirlas a `.woff2` (menor peso). Conversión directa desde los `.otf` del repo.
2. **Licencia:** Gilroy es fuente comercial (Radomir Tinkov). ✅ **Oquea tiene la
   licencia adquirida y cubre el uso web** — se puede usar en las propuestas sin problema.
   **DM Serif Display** y **Caveat** son **Google Fonts (SIL OFL)** → uso web libre.

---

## 3. Logo e imagen de marca

Carpeta: **`oquea-web/public/img/brand/`** + `oquea-web/public/favicon.svg`.

- **Logo (SVG):** `logo.svg`, `logo-navy.svg` (para fondo claro), `logo-accent.svg` (variante con lima).
- **Isotipo (SVG):** `isotipo.svg`, `isotipo-navy.svg`.
- **Textura:** `noise.svg` (grano sutil de fondo).
- **Favicon:** `favicon.svg`. → **PENDIENTE** PNG 512×512 (solo existe el SVG).
- **Imagen OG (1200×630):** ⚠️ **No existe una OG dedicada.** Hoy el `og:image` por
  defecto apunta a `/img/brand/logo-navy.svg` (un logo, no una tarjeta social).
  → **PENDIENTE** crear una OG 1200×630 real. *Quién:* diseño.
- **Reglas de uso del logo** (márgenes, mínimos, prohibiciones): en el **README del
  repo web** (sección "Brand rules") + **OQUEA Design System** (`OQUEA Design System.zip`)
  y Figma. → **PENDIENTE** el detalle fino de márgenes/tamaños mínimos. *Quién:* diseño.

---

## 4. La UI del producto (lo más importante)

### Mapa de superficies
| Superficie | Quién la usa | Qué hace | Dónde vive |
|---|---|---|---|
| **Web pública** | Prospecto / cliente | Marketing, captación | repo `oquea-web` (Astro) |
| **App — rol Buceador** | Buceador | Logbook, QR, álbum, perfil, descubrir centros | repo `OqueaApp` (Flutter) · Firebase |
| **App — rol Centro** | Centro de buceo | Actividades, dive sites, CRM, equipo, QR | repo `OqueaApp` (mismo app, rol centro) |
| **Landing pública del centro (QR)** | Buceador al escanear | Ficha del centro / actividad, auto-guardado | rutas `/divingcenter/:id` (Flutter web) |
| **Diseño a tamaño real** | — | Frames fuente | **Figma `cgUfyZggGl48N3OWugHOEz`** (Oquea-CE PROD) |

### 🎁 Atajo clave para Cofundo Ventas
En la **propia web ya recreamos mockups del producto en HTML/CSS** (exactamente lo
que Cofundo hace con Enjoy), con **rotador automático** y animaciones <3 s. Están en
**`oquea-web/src/pages/index.astro`** (markup) + **`oquea-web/src/styles/home.css`**
(estilos, prefijos `oq-mock-*`). Seis momentos ya montados y reutilizables:

| # | Momento | Clase CSS |
|---|---|---|
| 1 | **Panel del centro** — actividades de hoy (dashboard) | `oq-mock-plan` |
| 2 | **Registro por QR** — el buceador guarda la inmersión en su logbook | `oq-mock-qr` |
| 3 | **Compartir inmersión** — tarjeta estilo Strava (stats sobre foto) | `oq-mock-strava` |
| 4 | **CRM del centro** — perfil/historial del buceador | `oq-mock-crm` |
| 5 | **Mapa de dive sites** interactivo | `oq-mock-divemap` |
| 6 | **Viajes / ofertas flash** | `oq-mock-trips` |

> Recomendación: reutilizar estos componentes recreándolos **con tokens** (no
> colores fijos) y personalizando `{company}`, logo y fotos del cliente. Son el
> mejor material de venta que ya existe.

### Superficies de la app (para capturas reales / export de Figma)
Repo `OqueaApp/lib/views/`:
- **Onboarding/acceso:** `splash_view.dart`, `onboarding_view.dart`, `onboarding/`, `verify_code_view.dart`.
- **Buceador:** `home_view.dart`, `edit_profile_view.dart`, `logbook/` (lista, crear, **escáner QR**, detalle inmersión, **compartir social**), `activity/activity_album_view.dart` (álbum compartido).
- **Centro:** `diving_centers/` (lista, detalle, **QR del centro**, dive sites, equipo, crear centro, vista pública), `activities/` (lista, crear).

### 4–6 momentos que mejor venden (orden de flujo) — propuesta
- **Buceador:** escanea el QR del día → ve la actividad → **guarda la inmersión en el logbook** → recibe/ve sus stats → **comparte la tarjeta** → álbum de la salida.
- **Centro:** crea una actividad → los buceadores se apuntan → **ve el perfil/CRM del buceador** → fideliza (promos/comunicación).
- Para cada momento: **Captura PNG tamaño real / frame de Figma = PENDIENTE** (exportar del Figma PROD o del simulador). **Código fiel = ya disponible** (web: los `oq-mock-*`; app: los `.dart` citados).

### Resto
- **Iconografía:** Web = **SVG propios estilo Phosphor**, un solo set, en `oquea-web/src/components/Icon.astro` (sin librería). App = **Phosphor Icons** (según DS). **Emoji nunca.**
- **Ilustraciones / fotos:** `oquea-web/public/img/photos/` → `dive-center-operation.webp`, `divers-connecting.webp`, `founder-enrique.webp`, `share-card-bg.webp`. ✅ Permiso de uso confirmado por Oquea — se pueden usar en las propuestas.
- **Vídeos:** **PENDIENTE** (no hay en el repo web). *Quién:* marketing.
- **Animaciones y microinteracciones:** documentadas en **`prompt-referencia-estilo-oquea.md`** (reveal on scroll, hover lift, rotador de mockups, halos). Código: `.reveal*` en `oquea-web/src/styles/global.css` + `home.css`. Transiciones <400 ms.

---

## 5. Web y material comercial actual

- **Web:** https://oquea.com (es en la raíz, en bajo `/en/`). Páginas de producto/solución:
  `/centros/`, `/buceadores/`, `/sobre-oquea/`, `/contacto/`, `/soporte/`. Repo `github.com/Oquea/oquea-web`.
- **Deck / dossier comercial:** **PENDIENTE** (enlace/archivo). *Quién:* Enrique.
  Nota: existe guía interna de copy/estructura en `oquea-web/docs/landing-playbook.md`.
- **Tono de voz:** español primero (es-ES → LATAM), **tuteo (`tú`)**, *sentence case*,
  tono **calmado y cinematográfico**. Esencia de marca: **"Profundo. Humano. Fluido."**
  Ejemplos reales de copy: titulares de la home y de `/centros`, `/buceadores`.
  (Reglas en el README del repo web + OQUEA Design System.)

---

## 6. Idiomas

- **Web:** **es** (principal) + **en**. Arquitectura lista para añadir más locales (`src/i18n/routes.ts`).
- **App (Flutter):** **es** + **en** (`OqueaApp/lib/app.dart` → `supportedLocales: [Locale('en'), Locale('es')]`).
- **Expansión prevista:** Sudeste Asiático; el Design System contempla **coreano (`ko`)**.
  → **PENDIENTE** traducciones oficiales de términos clave (`logbook`, `dive site`,
  `inmersión`, `actividad`…) en pt/ko. *Quién:* producto.

---

## 7. Datos de contacto comercial (pie de propuesta)

- **WhatsApp comercial:** **+34 673 225 293**
- **Email:** `support@oquea.com` (soporte) · `enrique@oquea.com` (founder)
- **Web:** `oquea.com`
- **Razón social:** **Oquea Technologies SL** — Avenida Diego Fernández de Mendoza 11, 3º B, 29006 Málaga, España
- **Redes:** LinkedIn `linkedin.com/company/oquea` · Instagram `@oquea_official`
- **Dominio para las propuestas:** **PENDIENTE** decidir (ej. del brief: `oquea.ventas.cofundo.io`). *Quién:* Cristian / Cofundo.

---

## Estado de los archivos para la carpeta `oquea-entrega/`

| Carpeta | Estado |
|---|---|
| `fuentes/*.woff2` | ✅ Convertidas a `.woff2`. Licencia Gilroy ✅ confirmada (Oquea la tiene) |
| `marca/` logo, logo-oscuro, isotipo, favicon | ✅ En `oquea-web/public/img/brand/` + `favicon.svg` (SVG) |
| `marca/og.jpg` (1200×630) | ❌ **No existe** — PENDIENTE crear |
| `producto/<superficie>/*.png` | ❌ Capturas PENDIENTES (exportar de Figma/simulador). ✅ Código fuente de mocks disponible (`oq-mock-*`) |
| `fotos/` | ✅ 4 `.webp` en `public/img/photos/` — permiso de uso ✅ confirmado |
| `iconos/` | ✅ Propios en `src/components/Icon.astro` (web) · Phosphor (app) |

**PENDIENTES (resumen):** capturas PNG / frames de Figma de las pantallas de la APP nativa ·
dominio final de las propuestas. *(Licencia de Gilroy, OG 1200×630, fotos y mockups de la web: ✅ resueltos / incluidos en este paquete.)*
