# Playbook de ventas: el "cerebro de la empresa" dentro de SalesSuite

> Propuesta para revisar juntos. Lo marcado ✅ está implementado y probado: en modo demo, contra Postgres + PostgREST + RLS y en navegador (`scripts/smoke-playbook.cjs`). Lo marcado 🔜 queda diseñado pero no construido.
>
> **Dónde verlo (modo demo):**
> - `/admin/learn`, como comercial, con sus sectores y actores;
> - `/admin/compose`, para preparar un mensaje;
> - en cualquier dossier, las tarjetas «Cuenta y actores» y «Seguimiento», y la pestaña «🎯 Guion de venta»;
> - `/admin/playbook`, como admin, incluida la pestaña «Mercado y actores».

## El problema

Un comercial nuevo de Enjoy (o de Oquea) tiene que entender a fondo el producto, cada módulo, para quién encaja, cómo monetizarlo, qué objeciones salen y cómo responderlas. Hoy eso vive en la cabeza del fundador o en documentos que envejecen. Un Google Doc colaborativo tiene cuatro fallos:

1. **No aparece en el momento de vender.** Nadie lo abre mientras monta la propuesta.
2. **No distingue lo oficial de las ocurrencias.** Todo pesa igual.
3. **No aprende.** No sabe qué frase funcionó ni a quién.
4. **No se conecta** con el resto: módulos, dossiers, resultados, Cerebro de Ventas.

## La idea en 5 piezas

### 1. Jugadas, no documentos ✅
El playbook se compone de **jugadas**: piezas pequeñas y tipadas, cada una enganchada a un **módulo del catálogo** o a la empresa en general.

| Tipo | Ejemplo (Enjoy · Tabs Experiencias) |
|---|---|
| **Pitch**: cómo presentarlo en 30 s | "Convierte el banquete en algo que los invitados *hacen*, no que *miran*" |
| **Para quién / cuándo no** | "Bodas de +120 invitados; no encaja en ceremonias íntimas" |
| **Pregunta de descubrimiento** | "¿Qué es lo que más os preocupa que pase en el banquete?" |
| **Objeción → respuesta** | "Mis invitados son mayores" → … |
| **Prueba**: caso, cifra | "92 % de invitados participan" |
| **Monetización**: precio, upsell, margen | "Ofrécelo como pack con Kiss-cam: +30 % ticket medio" |
| **Guion**: frase literal | Apertura de llamada |
| **Consejo** | "Enseña el móvil, no la pantalla" |

Cada jugada lleva los **mismos campos que una ficha del Cerebro de Ventas**: *cuándo usarla*, *por qué funciona*, **etapa** (Prospección, Primer contacto, Descubrimiento, Pitch/Demo, Objeciones, Negociación, Cierre, Seguimiento, Mentalidad) y **tipo de objeción** (Precio, Tiempo/me lo pienso, Desconfianza, No lo necesito, No decido yo, Quiere comparar, Ya tengo proveedor). Es la misma taxonomía, así que las dos fuentes se pueden cruzar.

### 2. Aparece donde se vende ✅
- **En el builder**, pestaña **"Guion de venta"**: con los módulos que el comercial ha puesto en *este* dossier, en *su* orden, la app arma el guion de la reunión. Apertura, preguntas de descubrimiento, cómo presentar cada módulo, precio con las cifras del dossier, objeciones probables según los módulos elegidos, y cierre. Los textos se personalizan con `{company}`/`{prospect}`. Se puede imprimir o copiar.
  - Orden: **Antes de nada** (aviso del sector + mentalidad) → **Antes de ir** (prospección) → Con quién hablas → Apertura → Descubrimiento → **Lo que se cuenta** (relato del sector, si lo tiene) → Presentación por módulo → Precio → Objeciones → Cierre y seguimiento.
  - **El sector manda**: en cada apartado, si el sector de la cuenta tiene jugadas propias, salen solo esas; las generales solo cubren huecos. Así un guion verificado no se mezcla con una apertura o un «es caro» genérico.
- **Guiones verificados** (Enjoy: locales, promotoras, conciertos, festivales): se cargan literales con `scripts/import-guiones.py` desde `docs/ventas/enjoy/fuentes/`. Las jugadas que sustituyen van en `retired_plays` de `tenant.json`: el alta las **archiva** (con revisión «Retirada…»), no las borra.
- **Aviso del sector** (`segment.notice`, máx. 600): lo pone el alta (`market[].notice`). Sale arriba de la ficha del sector en Aprende y al principio del guion. Ejemplo: conciertos y festivales, «aún no hemos cerrado ninguna venta».
- **En "Aprende"**: una ficha de venta por módulo con la **vista previa en vivo del módulo** (el comercial ve exactamente lo que verá el cliente), sus jugadas y lo que ha aportado el equipo.

### 3. Dos capas: oficial y equipo ✅
- **Oficial**: lo mantiene el CEO o el líder de ventas (rol admin). Cada cambio crea una **revisión con nota** ("qué cambió y por qué"), y los comerciales ven las **novedades desde su última visita**.
- **Equipo**:
  - Cualquier comercial puede **compartir un truco** ("me funciona decir X"). Es visible al momento para el equipo, marcado como *del equipo*.
  - O puede **proponer una mejora** a una jugada oficial, que va a la **bandeja del líder**.
  - El líder **acepta** (la jugada oficial se actualiza, con crédito y revisión), **rechaza** con motivo, **asciende** un truco a jugada oficial u **oculta** lo que no aporte.

### 4. Aprende de lo que funciona ✅ (base) · 🔜 (analítica)
- ✅ En cada jugada y truco: **"Me funcionó / No me funcionó"**, opcionalmente desde un dossier concreto. Ranking por evidencia, no por antigüedad.
- ✅ Resultado del dossier: **abierto / ganado / perdido**.
- ✅ Panel del líder:
  - las jugadas que más funcionan y las que fallan (candidatas a reescribir);
  - los trucos del equipo con más votos (candidatos a oficial);
  - quién ha completado la formación.
- 🔜 Con la analítica de Fase 2 (aperturas y tiempo por módulo): tasa de cierre por jugada y por módulo.

### 5. Onboarding "ready to go" ✅
**Aprende** son cuatro pasos en orden (rehecho en octubre de 2026: visual, poco texto). Primero se le vende el producto al comercial; después, a quién se lo vende él:
1. **Lo que vendes, en 1 minuto** (`/admin/learn/tour`): el producto contado paso a paso con imágenes grandes (escanea el QR → pide o manda → aparece en pantalla → queda en el álbum → quien contrata ve el resultado). Lo escribe la empresa en `tenant.tour` (`tenants/<slug>/tenant.json` → `tour`, hasta 8 pasos; `image` admite `asset:`). Mejor que una foto, la UI de verdad con `ui`: `phone:<pantalla>` (scan, home, sheet, form, pending, live, album, songs), `screen:<escena>,<escena>` (la pantalla en vivo pasando sola) o `report` (lo que recibe quien contrata). Las piezas salen de los módulos del catálogo (`phone-tour/Phone.astro`, `live-screen/ScreenMini.astro`, `live-screen/ReportMini.astro`) con sus props, así que usan el QR, las fotos y la música del espacio. «Entendido» lo marca como hecho.

   Las tarjetas de «Qué ofrecemos» (Aprende, bienvenida, ficha del módulo) tampoco usan fotos: `modules/Thumb.astro` pinta cada módulo con su propia UI (pantalla en marcha, móvil, tarjeta de precio, portada, pestañas), y la portada del recorrido es `modules/KitCover.astro` (pantalla + móvil, como en la web).
2. **Qué ofrecemos**: tarjetas grandes por módulo con la captura del producto de fondo (la primera imagen de sus props) o, si no tiene, la propia propuesta en vivo, difuminada.
3. **A quién vendemos**: tarjetas grandes por sector con su foto (`segment.image`, la pone el alta del espacio). La ficha del sector añade «Cliente ideal · Ideal Customer Profile (ICP)», quién puede frenarlo, e **Imagínatelo**: cada módulo del sector contado en una frase y visto en la propuesta real. «Entendido» marca el sector como repasado.
4. **Cómo se vende**: las jugadas generales, y cada módulo con *"Marcar como aprendido"*.

El progreso se cuenta en positivo («Ya has completado 3 de 10», nunca «0/10») y siempre hay un botón «Empieza aquí» / «Sigue con…» al siguiente paso pendiente. Cuentan: recorrido, cada sector, cómo se vende y cada módulo (`learning_progress.topic`: `general`, `tour`, `sector:<clave>` o el id del módulo).

El comercial ve su progreso y el líder ve el del equipo. Un comercial nuevo puede vender sin depender de nadie, y el contenido se mantiene vivo porque está atado a los módulos que se venden.

## 6. Mapa de mercado: a quién vendemos ✅

"Ready to go" no es solo saber qué vende cada módulo; también es **a quién**, **quién decide** y **quién puede tumbarlo**. Cada empresa define:

- **Sectores** (Enjoy: bodas, ocio nocturno, conciertos, festivales). Cada uno lleva:
  - por qué nosotros;
  - **cliente ideal** y cuándo descartarlo;
  - **cómo compran**, ticket típico y ciclo de venta;
  - **qué módulos encajan** (★ estrella / encaja / secundario), que es el cliente ideal de cada módulo.
- **Actores** de cada sector (DJ residente, propietario del local, marca patrocinadora, coordinadora de la finca…). Cada actor tiene:
  - su **papel** (decide, paga, influye, aliado interno, lo usa, puede vetar);
  - qué quiere, qué le duele y qué mide;
  - **cómo abordarle** y qué evitar;
  - **cómo puede ayudar** y **cómo puede tumbarlo**;
  - sus objeciones típicas, con la taxonomía del Cerebro;
  - **qué le aporta cada módulo** (el ángulo con el que presentárselo).
- Las jugadas pueden dirigirse a sectores y a actores concretos ("DJ residente: «esto me corta la sesión»").

Dónde se usa:
- **Aprende → sectores**: la ficha del sector con el mapa de actores. Cada actor tiene su botón "✉️ Preparar mensaje".
- **Dossier → Cuenta y actores**: sector del prospecto y **personas reales** (Álex, DJ residente, 🔴 bloqueador). Es el *mapa de poder* de la cuenta y la semilla del CRM: `dossier_contact` pasará a ser `contact`.
- **Guion → "Con quién hablas"**:
  - por persona: su papel, qué quiere, cómo abordarla, el **riesgo** si es bloqueadora y el ángulo de cada módulo del dossier;
  - un aviso de los actores clave (decide, paga, puede vetar) aún sin mapear;
  - jugadas filtradas por sector y por los actores presentes.
- **Preparar mensaje** (`/admin/compose`): ver §7.
- **Seguimiento**: próximo paso con fecha, vencidos y filtro en el listado. Diseño completo en [`FOLLOWUP.md`](./FOLLOWUP.md).

## 7. "Tipo DJ → creemos mensaje": contexto listo para el Cerebro ✅

El comercial elige **a quién** escribe (un tipo de actor, como "DJ residente · ocio nocturno", o una persona real de la cuenta), **para qué** (primer contacto, tras la reunión, seguimiento, objeción, cierre, reactivar) y el **canal**. La app junta lo que ya sabe:
- la empresa y el sector (cliente ideal, proceso de compra);
- el actor (papel, qué quiere, cómo abordarle, qué evitar, cómo puede tumbarlo);
- la cuenta (postura de esa persona, quién más hay);
- la propuesta (módulos, precio, enlace, próximo paso);
- las jugadas del playbook que aplican, con sus fichas del Cerebro.

Con eso genera una **petición** con la etapa y la objeción en la taxonomía del Cerebro, lista para:
- **Abrir en Claude / ChatGPT** con un clic (o copiar). Con el MCP del Cerebro conectado, el asistente busca la técnica (`buscar_tecnica`), dice de qué creador sale y redacta el mensaje con ese contexto;
- pegarla en cualquier otro sitio.

No hay IA dentro de la app: no inventa nada ni necesita claves de API. Cuando el Cerebro tenga API de servidor, la misma función alimentará una sugerencia automática.

## Integración con el Cerebro de Ventas

El Cerebro es conocimiento de **expertos** (técnicas generales y atribuidas). El playbook es conocimiento de **la empresa** (cómo se vende *este* producto). Se complementan:

| Dirección | Cómo | Estado |
|---|---|---|
| Cerebro → Playbook | Una jugada puede **referenciar fichas del Cerebro** (id, título, creador, enlace a la fuente), p. ej. la objeción "es caro" enlaza a *[707] El cliente dice 'caro' porque traduce precio a horas trabajadas*. Se muestra el título con atribución y enlace; **nunca se copia el guion literal del creador**. | ✅ |
| Cerebro → Playbook | Botón *"Sugerir técnicas"* en el editor de jugadas y en el guion: consulta el Cerebro por etapa y objeción. Necesita que el Cerebro exponga una API de servidor por tenant; la interfaz `TechniqueProvider` ya está prevista. | 🔜 |
| Playbook → Cerebro | **Exportación** `GET /admin/api/playbook/export` con formato de ficha: técnica, cuándo usarla, por qué funciona, guion, etapa, objeción, evidencia del equipo. Así el Cerebro puede ingerir "el cerebro del equipo Enjoy" y aprender de los fallos y aciertos del equipo. | ✅ export · 🔜 ingesta |
| Contexto → Cerebro | «Preparar mensaje»: petición con etapa y objeción del Cerebro + todo el contexto de empresa, sector, actor, cuenta y propuesta, para abrir en Claude/ChatGPT con el MCP. | ✅ |
| Mercado → Cerebro/CRM | La exportación incluye el **mapa de mercado** (sectores, actores, ángulos). | ✅ |
| Bucle | El Cerebro detecta fallos de un comercial y recomienda jugadas del playbook, o propone una mejora que entra en la bandeja del líder como cualquier otra propuesta. | 🔜 |

## Modelo de datos (migración `…_playbook.sql`)

- `play`: jugada oficial o borrador. Campos: `module_id` (null = general), `kind`, `stage`, `objection`, `segments[]`, `title`, `body`, `when_to_use`, `why_it_works`, `technique_refs` (jsonb), `status` (draft/official/archived), `version`, `key` (estable para importar).
- `play_revision`: historial; cada cambio guarda una foto y su nota, y enlaza la propuesta que lo originó.
- `play_contribution`: capa de equipo. `type` = `tip` (visible al momento) o `change` (pendiente de revisión). Estados: shared, pending, accepted, rejected, hidden.
- `play_feedback`: "me funcionó / no" por usuario y objetivo, con `dossier_id` opcional.
- `learning_progress`, `playbook_seen`: progreso y novedades por persona.
- `dossier.outcome`: open/won/lost.
- `segment`, `persona`, `segment_module` (cliente ideal de cada módulo), `persona_module` (ángulo por actor); `play.personas`.
- `dossier.segment_id`, `dossier_contact` (persona real + postura), `dossier.next_step(_at)`.

Permisos (RLS):
- Cualquier miembro lee lo oficial y lo compartido, comparte trucos, propone mejoras y vota.
- Solo los admins editan lo oficial y revisan propuestas.
- Cada persona solo ve sus propuestas pendientes; los admins ven todas.

## Preguntas para revisar juntos

1. ¿Rol propio de **"líder de ventas"** (edita el playbook pero no la marca ni el equipo), o basta con admin? Hoy: admin.
2. ¿Los trucos del equipo son visibles **al momento** o pasan antes por el líder? Hoy: al momento, etiquetados como *del equipo*, y el líder puede ocultarlos.
3. ¿Quién valida el **mapa de mercado** de Enjoy? Los 4 sectores y 15 actores son **ejemplo** redactado por mí a partir de lo que me contaste. Se importa con `tenants/enjoy/tenant.json` → `market`.
4. ¿Quién escribe el playbook inicial de Enjoy? El de este repo es **contenido de ejemplo** que yo he redactado; se importa con `tenants/enjoy/tenant.json` → `playbook`.
5. Cerebro: ¿qué API puede exponer para consulta desde servidor (por tenant), y qué formato quiere para ingerir el export?
6. ¿Generación con IA del guion personalizado (a partir de las jugadas y el dossier)? Encaja como siguiente paso. El guion actual es determinista y no inventa nada.


## Actualización: de «me gusta» a evidencia

Los votos «me funcionó / no» se han retirado: algo puede sonar bien y no cerrar. Ahora cada jugada muestra en cuántos **cierres documentados** se usó y cuántos ganó, y las métricas del líder se ordenan por ese dato. Detalle en [`EVIDENCE.md`](EVIDENCE.md). La tabla `play_feedback` se conserva, sin uso, para no perder el histórico.
