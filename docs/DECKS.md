# Decks de inversión

Sección **temporal** para los espacios que son startups (hoy: Enjoy, Oquea y SciScreen). Un deck es una propuesta con
otros bloques: se monta igual (editor de propuestas), se comparte por enlace `/d/<token>` y tiene la misma analítica
(quién lo abre, cuánto lee, por qué diapositiva va).

## Quién la ve
- La activa o la quita el **superadmin** en Plataforma (tarjeta de cada espacio → «Startup: sección Decks»). Se guarda en
  `tenant_feature.decks`; solo cambia con `platform_set_feature` (superadmin).
- Con la sección activa: menú **Decks** (Vender) con «Decks» y «Analítica». No la ven los colaboradores.
- Quitarla esconde el menú y `/admin/decks`; los decks hechos y sus enlaces siguen funcionando.

## Para quién es cada deck
- Cada deck es para un **inversor del CRM** (tipo «Inversor», perfil `investor`: sin cualificación, sin prioridad, sin
  «dónde trabaja»). Al crear el deck se busca el inversor; si no está, se da de alta.
- Desde la ficha de un inversor: «Crear deck» y la lista de sus decks.

## Los bloques
Animados como las propuestas (aparecen en escalera, las cifras cuentan, las barras y el donut se llenan) y solo con los
colores y fuentes del espacio. En los textos, `*así*` sale en el color principal y `**así**` en negrita.
- `deck-cover` portada · `deck-slide` titular, cita y puntos numerados · `deck-stats` cifras (tarjetas con etiqueta, una
  resaltada), cifras pequeñas numeradas, tarjetas, reparto en barras o donut y frases destacadas · `deck-team` personas
  (una resaltada, nota al pie) · `deck-timeline` hitos en el tiempo · `deck-math` la cuenta grande, ventanas de salida,
  tabla de escenarios · `deck-contact` cierre · `deck-cases` acuerdos cerrados con foto.
- Piezas comunes en `src/modules/deck/` (texto con acento, cifras que cuentan, CSS y animación).
- Bloques de partida en el catálogo de cada espacio: `src/lib/decks/starter.ts` (migraciones 20270121 y 20270123).
  `deck-casos` no sale en un deck nuevo: se añade a mano.
- Un `null` en lo personalizado de un bloque de deck quita ese campo del catálogo (p. ej. la pastilla de la ronda).

## Por MCP
`decks`, `deck_ver`, `deck_crear` y `deck_bloque` (editar el bloque entero, añadir, quitar, mover, ocultar, mostrar): la
IA de la persona monta o corrige un deck; cada bloque se valida con su esquema y lo que no vale se explica campo a campo.
Así se montan los decks con contenido de la empresa sin que ese contenido pase por el repositorio.

## En el móvil
Decks y propuestas, siempre hacia abajo (sin presentación horizontal ni botón para cambiarla). El servidor lo decide por
el navegador; si no lo reconoce, en pantalla estrecha y vertical el CSS pone las diapositivas una debajo de otra.
  Los «—» son **huecos**: se rellenan con cifras reales en el Catálogo (vale para todos los decks) o en cada deck.
- Un deck nuevo nace con todos, en orden. `{company}` se cambia por el nombre del inversor.
- En el editor de un deck no hay sector, actores, precio ni resultado de venta (un deck no se «gana»: convertiría al
  inversor en cliente).

## Datos
- `dossier.kind` (`proposal` | `deck`). `listDossiers()` devuelve propuestas; `{ kind: 'deck' }`, decks; `'all'`, todo
  (traspasos y estadísticas).
- Migración `20270121000000_decks.sql`: columna, `tenant_feature`, RPC, y para enjoy/oquea/sciscreen la sección activa,
  el tipo «Inversor» y los 9 bloques.
- Smoke: `node scripts/smoke-decks.cjs` (demo).

## El deck de Enjoy
`20270122000000_deck_enjoy.sql` pone la versión 2 de seis bloques de Enjoy (portada, problema, solución, mercado,
modelo, por qué nosotros) con lo que ya está escrito de Enjoy (`tenants/enjoy/tenant.json`, `docs/ventas/enjoy`). Solo
si el bloque no se ha editado. Siguen como huecos: la ronda (portada y «La ronda»), TAM/SAM/SOM, tracción y equipo.
