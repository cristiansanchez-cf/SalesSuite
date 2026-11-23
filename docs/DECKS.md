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
- Tipos `deck-cover` (portada), `deck-slide` (título + puntos), `deck-stats` (cifras y reparto en %) y `deck-team`.
- Cada espacio tiene 9 bloques de partida en su catálogo (`deck-portada` … `deck-ronda`, ver `src/lib/decks/starter.ts`).
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
