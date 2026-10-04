# Oquea · estado del alta

> Lo actualiza la sesión de Oquea en cada entrega. Rama: `claude/new-session-o4iv8i` (hace de `claude/oquea-tenant`;
> sale de `claude/dreamy-dijkstra-a4xm1g`, mismo commit).

## Hecho
- **Entrega 00 · marca y UI** (`docs/ventas/oquea/fuentes/00-entrega-marca-y-ui.md`, `scripts/apply-oquea-00.py`):
  tema completo, Gilroy 300–700, logo navy y blanco, favicon, OG, contacto y razón social. Fotos (4) y mockups de la
  web (6) en `tenants/oquea/assets/img/`. Código de los mockups (`oq-mock-*`) en `docs/ventas/oquea/fuentes/ui-web/`.
- `tenants/oquea/tenant.json`: esqueleto vacío que valida (`npm run tenant:bootstrap -- tenants/oquea --dry-run`).
- Tokens de partida desde la skill `oquea-design` (SKILL.md): fondo `#FFFFFF`, CTA `#3757BE`, acento `#D0FF00` (solo
  fondo, nunca texto), botones y pills `999px`, sin sombras, sin modo oscuro, Gilroy + Inter.

## Qué falta (en este orden)

### A · Marca y UI (doc 01-PROMPT-REPO-UI)
| # | Qué | Estado |
|---|---|---|
| A1 | `references/oquea.md` y `references/gilroy-fonts.css` de la skill (no llegaron sincronizados) | ✅ sustituido por la entrega 00 (tokens.css del repo web) |
| A2 | Tokens que faltan: `text`, `muted`, `surface`, `border`, `accent-contrast`, `radius.card`. ¿Navy `#1F294C` es el texto? ¿`#406AD0` dónde se usa? | ✅ |
| A3 | Gilroy en `.woff2` (300–700) + licencia web; Oquea Headline Bold y Billion Dreams si se usan en portadas | ✅ Gilroy (licencia ✅). Titulares: ¿DM Serif Display? PENDIENTE |
| A4 | Logo SVG (claro/oscuro), isotipo, favicon, OG 1200×630 | ✅ (isotipo y favicon PNG también) |
| A5 | Capturas de la app (o frames del Figma `cgUfyZggGl48N3OWugHOEz`): los 4–6 momentos que más venden de cada superficie | 🟡 6 mockups de la web ✅ · **app real PENDIENTE** → `docs/oquea/03-CAPTURAS-APP.md` |
| A6 | Código Flutter de esas pantallas (o acceso al repo) | 🟡 rutas de `OqueaApp/lib/views/` ✅ · código PENDIENTE si hace falta |
| A7 | Fotos/vídeos reales con permiso, web, deck actual, tono de voz | 🟡 fotos ✅, web ✅, tono ✅ · vídeos y deck PENDIENTES |
| A8 | WhatsApp comercial, email, web, razón social, dominio de las propuestas (propuesto: `oquea.ventas.cofundo.io`) | 🟡 contacto ✅ · dominio PENDIENTE |

### B · Negocio (doc 02-PROMPT-AGENTE-NEGOCIO)
| Doc | Qué | Estado |
|---|---|---|
| 01 | Empresa y producto (qué hay EN PRODUCCIÓN) | PENDIENTE |
| 02 | Mercado: sectores, actores, situaciones | PENDIENTE |
| 03 | Jugadas | PENDIENTE |
| 04 | Precios, cupones, suelo, prueba gratis | PENDIENTE |
| 05 | Propuesta por sector | PENDIENTE |
| 06 | Casos reales | PENDIENTE |
| 07 | Organización comercial | PENDIENTE |
