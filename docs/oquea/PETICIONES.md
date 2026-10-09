# Oquea · peticiones a la sesión de Enjoy (código compartido)

> Lo que la sesión de Oquea ha tocado o necesita fuera de `tenants/oquea/**`, `docs/ventas/oquea/**` y `docs/oquea/**`.

## Hecho en la rama de Oquea (revisar al integrar)
| Archivo | Qué | Riesgo para Enjoy |
|---|---|---|
| `src/modules/app-steps/**` | Plantilla nueva «Pasos con la app» | Ninguno (plantilla nueva) |
| `src/modules/center-console/**` | Plantilla nueva «Consola del centro» | Ninguno (plantilla nueva) |
| `src/modules/registry.ts` | Las dos entradas | Ninguno |
| `src/modules/Thumb.astro` | Miniatura de `app-steps` (el primer móvil) | Ninguno (rama nueva del `if`) |
| `src/lib/i18n/messages/team.ts` | Nombre de las plantillas en es/en/pt/ko | Ninguno |
| `scripts/sample-dossiers.ts` | Ejemplo `centro-buceo` (sector `centros-buceo`) | Ninguno: en Enjoy no existe el sector y se salta |
| `src/lib/theme.ts`, `src/layouts/AdminLayout.astro` | `brandVars()`: la consola expone `--tn-primary/accent/accent-ink/dark` del tema del espacio, y el tema entero dentro de `.tn-ui` (la UI recreada de su producto) | Bajo: en Enjoy los valores son los de antes (`#ff27bb`, `#e1ff00`, oscuro `#08030c`≈`#0d0a12`) |
| `Thumb.astro`, `KitCover.astro`, `learn/tour.astro`, `learn/[topic].astro`, `learn/sector/[key].astro`, `console.css` | Fondo oscuro y brillo de las miniaturas, portadas y recorrido: de `--tn-*`, no fijos | Bajo: mismos colores en Enjoy |
| `src/lib/playbook/schema.ts` (`TOUR_UI`), `service.ts` (kit), `learn/tour.astro` | Recorrido: `app:<pantalla>` (móvil de `app-steps`) y `console:<vista>` (consola mini). `phone:`, `screen:` y `report` igual | Ninguno (formas nuevas) |
| `src/modules/center-console/ConsoleApp.astro`, `ConsoleMini.astro` | La app de la consola, sacada a su componente (la usan la diapositiva y la mini) | Ninguno (plantilla de Oquea) |
| `learn/sector/[key].astro` | «Imagínatelo» pinta `app-steps` (con pantallas) y `center-console`; sin UI, una columna (sin hueco) | Ninguno: Enjoy siempre tiene UI |
| `src/modules/app-steps/Component.astro` | Diapositivas sin pantalla: una columna centrada (condiciones, la red) | Ninguno |
| `supabase/seed/fixtures.json` (+ `seed.sql`), `public/demo/oquea-logo.svg` | Espacio de demo `oquea-demo` (`oquea.localhost`) con 3 módulos y el recorrido, para el smoke | Ninguno: sin miembros; Enjoy y retheme igual |
| `scripts/tenant-bootstrap.ts` | `stock:<búsqueda>` en listas de props: fotos libres de Openverse (solo CC0 / dominio público) subidas a `tenant-assets/<espacio>/stock/` con `credits.json`; si no aparece, se quita de la lista | Ninguno: Enjoy no usa `stock:` |
| `src/modules/app-steps/**` | Pantallas nuevas (qr-pick, dive-detail, album-photo), logbook/álbum/mapa/tarjetas rehechos, `SeaMap`, `MapSheet`, marcadores SVG | Ninguno (plantilla de Oquea) |
| `src/middleware.ts`, `src/lib/onboarding.ts` | Primera vez en un espacio → `/admin/welcome`; primera vez en Configurar (admins y managers) → `/admin/setup/welcome`. Una vez por navegador (cookie por espacio), solo con acceso real (Supabase) y nunca al superadmin | Bajo: afecta a Enjoy igual (lo pidió Cristian «para todos los tenants»); en demo y smokes, nada cambia |
| `src/pages/admin/setup/welcome.astro`, `messages/setupWelcome.ts`, `setup.astro` | Bienvenida de Configurar: empresa, playbook, mercado, catálogo, precios y comisiones (según permisos), con lo que hay hoy; enlace para volver a verla | Ninguno (página nueva) |
| `scripts/smoke-welcome.cjs` | Caso de la bienvenida de Configurar | Ninguno |
| `supabase/migrations/20261103000000_content_i18n.sql` | **Migración:** tabla `content_i18n` y `tenant.content_locales` (contenido en otros idiomas) | Ninguno: vacío por defecto; Enjoy no cambia |
| `src/lib/i18n/content*.ts`, `src/lib/admin/auth.ts`, `src/middleware.ts`, `AdminLayout.astro` | Lecturas del contenido con su traducción encima (al vender, no en Configurar) y marca «traducción automática» | Bajo: sin `content_locales`, las lecturas devuelven el original (una consulta solo si quien lee usa otro idioma que el del espacio) |
| `scripts/content-translate.ts`, `production.yml` (`traducir`), `tenant-bootstrap.ts` (`content_i18n`) | Traducción con Claude; secreto nuevo `ANTHROPIC_API_KEY` | Ninguno para Enjoy |
| `src/modules/app-steps/app-text.ts` y pantallas | Textos fijos de las pantallas de Oquea en es/en/pt/ko | Ninguno (plantillas de Oquea) |
| `scripts/smoke-learn.cjs` | Caso Oquea: los 5 pasos con UI (no capturas), azul del tema, 1440 y 375 px sin scroll | Ninguno |

## Pendiente (no lo he tocado)
1. **La fuente de texto del espacio no llega al cuerpo de la propuesta.** `html` resuelve `font-family: var(--font-sans)`
   con el valor por defecto y `.ds-root` redefine la variable pero no vuelve a declarar `font-family`, así que el texto
   corrido sale en la fuente del sistema (los titulares sí, porque usan `font-display`). Afecta también a Enjoy.
   Arreglo propuesto: `font-family: var(--font-sans)` en `.ds-root` (ThemedShell). Las plantillas de Oquea lo declaran
   ellas mismas mientras tanto.
2. ✅ **Hecho** (6-oct): las miniaturas de Aprende salen de los tokens del tema (`--tn-*`).
3. ✅ **Hecho** (6-oct): el recorrido pinta `app:<pantalla>` y `console:<vista>`. Oquea, los 5 pasos con el móvil
   (`scripts/apply-oquea-06.py`). `console:` necesita el módulo `center-console` en el catálogo (en Oquea está fuera).
