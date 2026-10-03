# Playbook de ventas: el "cerebro de la empresa" dentro de SalesSuite

> Propuesta para revisar juntos. Lo marcado ✅ está implementado y probado: en modo demo, contra Postgres + PostgREST + RLS y en navegador (`scripts/smoke-playbook.cjs`). Lo marcado 🔜 queda diseñado pero no construido.
>
> **Dónde verlo (modo demo):** `/admin/learn` como comercial · `/admin/playbook` como admin · pestaña «🎯 Guion de venta» en cualquier dossier.

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
**Aprende** es un recorrido:
1. **Empieza aquí**: la empresa, el cliente ideal, las objeciones generales.
2. Una ficha por módulo, cada una con *"Marcar como aprendido"*.

El comercial ve su progreso y el líder ve el del equipo. Un comercial nuevo puede vender sin depender de nadie, y el contenido se mantiene vivo porque está atado a los módulos que se venden.

## Integración con el Cerebro de Ventas

El Cerebro es conocimiento de **expertos** (técnicas generales y atribuidas). El playbook es conocimiento de **la empresa** (cómo se vende *este* producto). Se complementan:

| Dirección | Cómo | Estado |
|---|---|---|
| Cerebro → Playbook | Una jugada puede **referenciar fichas del Cerebro** (id, título, creador, enlace a la fuente), p. ej. la objeción "es caro" enlaza a *[707] El cliente dice 'caro' porque traduce precio a horas trabajadas*. Se muestra el título con atribución y enlace; **nunca se copia el guion literal del creador**. | ✅ |
| Cerebro → Playbook | Botón *"Sugerir técnicas"* en el editor de jugadas y en el guion: consulta el Cerebro por etapa y objeción. Necesita que el Cerebro exponga una API de servidor por tenant; la interfaz `TechniqueProvider` ya está prevista. | 🔜 |
| Playbook → Cerebro | **Exportación** `GET /admin/api/playbook/export` con formato de ficha: técnica, cuándo usarla, por qué funciona, guion, etapa, objeción, evidencia del equipo. Así el Cerebro puede ingerir "el cerebro del equipo Enjoy" y aprender de los fallos y aciertos del equipo. | ✅ export · 🔜 ingesta |
| Bucle | El Cerebro detecta fallos de un comercial y recomienda jugadas del playbook, o propone una mejora que entra en la bandeja del líder como cualquier otra propuesta. | 🔜 |

## Modelo de datos (migración `…_playbook.sql`)

- `play`: jugada oficial o borrador. Campos: `module_id` (null = general), `kind`, `stage`, `objection`, `segments[]`, `title`, `body`, `when_to_use`, `why_it_works`, `technique_refs` (jsonb), `status` (draft/official/archived), `version`, `key` (estable para importar).
- `play_revision`: historial; cada cambio guarda una foto y su nota, y enlaza la propuesta que lo originó.
- `play_contribution`: capa de equipo. `type` = `tip` (visible al momento) o `change` (pendiente de revisión). Estados: shared, pending, accepted, rejected, hidden.
- `play_feedback`: "me funcionó / no" por usuario y objetivo, con `dossier_id` opcional.
- `learning_progress`, `playbook_seen`: progreso y novedades por persona.
- `dossier.outcome`: open/won/lost.

Permisos (RLS):
- Cualquier miembro lee lo oficial y lo compartido, comparte trucos, propone mejoras y vota.
- Solo los admins editan lo oficial y revisan propuestas.
- Cada persona solo ve sus propuestas pendientes; los admins ven todas.

## Preguntas para revisar juntos

1. ¿Rol propio de **"líder de ventas"** (edita el playbook pero no la marca ni el equipo), o basta con admin? Hoy: admin.
2. ¿Los trucos del equipo son visibles **al momento** o pasan antes por el líder? Hoy: al momento, etiquetados como *del equipo*, y el líder puede ocultarlos.
3. ¿Quién escribe el playbook inicial de Enjoy? El de este repo es **contenido de ejemplo** que yo he redactado; se importa con `tenants/enjoy/tenant.json` → `playbook`.
4. Cerebro: ¿qué API puede exponer para consulta desde servidor (por tenant), y qué formato quiere para ingerir el export?
5. ¿Generación con IA del guion personalizado (a partir de las jugadas y el dossier)? Encaja como siguiente paso. El guion actual es determinista y no inventa nada.
