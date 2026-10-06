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

- **Entrega 02 · UI de la app** (`docs/ventas/oquea/fuentes/02-entrega-UI-aplicacion.md` + `ui-app/`): tokens de la
  app (texto `#000`, borde `#E0E0E0`, tarjeta 16), anatomía de la consola de escritorio, 104 vistas, 5 recorridos y una
  recreación HTML de la consola (`docs/oquea/img/consola-centro-recreacion.png`).
- **Tema del dossier:** se quedan los tokens de la **web** (la propuesta es marketing). Los de la **app** van dentro de
  las plantillas que recrean pantallas (consola, móvil), como hace Enjoy con su pantalla.

- **Guía de inicio PT** (`docs/ventas/oquea/fuentes/03-guia-de-inicio-PT.pdf`): la presentación que validó la venta.
  Referencia de relato y de maqueta (`docs/ventas/oquea/agente/03-GUIA-INICIO-REFERENCIA.md`) y **19 capturas reales**
  de la app (`tenants/oquea/assets/img/producto/app/`).

- **Plantillas con la UI de Oquea** (`src/modules/app-steps`, `src/modules/center-console`) y **primer contenido**
  (`scripts/apply-oquea-03.py`): 12 diapositivas, sector «Centros de buceo» con receta, recorrido de Aprende, 10
  jugadas y un dossier de ejemplo. Detalle: `docs/ventas/oquea/agente/03-GUIA-CARGADO.md`. Lo que toca código
  compartido: `docs/oquea/PETICIONES.md`.

- **Documentos 01 (empresa), 05 (catálogo del dossier) y guion de campo** (6-oct-2026): lista cerrada del producto,
  dossier de 11 módulos con texto literal y receta por ángulo, 66 jugadas. Detalle:
  `docs/ventas/oquea/agente/01-05-GUION-CARGADO.md`. Preguntas abiertas: **`docs/oquea/PREGUNTAS.md`**.

- **Aprende con la UI de Oquea** (6-oct-2026): el recorrido «Así funciona» pinta las pantallas de la app recreadas,
  no capturas (`scripts/apply-oquea-06.py`); miniaturas, portadas y sector con los colores de Oquea; diapositivas sin
  pantalla en una columna. Capturas: `docs/oquea/img/aprende-recorrido-ui-escritorio.png` y `-movil.png`.

- **UI de la app, 2ª entrega** (6-oct-2026, tarde): tarjetas para redes («estilo Strava»: un móvil que pasa de una a
  otra; el nombre del centro, no su logo), logbook público, «¿qué actividad haces hoy?», la inmersión en el logbook,
  álbum y foto, mapa con los marcadores de la entrega (`tenants/oquea/assets/img/mapa/`) y la ficha del marcador.
  Scripts `apply-oquea-07.py` y `apply-oquea-08.py`. Fotos libres: `stock:<búsqueda>` (las resuelve el alta).
  Capturas: `docs/oquea/img/app-*.png` y `tarjetas-redes-*.png`.

## Qué falta (en este orden)

### A · Marca y UI (doc 01-PROMPT-REPO-UI)
| # | Qué | Estado |
|---|---|---|
| A1 | `references/oquea.md` y `references/gilroy-fonts.css` de la skill (no llegaron sincronizados) | ✅ sustituido por la entrega 00 (tokens.css del repo web) |
| A2 | Tokens que faltan: `text`, `muted`, `surface`, `border`, `accent-contrast`, `radius.card`. ¿Navy `#1F294C` es el texto? ¿`#406AD0` dónde se usa? | ✅ |
| A3 | Gilroy en `.woff2` (300–700) + licencia web; Oquea Headline Bold y Billion Dreams si se usan en portadas | ✅ Gilroy (licencia ✅). Titulares: ¿DM Serif Display? PENDIENTE |
| A4 | Logo SVG (claro/oscuro), isotipo, favicon, OG 1200×630 | ✅ (isotipo y favicon PNG también) |
| A5 | Capturas de la app (o frames del Figma `cgUfyZggGl48N3OWugHOEz`): los 4–6 momentos que más venden de cada superficie | 🟡 6 mockups de la web ✅ · consola recreada ✅ · **capturas de la app PENDIENTES** → `docs/oquea/03-CAPTURAS-APP.md` |
| A6 | Código Flutter de esas pantallas (o acceso al repo) | 🟡 rutas de `OqueaApp/lib/views/` ✅ · código PENDIENTE si hace falta |
| A7 | Fotos/vídeos reales con permiso, web, deck actual, tono de voz | 🟡 fotos ✅, web ✅, tono ✅ · vídeos y deck PENDIENTES |
| A8 | WhatsApp comercial, email, web, razón social, dominio de las propuestas (propuesto: `oquea.ventas.cofundo.io`) | 🟡 contacto ✅ · dominio PENDIENTE |

### B · Negocio (doc 02-PROMPT-AGENTE-NEGOCIO)
| Doc | Qué | Estado |
|---|---|---|
| 01 | Empresa y producto (qué hay EN PRODUCCIÓN) | ✅ v0 cargado |
| 02 | Mercado: sectores, actores, situaciones | PENDIENTE |
| 03 | Jugadas | ✅ guion de campo v0 (no verificado en campo) |
| 04 | Precios, cupones, suelo, prueba gratis | PENDIENTE |
| 05 | Propuesta por sector | ✅ catálogo de centro de buceo v0 |
| 06 | Casos reales | PENDIENTE |
| 07 | Organización comercial | PENDIENTE |
