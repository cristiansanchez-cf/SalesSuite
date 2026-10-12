# CRM dinámico: arquitectura

> Estado: casi todo **hecho** (cada sección lo dice). Cómo se prueba y reglas de rendimiento: `docs/DESARROLLO.md`. Objetivo: que cada espacio (Enjoy, Oquea…) tenga **su propio CRM**
> con **sus propios campos**, como una base de datos de Notion, pero dentro de Cofundo Ventas y conectado a lo que ya
> existe: propuestas, territorio, comisiones, Aprende, Preparar mensaje y el resumen diario.
>
> Lo que más importa al fundador: **no olvidar ningún seguimiento** y que vender le cueste ~20 minutos de cabeza al día.
> Todo el diseño está pensado para llegar ahí por fases.

---

## 1. Qué hay hoy (y se reutiliza)

| Pieza | Hoy | En el CRM |
|---|---|---|
| **Cuenta** (`account`) | Nombre, zona, sector, dirección, referencia externa, notas, dueño, reserva, cliente/bloqueada | Es el **registro** del CRM. Sus columnas fijas se quedan (las reglas de territorio y comisión dependen de ellas) |
| **Toques** (`account_touch`) | Quién y cuándo contactó una cuenta (renueva la reserva) | Pasa a ser la **actividad** (llamada, WhatsApp, visita, nota…) |
| **Importar CSV** (Territorio) | Columnas fijas: nombre, ciudad/zona, dirección, referencia, notas | Se convierte en el **asistente de importación** con mapeo de columnas |
| **Situaciones** (`facets`) | Selecciones por tenant (personalidad, región, «tiene pantalla»…) para comparar ventas | Las de alcance *cuenta* son **campos del CRM** de tipo selección. Se unifican (§3.4) |
| **Contactos** (`dossier_contact`) | Personas de una propuesta, con su papel y rasgos | Se cuelgan de la **cuenta** (y siguen enlazados a cada propuesta) |
| **Próximo paso** (`dossier.next_step_at`) + resumen diario | Por propuesta | Pasa a la **cuenta** (una cuenta sin propuesta también tiene próximo paso) |

Nada se tira: el CRM es la capa que une piezas que hoy están sueltas.

---

## 2. Principio de diseño

**Núcleo fijo + campos dinámicos por espacio.**

- **Núcleo fijo** (igual en todos los espacios, porque el sistema razona con él): nombre, sector, zona, dueño, etapa,
  próximo paso, estado de reserva/cliente, referencia externa.
- **Campos dinámicos** (cada espacio define los suyos, sin programar): en Enjoy «¿Tiene pantalla?», «DJ residente»,
  «Aforo», «Noches que abre», «Instagram»; en Oquea «Certificadora (PADI/SSI/CMAS)», «Nº de instructores»,
  «Buceadores al mes», «Idiomas»…

Así un espacio nuevo arranca con un CRM útil desde el minuto uno y cada empresa lo adapta a su negocio.

---

## 3. Modelo de datos

### 3.1 Definición de campos: `crm_field`

| Columna | Qué es |
|---|---|
| `tenant_id`, `id` | De qué espacio es |
| `key` | Clave estable (`tiene-pantalla`). **No cambia nunca**: renombrar la etiqueta no toca los datos |
| `label` | Lo que se ve («¿Tiene pantalla?») |
| `type` | `text`, `long_text`, `number`, `money`, `checkbox`, `select`, `multi_select`, `date`, `url`, `email`, `phone`, `rating`, `person` (alguien del equipo) |
| `options` | Para `select`/`multi_select`: `[{ key, label, color }]`. Se guarda la **clave** de la opción, no la etiqueta |
| `group` | Sección en la ficha («El local», «Contacto», «Redes») |
| `position` | Orden |
| `help` | Una línea de ayuda («Pantalla propia, no la del DJ») |
| `required` | Si hay que rellenarlo para crear la cuenta |
| `in_list` / `filterable` | Si sale como columna en la lista y si se puede filtrar |
| `use_as_situation` | Si cuenta como «situación» para comparar ventas (§3.4) |
| `segments` | Si solo aplica a algunos sectores (p. ej. «Aforo» solo en locales y conciertos). Vacío = todos |
| `archived_at` | Archivar en vez de borrar: los datos se conservan |

### 3.2 Valores: columna `fields jsonb` en `account`

```
account.fields = { "tiene-pantalla": true, "aforo": 450, "estilo": ["reggaeton","comercial"], "instagram": "https://…" }
```

**Por qué JSONB y no una tabla de valores (EAV):** una sola lectura por cuenta, filtros e índices en Postgres
(`GIN`), el mismo modelo que Notion por dentro, y nada de joins por cada columna. Con decenas de campos y miles de
cuentas por espacio va sobrado.

**Validación** en una sola implementación (como el resto de la app): el servidor construye un esquema Zod a partir de
`crm_field` y valida cada escritura. En la base de datos, un *trigger* comprueba que las claves existen en el espacio
(defensa en profundidad) y la RLS de `account` sigue igual.

### 3.3 Etapas del embudo: `crm_stage`

Configurables por espacio, con orden y tipo (`open` / `won` / `lost`). Separadas de la **reserva** (de quién es la
cuenta) y de la **publicación** de una propuesta. Por defecto: *Por contactar → Contactado → Reunión → Propuesta enviada
→ En prueba → Ganado / Perdido*. «Ganado» sigue disparando lo que ya existe (cliente, comisiones).

### 3.4 Situaciones = campos de selección (unificación)

Hoy las «situaciones» de alcance *cuenta* son selecciones definidas por el espacio. Con el CRM, **son campos `select` /
`multi_select` con `use_as_situation = true`**. La pantalla «Qué ha funcionado» y las recomendaciones de Preparar
mensaje los siguen leyendo igual. Las de alcance *persona* (tipo de personalidad) se quedan en contactos. Migración: cada
faceta de cuenta se convierte en un campo con la misma clave y sus valores pasan de `dossier.situation` a
`account.fields`.

### 3.5 Contactos de la cuenta: `crm_contact`

Personas de la cuenta (nombre, papel —los actores del sector—, teléfono, email, notas y, más adelante, sus propios campos
dinámicos). `dossier_contact` apunta a ellas: la persona se crea una vez y aparece en todas sus propuestas.

### 3.6 Actividad: `crm_activity` (evoluciona `account_touch`)

| Columna | Qué es |
|---|---|
| `kind` | `call`, `whatsapp`, `email`, `visit`, `meeting`, `note`, y automáticas: `proposal_sent`, `proposal_opened`, `stage_changed`, `imported` |
| `account_id`, `contact_id`, `dossier_id` | A qué va |
| `at`, `by`, `body`, `outcome` | Cuándo, quién, qué y resultado («respondió», «no contesta», «quiere precio») |

Cada actividad **renueva la reserva** (como hoy los toques) y **pide el próximo paso** (§5).

### 3.7 Próximo paso de la cuenta

En `account`: `next_step` (texto), `next_step_at` (fecha y hora) y `next_step_by` (quién). Es lo que alimenta «Hoy», el
resumen diario y los avisos. Una cuenta abierta **sin próximo paso** es una alerta para el líder.

### 3.8 Vistas guardadas: `crm_view`

Filtros + orden + columnas + agrupación (por etapa = tablero tipo kanban; por zona; por dueño). Personales o del
equipo. Vistas por defecto: **Hoy** (próximos pasos vencidos y de hoy), **Mis cuentas**, **Por etapa** (tablero),
**Sin próximo paso**. Ejemplo tuyo: «Foco Valencia» = zona Valencia + sector locales + etapa «Por contactar».

---

## 4. Importar (Notion, CSV, Google Sheets)

Un asistente de 4 pasos que sirve para cualquier espacio y cualquier CSV:

1. **Subir** el CSV (exportación de Notion: *⋯ → Export → Markdown & CSV*, o cualquier hoja de cálculo).
2. **Mapear columnas.** Para cada columna, la app propone: *campo del núcleo* (Nombre, Zona, Sector, Etapa…), *campo
   existente*, **crear campo nuevo** (con el tipo adivinado: ≤ 20 valores distintos → selección; «Sí/No» → casilla;
   fechas; números; URLs; emails; teléfonos) o *ignorar*. Las listas de Notion separadas por comas → selección múltiple.
   La columna de estado de Notion → **etapa** (con su tabla de equivalencias).
3. **Duplicados.** Por referencia externa (id de Notion o de Google Maps) o por nombre + ciudad normalizados. Para cada
   duplicado: *saltar*, *actualizar* o *crear igualmente*.
4. **Vista previa** de 10 filas tal y como quedarán, con los errores marcados («Aforo: "unos 300" no es un número» → se
   guarda en notas). **Importar** crea un lote (`import_batch`) que se puede **deshacer** entero.

Lo mismo sirve para cargar locales investigados («foco Valencia») y para Oquea con sus campos.

---

## 5. Seguimiento: lo que de verdad te quita carga mental

| Fase | Qué | Resultado para ti |
|---|---|---|
| **«Hoy»** (en Inicio) | Lista única: vencidos → hoy → mañana, con el **contexto en una línea** y botones: *Llamar*, *WhatsApp*, *Preparar mensaje*, *Hecho → ¿siguiente paso?* | Abres la app y sabes qué hacer, en orden |
| **Cerrar el bucle** | Al registrar una actividad, la app propone el próximo paso según la etapa («Mandada la propuesta → seguimiento en 2 días») | Ninguna cuenta se queda sin próximo paso |
| **Resumen diario** | Ya existe para propuestas: se amplía a cuentas | Un email (o WhatsApp) a primera hora con lo de hoy |
| **Cadencias por sector** | Secuencias definidas en el playbook (D+0 enlace, D+2 WhatsApp, D+5 llamada…) con la jugada adecuada de cada paso | Seguimientos que se proponen solos |
| **Disparadores** | «Ha abierto la propuesta 3 veces hoy» → aviso «llama ahora» con el contexto preparado | Llamas en el momento justo |
| **Cerebro de Ventas** | Preparar mensaje ya monta el contexto; después, el mensaje propuesto | 20 minutos al día |

---

## 6. Multiespacio (Enjoy, Oquea y los que vengan)

- Cada espacio define **sus** campos, etapas y vistas. Nada se comparte entre espacios.
- **Puntos de partida por sector** en la configuración guiada (como hoy los sectores y actores de ejemplo): «Ocio
  nocturno» propone pantalla, DJ, aforo, noches, estilo e Instagram; «Buceo» propone certificadora, instructores,
  buceadores al mes, idiomas y temporada. Se aplican con un clic y se ajustan.
- En `tenants/<espacio>/tenant.json` habrá `crm.fields`, `crm.stages` y `crm.views`, cargados por el alta del espacio
  como el resto (idempotente, con `--dry-run`).
- **Permisos**: los campos los define el admin (y el líder); los valores, quien trabaja la cuenta o un responsable; los
  colaboradores solo ven sus cuentas asignadas (como hoy).

---

## 7. Fases de implementación

| Fase | Qué incluye | Pruebas |
|---|---|---|
| **1 · Campos** ✅ | `crm_field` + `account.fields` (migración `20261102000000_crm_fields.sql`), editor en *Equipo → Campos del CRM*, «Ficha» en cada cuenta con secciones, columnas y filtros en la lista, `crm.fields` en `tenant.json` | `src/lib/crm/fields.test.ts`, `supabase/tests/47_crm_fields.test.sql`, contrato de cuentas (demo y Postgres), `scripts/smoke-crm.cjs` |
| **2 · Empresas, personas e importar** ✅ | Grupos de un nivel, personas en varias empresas con su papel, alta rápida con «¿dónde?», bandeja sin empresa, listas (etiquetas) con sus campos y su etapa, mover en bloque a un grupo, importador (mapeo → vista previa → importar → deshacer). Migración `20261103000000_crm_people.sql` | `src/lib/crm/import.test.ts`, `supabase/tests/48_crm_people.test.sql`, contrato de cuentas (demo y Postgres), `scripts/smoke-crm-people.cjs` (CSV inventado) |
| **3 · Etapas, actividad y «Hoy»** | `crm_stage`, `crm_activity`, próximo paso en la cuenta, «Hoy» en Inicio, resumen diario ampliado | Smoke del ciclo completo |
| **4 · Vistas** | Vistas guardadas, tablero por etapa, «Foco Valencia» | Smoke de filtros y tablero |
| **5 · Automatizar** | Cadencias, disparadores, contactos con campos propios, unificación total con situaciones | Por regla |

Cada fase sale a producción sola y no rompe lo anterior (el checkpoint de tests del agente en paralelo lo vigila).

---

## 8. Menú: propuesta para simplificar (antes del CRM)

Hoy hay **9 destinos en Vender** y **9 en Configurar**. Con el CRM se añadiría uno más. Propuesta: bajar a **5 y 5**
sin perder ninguna función. Cada página que desaparece del menú **se convierte en una pestaña o en una tarjeta** de otra,
y su dirección antigua redirige a la nueva (los enlaces de los emails siguen funcionando).

### Vender (de 9 a 5)

| Hoy | Propuesta | Dónde queda |
|---|---|---|
| Empieza aquí | **Inicio** | Tarjeta «Empieza aquí» arriba en Inicio mientras no esté completo; luego, en el menú del perfil |
| Inicio | **Inicio** | Con «Hoy» (seguimientos) como lo primero |
| Cuentas | **Cuentas** (el CRM) | Lista, tablero por etapa y vistas |
| Propuestas | **Propuestas** | Igual; la analítica de cada una, dentro de la propuesta |
| Analítica | → Propuestas | Pestaña «Analítica» en Propuestas |
| Preparar mensaje | → dentro de Cuentas y Propuestas | Botón en cada cuenta, propuesta y en «Hoy». Sigue existiendo la página para usarla suelta (enlace en Inicio) |
| Qué ha funcionado | → Aprende | Pestaña «Lo que funciona» en Aprende |
| Aprende | **Aprende** | — |
| Mis comisiones | **Mis comisiones** | Se queda (es dinero: mejor a la vista) |

### Configurar (de 9 a 5)

| Hoy | Propuesta | Dónde queda |
|---|---|---|
| Configuración guiada | **Empresa** | Pestañas: Configuración guiada · Marca |
| Marca | → Empresa | Pestaña |
| Playbook | **Mercado y playbook** | Igual |
| Catálogo | **Catálogo y precios** | Pestañas: Módulos · Tarifas y cupones |
| Precios | → Catálogo y precios | Pestaña |
| Equipo | **Equipo** | Pestañas: Personas · Organigrama · Territorio · **Campos del CRM** |
| Organigrama | → Equipo | Pestaña |
| Territorio | → Equipo | Pestaña |
| Comisiones | **Comisiones** | Igual |

**Cuidado que se tiene:** ninguna función desaparece; las direcciones antiguas redirigen; los smokes del agente de tests
cubren cada pantalla antes y después del cambio.

---

## 8 bis. Cómo quedó la fase 1 (para quien lo toque)

- **Lógica de campos**: `src/lib/crm/fields.ts` (tipos, `fieldInputSchema`, `parseValue(s)`, `formatValue`, `matches`,
  `fieldsFor`, `valuesFromForm`). Una sola implementación para demo y Supabase.
- **Servicio**: `admin.accounts.crmFields() / saveField() / archiveField() / moveField() / setFields()` y
  `list({ fields: { clave: valor } })` para filtrar.
- **Reglas**: la clave nace de la etiqueta y no cambia; el tipo no se cambia (sería otro campo); las opciones conservan
  su clave aunque se renombren; archivar no borra datos; en la cuenta solo se guardan claves de campos del espacio
  (trigger `account_fields_check`).
- **Formularios**: `components/crm/FieldInput.astro` pinta el control de cada tipo (`present:<clave>` + `f:<clave>`).
- **Alta del espacio**: `tenant.json → crm.fields[]` (upsert por clave). Enjoy arranca con `tiene-pantalla`,
  `dj-residente` y `aforo` (`scripts/apply-crm-17.py`); Oquea puede añadir los suyos en su `tenant.json`.
- **Menú**: `src/lib/ui/nav.ts` (`groups`, `navFor`, `sectionTabs`); las pestañas las pinta `AdminLayout`.

## 8 ter. Cómo quedó la fase 2

- **Datos**: `account.parent_id` (grupo, un solo nivel: trigger `account_parent_check`), `account.tags` y
  `crm_contact.tags` (listas: «fbd», «proveedores-bodas»), `crm_contact` (persona) y `crm_contact_account`
  (persona ↔ empresa con `role`), `crm_import` (archivo, mapeo, estado y lo necesario para deshacer). Los campos tienen
  `target` (empresa o persona), `tags` (solo salen en esas listas) e `is_stage` (la etapa: chips en la lista).
- **RLS**: el equipo ve y añade personas y vínculos; edita quien la lleva, quien la creó o un/a gerente (o si no es de
  nadie); borrar personas es de admin o gerente; importar (y crear campos al importar), solo admin.
- **Importar** (`src/lib/crm/import.ts`, puro): `readCsv` → `profileColumns` (dato de serie, campo existente o nuevo
  con su tipo adivinado) → `suggestMapping` (valores sin emojis y variantes unificadas: «DJ/AV» = «DJ + AV») →
  `buildPlan`. Duplicados exactos fuera; personas por email, LinkedIn o nombre + empresa; empresas por nombre (+ ciudad
  al importar empresas); «CEO», «DJ»… en la columna de empresa no crean empresas (pasan a papel o notas); responsables
  por nombre parcial (si no es del equipo, queda sin asignar); ciudades → zonas (las nuevas, dentro del país); lo que no
  encaja en su campo va a notas como «Columna: valor». Al fusionar no se pisa nada: solo se rellenan huecos.
- **Deshacer**: borra lo creado (`import_id`), devuelve lo fusionado a su estado anterior, quita los vínculos nuevos,
  archiva los campos creados y borra las ciudades que quedaron vacías.
- **Servicio**: `admin.crm.*` (`src/lib/crm/service.ts`). Pantallas: `CRM → Empresas | Personas` y, solo admin,
  `Configurar → Datos del CRM → Importar` (`/admin/accounts`, `/admin/people`, `/admin/import`), ficha de empresa con «Grupo y personas», ficha de persona,
  y en *Campos del CRM* las pestañas Empresas / Personas con destino, listas y etapa.
- **Postgres**: las lecturas grandes van por páginas de 1000 (`paged`), porque PostgREST corta ahí.

## 9. Lo que necesito de ti para empezar

1. **El CSV de Notion** (exportación completa, con todas las propiedades) y, si puedes, una captura de la vista de la
   base de datos para ver qué tipo es cada columna.
2. En una línea por propiedad: **qué significa** y si es imprescindible.
3. **Tus etapas** reales del embudo (cómo las llamas tú).
4. **Cómo haces hoy el seguimiento** (qué miras, cada cuánto, qué se te escapa).
5. Para el foco Valencia: **qué zonas y qué tipo de local** son prioridad.

## 10. Seguimiento (fase 3a, hecho)

Pedido de Cristian (9-oct-2026): que la app quite carga mental. Investigar → contactar → cita → propuesta, con el
historial claro y el próximo paso siempre puesto.

- **Contacto de la empresa** (de serie): teléfono, email, Instagram, LinkedIn, web y Google Maps
  (`20261105000000_crm_activity.sql`). En la ficha, botones de un toque (llamar, WhatsApp, email, abrir Instagram…).
  Si la empresa no tiene un dato y su persona principal sí, se usa el de la persona y se dice «de Marta» (empresa
  pequeña: el móvil del dueño). Al importar empresas, Email / Teléfono / Instagram / LinkedIn / Web van aquí.
- **Interacciones** (`crm_activity`): con quién, por dónde (Instagram, LinkedIn, WhatsApp, llamada, email, visita,
  reunión) y qué pasó (sin respuesta, contestó, interesado, no interesado, cita, o solo una nota de investigación).
  Cada uno apunta y borra lo suyo; el equipo lo ve. Apuntar cuenta como contacto (renueva la reserva).
- **Próximo paso** (en la empresa): lo fija el comercial o lo propone la regla (`src/lib/crm/followup.ts`):
  - vías en orden: redes (Instagram, LinkedIn, WhatsApp) → teléfono → email → visita;
  - máximo **3 mensajes sin respuesta por persona**; después la siguiente persona de la empresa (hasta 3);
  - si nadie contesta, **visita en persona**; una respuesta reinicia la cuenta;
  - si contesta o hay interés, se propone seguir en 2 días (manda el comercial); «no interesado» cierra.
- **«Hoy en tus cuentas»** (Inicio): vencido → hoy → mañana de las empresas que llevas, con qué hacer, con quién, la
  última interacción y el contacto a un toque.
- **Arreglo del FBD** (Configurar → Datos del CRM → Importar → Arreglos; solo admin): el Instagram del local guardado en la persona pasa a la empresa.
- Pruebas: `followup.test.ts`, contrato de cuentas (demo y Postgres), `supabase/tests/49_crm_activity.test.sql`,
  `scripts/smoke-followup.cjs`.

**Siguiente** (pendiente de decidir con Cristian): prioridad automática por casillas clave; modo «Investigar» por
zona; Google Places (horario, mapa, ruta del día); primera búsqueda con IA (marcada «sin verificar»); WhatsApp de ida
y vuelta (aviso con mensaje propuesto y, al responder con audio o captura, nueva interacción).

## 11. Prioridad de los leads (hecho)

Criterio cerrado con Cristian (9-oct-2026). Lógica en `src/lib/crm/priority.ts` (pura, probada).

- **Eliminatorios** (no es ponderación, es filtro: salen del ranking con la etiqueta del motivo): sin cobertura móvil ·
  sin pantalla y sin intención (se marca solo al elegir «No y no quiere») · no pueden validar lo que sale (**solo si lo
  han dicho ellos**) · deudas, cierre o viabilidad.
- **Puntuación** (pesos configurables por el admin en *Equipo → Campos del CRM → Prioridad*; suman 100):

  | Criterio (peso) | Tramos (parte del peso) |
  |---|---|
  | Recurrencia (30) · local o sala | noches/semana: 1 → 10 %, 2 → 40 %, 3 → 75 %, 4+ → 100 % |
  | · promotora | eventos/año: 1–2 → 20 %, 3–5 → 45 %, 6–11 → 70 %, 12+ → 100 % |
  | · conciertos | programa recurrente → 100 %, evento único → 20 % |
  | Decide quien te atiende (25) | decide y pisa el local 100 %, decide pero no pisa 35 %, encargado sin firma 20 % |
  | Pantallas (20) | sí 100 %, no pero quiere 40 %, no y no quiere → eliminatorio |
  | Dinámicas o redes (15) | sí 100 %, a medias 50 %, no 0 % |
  | Escala (10) | un local 20 %, 2–3 locales 60 %, grupo o varias salas 100 % |

  El tipo (local, promotora, conciertos) sale del sector (`KIND_BY_SEGMENT`) o se elige con un clic en la ficha.
- **Lo que no se sabe no es 0**: suma solo lo conocido y enseña «hasta N si se cualifica». El ranking ordena por la
  puntuación actual (no por el máximo). Filtro «Sin cualificar».
- **Se enfría**: contestó o mostró interés y llevamos **3 días laborables** sin hacer nada → etiqueta roja y el primero
  en «Hoy». No toca la puntuación (la urgencia es un orden, no una calidad).
- **Un clic**: la cualificación son botones visibles en la ficha; pulsar lo marcado lo desmarca. Cualificar no reserva
  la empresa (RPC `account_qualify`: libre o mía, o un/a gerente).
- Las personas heredan la prioridad de su mejor empresa (lista de Personas, «Por prioridad»).
- **Google Places** (`GOOGLE_MAPS_API_KEY`): «Buscar en Google» en la ficha (eliges el resultado) y «Completar con
  Google» en la lista (hasta 20 por clic, solo si el nombre coincide). Rellena huecos (teléfono, web, dirección, Maps) y
  guarda horario y ubicación (RPC `account_research`; nunca pisa lo escrito a mano).
- Migración `20261106000000_crm_priority.sql`; pruebas `priority.test.ts`, `places.test.ts`, contrato de cuentas,
  `supabase/tests/50_crm_priority.test.sql`, `scripts/smoke-priority.cjs`.

## 12. Ruta del día (hecho)

`/admin/route` (`src/lib/crm/route.ts`, `crm.routePlan`): las visitas que tocan, en el orden más corto.

- **Qué entra**: mis empresas con próximo paso «Visita» vencido o para hoy. O las que elijas en Cuentas (casillas →
  «Ruta con estas», hasta 20 paradas). Desde «Hoy» en Inicio sale el botón «Ruta del día» cuando hay visitas.
- **Orden**: primero por cercanía; con `GOOGLE_MAPS_API_KEY`, la Routes API (`computeRoutes` con
  `optimizeWaypointOrder`) optimiza las paradas intermedias y da los tiempos reales. Sin Google o si falla, orden por
  cercanía y tiempos a 30 km/h de media (lo dice en pantalla).
- **«Desde donde estoy»**: la ubicación del navegador va en la URL (`?desde=lat,lng`) y la ruta sale de ahí. No se
  guarda.
- **Cada parada**: llegada estimada (tramo + 20 min por visita), horario de hoy de Google con aviso si cierra, la
  puntuación, «Cómo llegar» y «Apuntar» (va al seguimiento de la ficha).
- **Abrir en Google Maps**: la ruta entera en un enlace (`/maps/dir/?api=1`); si hay más de 10 paradas, en tramos.
- Las que no tienen ubicación salen aparte con «Buscar en Google» (ficha → Google Places, §11). Las que Google da por
  cerradas, avisadas y fuera de la ruta.
- Sin migración: usa `lat`, `lng` y `hours` de §11. Pruebas `route.test.ts` y `scripts/smoke-route.cjs`.

## 13. Investigación con IA (hecho)

Pedido de Cristian: «que cuando llegues ya haya un poco de info», pero sin fiarse a ciegas. Un primer repaso en la web
que **propone**; el comercial decide.

- **Dónde**: en la ficha de la empresa, «Investigar con IA» (tarjeta encima de Cualificación). Tarda hasta un minuto.
- **Qué hace** (`src/lib/crm/research.ts`): Claude (`claude-opus-5-5`, esfuerzo bajo, con respaldo automático si se
  niega) busca y lee lo público (web, Google, prensa, agendas) con las herramientas de búsqueda y lectura web, y
  rellena `save_research` (esquema estricto) con: resumen, «para mirar tú» (lo que solo ve un humano: stories,
  ambiente, quién manda), y propuestas de **cualificación**, **contacto de la empresa** y **personas**. Le pasamos el
  nombre, la zona, lo que ya sabemos, el sector (con su ICP y actores) y qué vende el equipo (pitch del playbook).
- **Nada sin fuente**: cada propuesta lleva la frase que la prueba y la URL. `sanitizeResearch` descarta lo que no
  tiene fuente http(s) o prueba, valores fuera de lo permitido, lo que ya está en la ficha y duplicados. La IA no
  puede proponer «decide quien te atiende», «sin cobertura» ni «no pueden validar» (solo los sabe el comercial).
- **Un clic**: Aceptar guarda en la ficha **sin pisar** (cualificación si está sin marcar; contacto si el hueco está
  vacío; persona nueva enlazada a la empresa, con la fuente en sus notas). Descartar no toca nada. Todo «sin
  verificar». Investigar no reserva la empresa.
- **Permisos y coste**: como Google en la ficha (libre, mía o gerente; se comprueba antes de llamar a la IA). Una
  vez cada 2 minutos por empresa y un tope de 40 investigaciones por persona y día (`bump_usage`, §18). Coste aproximado: céntimos por empresa (búsquedas web + tokens).
- **Investigar zona** (Cuentas): marcas empresas (p. ej. filtrando por zona) y «Investigar con IA» en la barra de
  selección. Hasta 20 por clic; el navegador las pide de una en una a `/admin/api/accounts/{id}/research` (cada una
  tarda hasta un minuto, así ninguna petición pasa del límite del servidor) y enseña el progreso. Se saltan las
  investigadas en los últimos 30 días y las de otro. Filtro «Investigadas por IA» (las últimas primero) y marca «IA»
  en la lista para repasar las propuestas.
- **Configuración**: `ANTHROPIC_API_KEY` en Vercel (sin ella, la tarjeta lo dice y no hay botón). Para las pruebas
  automáticas, `AI_RESEARCH_FIXTURE=1` usa una respuesta fija sin llamar a nadie.
- Migración `20261107000000_crm_ai_research.sql` (`account.ai_research`, RPC `account_ai_research`); pruebas
  `research.test.ts`, contrato de cuentas, `supabase/tests/51_crm_ai_research.test.sql`, `scripts/smoke-ai-research.cjs`.

## 14. Ordenar ciudades (hecho)

El campo «Ciudad» del Notion mezclaba ciudades, notas («Barcelona, creo que están en Valencia»), varias ciudades
(«Madrid / Marbella»), códigos postales y columnas descolocadas («Account Executive»). La importación creó una zona
por cada texto (166 distintos). Criterio de Cristian (10-oct-2026):

- **Comunidad › Provincia › Pueblo**: filtrar «Valencia» saca también Requena, Gandía… El pueblo que es la capital va
  en su provincia. Fuera de España, País › Ciudad. Se reutilizan las zonas que ya hay (mismo nombre bajo el mismo padre).
- **Dudosas**: si la nota dice que es otra ciudad, va donde dice la nota y queda en la lista **«revisar-ciudad»**.
- Lo que sobra del texto pasa a las notas de la empresa («Ciudad en el Notion: …»). Lo que no es un sitio: sin
  ciudad, con el texto en la nota y en «revisar-ciudad».

Pantalla **Configurar → Datos del CRM → «Ciudades»** (`/admin/ciudades`; la dirección antigua redirige). Importar,
Ciudades y Campos están juntos ahí y **solo los ve y usa el admin** (permiso `importCrm`; ni gerente ni comercial),
para que nadie más descoloque los datos de todos.
Arriba, **Pendiente**: cuatro filas, cada una con ✓ si está hecho o con su botón — textos de «Ciudad» sin ordenar
(«Analizar con IA»), empresas en «revisar-ciudad» («Verlas»), empresas sin ciudad («Verlas» → filtro «Sin ciudad»,
`zona=ninguna`) y ciudades vacías («Borrar»); debajo, el último arreglo con «Deshacer». Abajo, **Tus ciudades ahora**:
el árbol con «Revisar con IA» y «Ajustar». «Sin ordenar» (`isUnordered`) = arriba del todo sin ser un país, una
ciudad colgando directamente de España, o un nombre con números, paréntesis, barras, comas o en MAYÚSCULAS: lo ya
ordenado no vuelve a contarse como pendiente.

Cómo (`src/lib/crm/zones-normalize.ts`):

1. **Analizar con IA**: los textos con empresas van a Claude por trozos de 60 (desde el navegador, con progreso).
   Devuelve país, comunidad, provincia, pueblo, nota y si es dudosa (esquema estricto; nada que no se haya pedido).
2. **Vista previa**: cada destino con sus textos, empresas, nota y ⚠. Lo desmarcado se queda como está.
3. **Aplicar**: crea las zonas que faltan y mueve las empresas en bloque (RPC `crm_move_accounts`). Guarda el antes en
   `crm_fix` para **Deshacer** (zona, notas y listas de cada empresa; borra las zonas creadas si quedan vacías).
4. **Borrar ciudades vacías**: las que no tienen empresas ni nadie asignado (sin deshacer).

**Terminar** (misma pantalla, sección «Tus ciudades ahora»): el árbol con sus empresas y, por zona, «Ajustar»
(nombre, tipo, dentro de… o **juntar con…**). «Revisar con IA» propone juntar duplicados con otro nombre
(«Gerona» y «Girona»), tipos mal puestos (un país como ciudad), renombrar o mover; se marcan y se aplican. Juntar A con
B lleva a B sus empresas, sus pueblos (si B ya tiene uno igual, también se juntan) y a quien tenía A asignada; A se
borra. Renombrar o mover encima de otra igual = juntarlas. Estos ajustes no tienen botón de deshacer (se corrigen a mano
ahí mismo). Para revisar producción sin tocar nada: workflow «Producción» → `informe-crm` (`scripts/crm-report.sql`).

Migración `20261110000000_crm_fix_zones.sql`; pruebas `zones-normalize.test.ts`, contrato de cuentas,
`supabase/tests/54_crm_fix_zones.test.sql`, `scripts/smoke-zones.cjs`.

## 15. Google bien hecho en la ficha (hecho)

Criterio de Cristian (10-oct-2026): «Completar con Google» en bloque era contraproducente (cogía el primer resultado a
ciegas). Ahora es **en la ficha de cada empresa**, eligiendo a mano:

- **Buscar en Google** (tarjeta «Ficha de Google», en Contacto): busca por nombre + ciudad; el texto se puede cambiar.
  Hasta 5 resultados, cada uno con foto, nombre (abre su ficha de Google), tipo, ★ valoración y reseñas, dirección,
  **web clicable** y teléfono.
- **Es este**: guarda teléfono, web, dirección, Maps, horario, ubicación, valoración, reseñas y foto; **pone la ciudad**
  si no tiene (solo zonas que ya existen: pueblo → provincia → comunidad → país, `zoneForPlace`) y **mira su web** una
  vez (`src/lib/crm/website.ts`) para apuntar Instagram, Facebook, LinkedIn y email que la propia web enlaza. Todo
  rellena huecos: nada escrito a mano se pisa. El aviso dice qué se ha rellenado.
- **Google vs. IA**, explicado en pantalla: Google = los datos públicos de su ficha de Maps (rápido y exacto); la
  investigación con IA lee su web, redes y prensa y propone qué es, a quién contactar y por qué encaja (hasta un minuto,
  cada dato se acepta a mano).
- La foto se sirve por `/admin/api/crm/place-photo` (el servidor pide a Google la dirección pública; la clave no sale).
- Mirar la web: solo http(s) con nombre público (sin IPs, puertos raros ni nombres internos; el DNS no puede apuntar a
  la red interna, también tras redirecciones), 6 s y 800 KB como mucho; si falla, no pasa nada.
- Pruebas: sin clave y con `AI_RESEARCH_FIXTURE=1`, Google y la web son de mentira (`fixturePlaces`, `fixtureWebsite`).

- **«Este no era»**: con una ficha elegida, la tarjeta lo dice («Elegida») y en los otros resultados el botón es
  «Cambiar a este». Al cambiar, se quita lo que rellenó la ficha anterior (apuntado en `place_filled`) **solo si sigue
  igual** — lo corregido a mano se queda — y se rellena con la nueva. «Quitar ficha» hace lo mismo sin poner otra.
- **En segundo plano**: buscar, «Es este», quitar, investigar con IA, aceptar/descartar sus propuestas y cualificar no
  cambian de página. Se mandan por detrás (formularios `data-async`, mecanismo general en `AdminLayout`), se puede seguir
  usando la ficha, y al acabar se actualizan solo las partes afectadas y un aviso abajo dice el resultado. Investigar
  con IA avisa mientras trabaja («te aviso al acabar»).

Migraciones `20261113000000_crm_google.sql` y `20261114000000_crm_google_redo.sql` (Facebook, valoración, reseñas y foto; `account_research` con ciudad, email
y redes); pruebas `places.test.ts`, `website.test.ts`, `supabase/tests/56_crm_google.test.sql`, `scripts/smoke-google.cjs`.

## 16. Mapa (hecho)

**Empresas → «Lista | Mapa»** (`/admin/accounts/mapa`; `/admin/map` redirige): el mapa es otra forma de ver la lista,
no otra sección. Pasa de una a otra con los mismos filtros (ciudad, estado, alcance) y añade temperatura y color.
Leaflet + `leaflet.markercluster` (`src/lib/crm/map.ts`).

- Cada empresa es un **punto con el icono de su tipo** (local o sala, promotora, conciertos; sin tipo: tienda), en su
  **sitio exacto** (ficha de Google) o, si no tiene, en el **centro de su ciudad** (borde discontinuo: aproximada).
  Color por estado; **borde naranja** = caliente (cualificada, prioridad ≥ 60, sin enfriarse); **claro** = se enfría o
  está fuera. Al tocarlo: tipo, ciudad, estado, prioridad, valoración, próximo paso, quién la trabaja y **Abrir ficha**.
- **Grupos con número**: al tocar uno, el mapa se acerca hasta que se separa; si están todos en el mismo punto (las de
  una ciudad sin ficha de Google), se abren en abanico. Nada de tocar diez veces.
- Las ciudades se sitúan una vez: el admin pulsa **Situar ciudades en el mapa** (Google, por tandas; `zone.lat/lng`,
  migración `20261115000000_crm_map.sql`).
- **Por comercial de la zona** (admin y gerentes): color según quién lleva la zona (la asignación más cercana subiendo:
  ciudad → provincia → comunidad), con leyenda y «Zona sin asignar».
- **Fondo del mapa**: con `MAPTILER_KEY` en Vercel, MapTiler (estilo «Dataviz»); sin ella, OpenStreetMap. La clave de
  MapTiler es pública (va en el navegador): se protege con «Allowed HTTP Origins» = tu dominio. Como la consola manda
  `no-referrer`, el fondo del mapa pide sus imágenes con `referrerPolicy: strict-origin` (solo el dominio): sin eso
  OpenStreetMap responde «Access blocked» y MapTiler rechaza la clave restringida.

- **Filtro de lugar en cascada** (Empresas y mapa; `src/components/crm/PlaceFilter.astro`): País → Comunidad →
  Provincia (sin pueblos). Cada desplegable enseña solo lo que hay dentro del anterior y el filtro es el más concreto
  elegido, con todo lo de dentro. «Sin ciudad» va en el primero.

Pruebas: `map.test.ts`, `supabase/tests/57_crm_map.test.sql`, `scripts/smoke-map.cjs`.

## 17. Limpiar: empresas, DJs y descartadas (hecho)

Criterio de Cristian (10-oct-2026): muchas «empresas» del Notion y de las ferias son DJs que trabajan por su cuenta,
y otras no son del sector (o son del sector pero no clientes: tiendas, productoras de visuales…). No se borran: se
separan y se descartan con motivo, para poder recuperarlas (p. ej. para una alianza).

- **Tipo** de cada empresa: «Empresa» o «DJ o artista» (`account.kind`). En Empresas, pestañas **Empresas · DJs ·
  Descartadas** (`?tipo=`), con su número; el mapa usa la misma pestaña.
- **Descartar** (ficha → «Descartar»): motivo (no es del sector, posible alianza, duplicada, cerrada, otro) y nota.
  No sale en la lista ni en el mapa; está en «Descartadas» con su motivo y se **recupera** con un clic. Cambiar el
  tipo no recupera una descartada. RPC `account_classify` (quien puede editarla).
- **Limpiar con IA** (Configurar → Datos del CRM → Limpiar, solo admin; `src/lib/crm/cleanup.ts`): la IA revisa las
  empresas por tandas de 40 (tres a la vez, desde el navegador) con lo que vende el equipo y sus sectores, y propone
  DJs y descartes con su porqué. Vista previa por grupos, se desmarca lo que no convence, se aplica (RPC
  `crm_classify_accounts`, solo admin) y se **deshace** (`crm_fix` kind `classify`).

Migración `20261116000000_crm_kind_discard.sql`; pruebas `cleanup.test.ts`, `supabase/tests/58_crm_kind_discard.test.sql`,
`scripts/smoke-cleanup.cjs`.

## 18. Seguridad y permisos de los datos del CRM (checkpoint 10-oct-2026)

Revisión completa en `docs/SECURITY_REVIEW.md`. Lo que afecta al CRM:

- **Importar, Ciudades, Limpiar y Campos** (Configurar → Datos del CRM): solo admin, en la app (`importCrm`) **y** en la
  base de datos (`crm_move_accounts`, `crm_classify_accounts`, política `crm_fix_admin`; migración
  `20261117000000_security_hardening.sql`). El CSV de Territorio también es solo admin.
- **Enlaces**: web, Maps, Instagram, Facebook y LinkedIn solo `http(s)://` (restricción en la tabla) y la pantalla los
  pinta con `safeHref` (`src/lib/safe-href.ts`); lo que trae la IA sin fuente http(s) se descarta al leerlo.
- **Topes por persona y día**: 300 búsquedas de Google y 40 llamadas a la IA (`usage_counter` + `bump_usage`). Al
  pasarse: «Has llegado al tope de hoy; mañana puedes seguir».
- **Webs de las empresas**: se leen sin seguir a direcciones internas, comprobando la IP al conectar (no solo al
  resolver), para que una web no pueda apuntar al servidor.

## 19. Buscar clientes por zona (hecho)

Criterio de Cristian (11-oct-2026): ir cubriendo España por tipo de cliente y zona («discotecas» en Valencia, «centros
de buceo» en Murcia), sin IA y sin duplicar. Lo que no está en Google se sigue dando de alta a mano.

**Empresas → «Buscar clientes»** (`/admin/accounts/buscar`; `src/lib/crm/prospect.ts`, servicio `prospect*`):

1. **Qué** (texto libre; se recuerdan las búsquedas anteriores) + **dónde** (cualquier zona del espacio) + sector
   opcional. Se pide a Google Places «qué en zona, región, país», con el punto de la zona como preferencia (radio
   según su tamaño). Hasta 3 páginas de 20 = 60 sitios; cada página cuenta para el tope diario de Google.
2. La búsqueda se **guarda** (`crm_sweep`, con lo que devolvió Google): se revisa sin volver a pagar y queda en el
   historial («discotecas · Valencia · 12 encontrados · 9 importados», quién y cuándo). Si se repite, avisa.
3. Cada sitio sale marcado: **Nueva** (marcada) · **Ya la tienes** (misma ficha de Google o importada antes; no se
   puede marcar) · **¿Ya la tienes? Se llama igual** (sin marcar, con enlace) · **Cerrado en Google** (sin marcar).
4. **Importar** (por tandas de 6 desde el navegador, con progreso): cada sitio pasa a ser una empresa con su **ficha
   de Google ya elegida** (teléfono, web, dirección, Maps, horario, ubicación, valoración), su ciudad (por la
   dirección; si no, la zona buscada), el sector, la lista de lo buscado (`discotecas`) y las **redes y el email de su
   web**. Se asignan **a quien importa**; un admin o gerente puede dejarlas libres o dárselas a alguien del equipo.
   **«¿Ya la tienes? Se llama igual»**: si es la misma, **«Es la misma: unir»** le pone esa ficha de Google a la empresa
   que ya tenías (como elegirla en su ficha: rellena huecos, cambia la ficha anterior si la había, lo de a mano se
   queda, y lee su web); si es otra, se marca y se importa.
5. Después, **«Investigar con IA»** lo recién importado (hasta 20) y **«Ver en Empresas»** (filtrado por la lista).
   En la ficha ya no hace falta «Buscar en Google»: el siguiente paso es la investigación con IA.

**Investigar con IA en segundo plano** (aquí y en «Investigar zona» de la lista): la lista se guarda en el navegador
(`localStorage`, por espacio) y la consola la va investigando, tres a la vez, **en cualquier página**; el progreso sale
abajo («Investigando con IA: 12 de 20») y al acabar, el resumen con «Ver». Si se cierran todas las pestañas, sigue al
volver; lo que quedó a medias espera 90 s (puede seguir en el servidor) y si ya terminó se salta. Una sola pestaña
trabaja; las demás enseñan el progreso. Al llegar al tope diario de IA se para.

Permisos: cualquiera del equipo interno busca e importa (un comercial, siempre para sí); un partner no ve nada; borrar
búsquedas, solo admin. Migración `20261118000000_crm_prospect.sql`; pruebas `prospect.test.ts`, contrato de cuentas
(demo y Postgres), `supabase/tests/60_crm_prospect.test.sql`, `scripts/smoke-prospect.cjs`.


## 20. Apuntar con IA (hecho)

Criterio de Cristian (11-oct-2026): al salir de un sitio, contarlo (escrito o dictado) y que vaya solo a su ficha,
en vez de apuntarlo en un chat consigo mismo. Primer paso de «hablar con el CRM»; después, MCP o WhatsApp.

**Empresas → «Apuntar»** (`/admin/accounts/apuntar`; `src/lib/crm/notes.ts`, servicio `notesSplit` / `notesApply`):

1. Se escribe o se dicta (en el móvil, el micrófono del teclado) lo visto en uno o varios sitios, hasta 12 000
   caracteres.
2. **Una llamada a la IA** lo separa por sitio: la nota de cada uno con sus palabras (sin muletillas, sin inventar), si
   fue visita, llamada…, cómo fue, el día si lo dice, lo que se puede marcar en la **cualificación** (solo lo claro;
   «sin pantalla» sin más no se marca como «no quiere», que lo sacaría del ranking) y el **próximo paso** si lo dice.
   Lo que no es de ningún sitio no se guarda. La IA no guarda nada ni ve el CRM.
3. **Sin IA**, cada sitio se busca en el CRM por el nombre (sin tildes; uno dentro del otro; casi igual, para el
   dictado: «Ghecko» ~ «Gecko Valencia»; palabra a palabra). Si se parece ≥ 80 %, sale elegida; si no, «No guardar» o
   «Crear empresa nueva».
4. Se revisa (a qué empresa va, la nota, lo que se marca, el próximo paso) y **«Guardar todo»**: en cada empresa, la
   interacción con la nota, lo marcado en la cualificación (sin quitar lo que ya tenía) y el próximo paso. Cada sitio
   va por su cuenta: si uno no se puede (p. ej. es de otro comercial), se dice y los demás se guardan.

**Cada cosa en su sitio** (criterio de Cristian: lo que cuenta el comercial es lo más valioso, no «un apartadito de
notas»). De cada sitio, la IA separa:
- **Interacción** → historial de la empresa: lo que ha pasado con ellos (la visita, el mensaje que les mandó, qué
  contestaron). Si solo fue a mirar: «Visita: solo observar». Con canal y resultado, para que la regla de seguimiento
  proponga el siguiente paso (p. ej. «no contestó» → volver a escribir en 3 días).
- **Lo que sabemos** → tarjeta arriba de la ficha (`account.facts`, migración `20261119000000_crm_facts.sql`): un dato
  por línea, sin resumir (cómo es el sitio, pantallas, DJ, aforo, cola, público…), con su fecha y quién lo dijo; y
  aparte **qué le encaja**. Se añade y se quita a mano desde la ficha; crece con cada visita (lo nuevo arriba).
- **Campos de la ficha del espacio** (p. ej. Aforo: 500): la IA ve los campos de ese espacio y propone valores; se
  validan con su tipo antes de enseñarlos.
- Cualificación y próximo paso, como antes.

**Doble seguro para no equivocarse de empresa** (criterio de Cristian): la IA solo separa y ordena el texto; **a qué
empresa va lo decide el código** (búsqueda por nombre que tolera el dictado) y lo confirma la persona. Además,
**opcional, arriba: «¿De qué empresa vas a hablar?»** con autocompletar (nombre y «Comunidad Valenciana › Valencia»,
sin IA, `/admin/api/crm/account-search`): si se elige, todo lo contado va a esa empresa. Por eso basta un modelo
pequeño: **Claude Haiku 5.5** (`NOTES_MODEL`), ~40 veces más barato que Opus.

Acceso: botón flotante **✨ Apuntar** en toda la consola (quien trabaja el CRM). En Empresas, la cabecera queda en
«Lista | Mapa» y **«Añadir ▾»** (nueva empresa · buscar en Google Maps · importar, solo admin).

Permisos: los de siempre (sesión y RLS); cuenta para el tope diario de IA. Pruebas: `notes.test.ts`, contrato de
cuentas (demo y Postgres), `scripts/smoke-notes.cjs` (en el móvil).

**Ficha de Google ya elegida**: la búsqueda queda escondida tras «¿No es esta?»; «Quitar ficha» va en rojo y pide
confirmación (dice qué quita y qué no).

**Sin esperas de más** (criterio de Cristian): la forma de página (shimmer) solo sale si una página tarda más de 1,2 s;
los formularios con `data-no-progress` no la enseñan (p. ej. «Entender» en Apuntar: el botón dice que trabaja). En
Empresas, buscar y filtrar no recarga la página: el formulario lleva `data-async-get="kind-tabs acc-results"` y solo
se cambian los resultados (la URL se actualiza); mientras se escribe, lo que ya se ve se filtra al momento.


## 21. Tipos de cliente por espacio (hecho)

Antes «Empresa / DJ» estaba fijo para todos los espacios; ahora **cada espacio define sus tipos** (Enjoy: Empresas y
DJs; un centro de buceo: Centros y ONGs). Se editan en **Datos del CRM › Campos › Tipos de cliente** (solo admin):
nombre, plural (el de la pestaña) e icono, hasta 12.

- **El principal** (clave `company`) es el primero: no se quita, solo se renombra, y es el de las empresas nuevas.
- **Tipo nuevo**: la clave sale del nombre («ONG» → `ong`) y no cambia aunque se renombre después.
- **Quitar un tipo**: sus empresas pasan al principal (no se pierde nada).
- Se usan en las pestañas de Empresas y el mapa, el alta («Tipo»), Buscar clientes («Importar como»), el cambio de
  tipo en la ficha (solo si hay más de uno) y Limpiar (la IA propone entre los tipos del espacio).

Datos: `crm_settings.kinds` (jsonb). `account.kind` acepta cualquier clave con formato; `account_classify` y
`crm_classify_accounts` comprueban con `crm_kind_ok` que el tipo existe en el espacio (si no, «Tipo no válido»). La
migración `20261120000000_crm_kinds.sql` deja a cada espacio con «Empresa» y, a Enjoy (o a quien ya tuviera DJs),
también «DJ o artista».

Pruebas: contrato de cuentas (demo y Postgres), `supabase/tests/58_crm_kind_discard.test.sql`,
`scripts/smoke-kinds.cjs`.

### 20.1 «Lo que sabemos» por importancia y tamaño del local (hecho)

Feedback de Cristian tras probarlo con sus notas de Valencia:

- **Menos texto, por importancia.** La IA junta en un mismo punto lo del mismo tema (pantallas: cuántas, dónde y qué
  ponen; música y DJ; público…) sin perder detalle, y lo ordena de más a menos importante. Aparte, **«Lo más
  importante»** (1–3 puntos, `key_facts`): en la ficha salen arriba como **tarjetas grandes**; luego «Qué le encaja»;
  luego 5 puntos y el resto plegado («Ver N datos más»). Con la ★ se destaca o se quita cualquier punto; al añadir a
  mano se puede elegir «Importante». En la revisión de Apuntar, «Lo más importante» es su propia caja, editable.
  Datos: `AccountFact.key` (en el mismo jsonb `account.facts`, sin migración).
- **Tamaño del local** (pequeño · mediano · grande): fila propia en Cualificación, **no puntúa**. Lo rellenan Apuntar
  y la investigación con IA. El criterio que antes se llamaba «Escala» ahora se llama **«Locales que tiene»** (uno,
  2–3, grupo): mide cuántos locales tiene el dueño, no el tamaño.
- «Qué es» va con la misma forma que el resto de filas (título arriba y opciones debajo, a la izquierda).

## 22. Ficha de la empresa, ronda de ruta (hecho)

Criterio de Cristian tras hacer ruta por Valencia (11-oct-2026). Fases: **A** cualificación nueva (hecho), **B**
«Trabaja con», **C** encaje por paquete y Fidelización en preventa, **D** reordenar la ficha.

**A · Cualificación nueva.**
- **«Cómo es»** (no puntúa) arriba de la tarjeta: **Formato** (discoteca, pub o bar de copas, cóctel bar, rooftop o
  terraza, restaurante que acaba en fiesta, sala de conciertos, hotel o beach club, promotora, conciertos o artista),
  **¿Hay fiesta?** (es su negocio · algunas noches · no), **Tamaño del local**, **DJ** (residente · invitados ·
  residente e invitados · sin DJ) y **¿Trabajan promotoras aquí?**. El formato sustituye al antiguo «Qué es» y decide
  cómo se mide la recurrencia (promotora por eventos al año; un local por **noches con fiesta o música alta**). Lo
  antiguo (`kind`) se sigue leyendo. **El formato es de varios** (`format` puede ser una lista): una sala de conciertos
  que cuando acaba el concierto sigue con DJ residente es «Sala de conciertos + Pub». Si alguno de sus formatos es un
  local, se mide como local (lo que vendemos entra por el DJ de la noche). Apuntar lo puede devolver junto («hall,pub»)
  y se suma a lo que ya tenía.
- **Sin pantalla ya no elimina**: solo no suma los puntos de pantalla (le pueden encajar peticiones, fotos o
  fidelización). Eliminatorios: sin cobertura, no pueden validar o deudas (un cierre es un motivo de descarte, no un eliminatorio).
- **Promotoras, pestaña aparte** en Enjoy (como los DJs); las del sector «Promotoras» pasan a ella.
- «¿Tiene DJ residente?» de la ficha pasa a la cualificación (migración `20261122`, archivado y recuperable).
- Apuntar e Investigar con IA rellenan formato, fiesta, DJ y promotoras.

**B · «Trabaja con».** En la ficha (bajo «Grupo y personas»): enlazar con promotoras, DJs (residentes o invitados) u
otros locales, con una nota («los jueves en la terraza»). Se escribe el nombre: si ya está en el CRM se enlaza esa
(sin duplicar); si no, se crea del tipo elegido (Promotora por defecto) en la ciudad del local. Se ve desde los dos
lados y es distinto del **grupo** (el dueño de varios locales). Datos: `account_link` (una fila por pareja, sin
orden; RLS del espacio; se borra con la empresa). Migración `20261123`; pruebas: contrato, `63_account_link.test.sql`
y `smoke-crm.cjs`.

**C · Encaje por paquete.** De «Cómo es» sale qué le encaja: **Pantalla en vivo** (pantallas), **Peticiones de
canciones** (tiene DJ residente o invitados; o hay fiesta: «puede»), **Fotos y álbum de la noche** (cuida sus redes) y
**Fidelización** (sellos en un pase: copas, chupitos o visitas; encaja si la clientela repite: 2 o más noches con
fiesta). El criterio de 20 puntos que antes era solo «Pantallas» es ahora **«Encaje con lo que vendemos»**: puntúa el
mejor paquete (encaja = entero, puede = la mitad). La Fidelización está en **preventa** (llega este mes): su etiqueta
dice si encaja, pero en la nota cuenta la mitad. Pendiente: las condiciones de la preventa (precio, qué incluye) para
el argumentario; el contenido de Enjoy aún dice que la fidelización no se vende.

**D · Orden de la ficha.** Arriba, un **resumen**: la nota, qué le encaja y el próximo paso (lleva al seguimiento), con
saltos a cada parte (Lo que sabemos · Cualificación · Seguimiento · Con quién · Datos): en el móvil la ficha es larga.
La «Ficha» (campos del espacio) baja después de «Grupo y personas»; lo demás, igual.

## 23. El comercial en la calle (móvil)

Criterio de Cristian haciendo ruta (11-oct-2026).

**E1 · País y filtros que se recuerdan.**
- Filtro de lugar **País → Provincia** (sin comunidad; lo que cuelga del país sin provincia, como Madrid, cuenta
  como una). `src/lib/accounts/places.ts`.
- **Filtros recordados** en lista y mapa: si se llega sin filtros en la URL (menú, «← Empresas», volver), se usan los
  de la última vez (cookie de este navegador, 90 días). `?todo=1` = sin filtros a propósito.
- **Tu país por defecto** la primera vez, si no tienes zona asignada (con zona, «Mi zona» ya acota): el último
  elegido, el de tu zona o el único que hay. En «Buscar clientes», el sitio por defecto es el de la última búsqueda.

**E2 · Descartar en la calle.**
- Motivos nuevos (los de quien visita, primero): **No encaja con lo que vendemos**, **No les interesa**, **Mejor no
  ir** (p. ej. el dueño trata mal), además de cerrada, no es del sector, alianza, duplicada y otro. Migración
  `20261124`.
- En la ficha, **«No encaja · descartar»** discreto al pie del resumen: pide el motivo (botones grandes) y una nota.
- **Apuntar lo propone**: si por lo que cuentas habría que descartarla, la revisión dice «Por lo que cuentas,
  deberíamos descartarla: mejor no ir» y pregunta; solo se descarta si marcas «Sí, descartarla».
- **En el mapa, las descartadas salen en gris con su motivo** (para que nadie vaya sin saberlo); se pueden ocultar.

**E3 · La ficha en la puerta del local.** En el resumen de arriba, lo que hace falta allí: **Apuntar aquí** (abre
Apuntar con esa empresa ya elegida, sin buscarla), **Cómo llegar** (su ficha de Google o la búsqueda en Maps),
**Llamar**, **WhatsApp** e **Instagram** si los tiene, y **«Pregunta por»** la primera persona con su papel. Apuntar
guarda lo que llevas escrito en este móvil (si sales a mirar algo y vuelves, sigue ahí) y lo borra al guardar.

## 24. Fichas por tipo: local, promotora y DJ

Criterio de Cristian (12-oct-2026): «una promotora no es una empresa normal». Por debajo comparten la empresa (dueño y
reserva, historial, próximo paso, personas, «Trabaja con», propuestas); por encima, **cada tipo tiene su ficha**:
`crm_settings.kinds[].profile` = `venue` · `promoter` · `dj` (se elige en Campos › Tipos de cliente). Migración
`20261125`: Enjoy, DJs con ficha de DJ y Promotoras con ficha de promotora.

- **Promotora:** primero **«Dónde hace fiestas»**: cada sala con **días** (L–D, lo habitual; nunca es exacto),
  **frecuencia** (habitual · esporádico · alguna vez) y nota; arriba la frase «Viernes en Sala X · Sábados en Y». Su
  cualificación: estilo (varios: internacional, Erasmus/universitaria, comercial, latina/reggaetón, pop/indie/revival,
  LGTBIQ+, tardeo, techno/underground, cartel de DJs), ¿dinámicas, juegos o concursos? (35), estilo (20; techno o
  «cartel de DJs» solos no puntúan y avisan: se suelen descartar), fiestas al mes (20), ¿cuida el contenido? (15),
  ¿la ves llevando Enjoy a sus salas? (10). Le encaja: peticiones, pantalla y dinámicas, fotos y álbum (**no**
  fidelización). Contacto: Instagram, TikTok y WhatsApp (sin Facebook ni Google Maps); varias personas.
- **DJ:** «Dónde pincha» (residente o invitado, con días). Cualificación: ¿residente donde nos interesa? (40),
  seguidores (25; da su **caché**: a uno grande no le vale «lo que genere tu local», a uno residente sí), ¿quiere
  darse a conocer? (20), estilo (15). Contacto: Instagram, TikTok, WhatsApp y Spotify/SoundCloud.
- **Local:** como estaba (§22–23).
- **Enlazar, buscando primero** (igual desde un local que desde una promotora o un DJ): al escribir salen las que ya
  tienes («Ya en tu CRM · Promotora · Valencia», tolera nombres a medias o mal escritos); elegir una la enlaza sin
  duplicar. Si no está, «Crear «X» nueva» y solo entonces se elige qué es. Sin elegir, no se envía.
- **Apuntar** sabe qué es cada cosa (local, promotora o DJ): «Roneo hace los viernes en Sala X» → Roneo, promotora,
  con «Sala X · viernes · habitual». En la revisión: «Es: Promotora» (si se crea nueva) y los enlaces a crear,
  marcados; al guardar, se crea con su ficha y se enlaza (la sala que no exista, se crea). Rellena también las
  preguntas de promotora y de DJ.
- Datos: `account_link.days/freq/role`; `account.tiktok/music_url`. La nota de cada ficha: `src/lib/crm/profiles.ts`
  y `score.ts`.

**Pendiente (decidido no hacerlo aún):** la promotora como «comercial» de Enjoy: gratis si consigue que sus salas se
suscriban y un porcentaje de lo que genere cada sala los primeros 6 meses. Haría falta llevar qué salas trae cada
promotora y engancharlo con Comisiones.

## 25. Titular: razón social, CIF y grupos que se proponen

Idea de Cristian: la sociedad que hay detrás de un local suele estar en el aviso legal, la privacidad o los términos de su
web (p. ej. Tulum Eventos y el grupo Cosmic). Con eso se ve qué locales son del mismo dueño.

- **Dónde se guarda:** `account.legal_name` y `account.tax_id` (migración `20261126_account_legal`). Solo el CIF de
  una sociedad: el DNI/NIE de una persona (un autónomo) es un dato personal y la base de datos lo rechaza.
- **De dónde sale:** al mirar la web (elegir su ficha de Google, «Es la misma» o el alta desde Buscar clientes), además
  de la portada se abren hasta 2 páginas legales enlazadas desde ella (aviso legal primero), con las mismas protecciones
  (solo su misma web, sin direcciones internas, 10 s en total). El CIF tiene que cuadrar con su dígito de control; la
  razón social es la que acaba en S.L./S.A./… más cerca del CIF. Solo rellena lo que falte: lo escrito a mano manda.
  También se puede escribir en «Editar contacto».
- **Ficha:** «Titular: Ocio Cosmic, S.L. · B12345678» en Contacto. En «Grupo y personas», si otras empresas tienen el
  mismo CIF o la misma razón social (y no un CIF distinto), sale «Mismo titular» con ellas y el botón «Juntarlas en el
  grupo «…»»: el grupo que ya tenga alguna (o esta, si es grupo); si no, uno nuevo con el nombre de la sociedad. Nunca se
  juntan solas: un grupo puede tener varias sociedades (una por local) y eso no se detecta.
- **Pendiente:** una lista en Limpiar con todas las coincidencias para juntarlas de una vez.

Pruebas (§25): `website.test.ts` (lector, CIF, enlaces legales, redirecciones), contrato «titular», SQL `65_account_legal`
y `smoke-google.cjs` (titular y «Mismo titular»).

## 26. Grupo, personas y «Trabaja con»: tres tarjetas; el grupo se busca

Pedido de Cristian: en la ficha estaba todo junto y el grupo no se buscaba (había dado de alta «Grupo Cosmic» y no salía).

- **Tres tarjetas**: Grupo (solo locales), Personas (con sus listas) y Trabaja con.
- **El grupo se busca** (`GroupPicker.astro`), como «Trabaja con»: al escribir salen los que ya están en el CRM
  («Ya en tu CRM · Valencia»); si no está, «Crear el grupo «X»». Sin elegir no se envía (así no se repiten grupos).
- **Grupos de su ciudad**: debajo, los grupos con locales (o ellos mismos) en la misma ciudad que la empresa (un barrio
  cuenta como su ciudad), con más locales allí primero. Un grupo es una empresa con locales dentro o que se llama
  «Grupo …». Un grupo nuevo se queda en la ciudad de su primer local, para que lo vean los demás de allí.
- **Al dar de alta** una empresa: «¿Es de algún grupo?» (opcional, mismo buscador).
- **Soltar en bloque** (lista de empresas): seleccionar las que se ven (o todas las tuyas con los filtros) → «Soltar»;
  solo suelta las tuyas (`accounts.releaseMany`).
- Pruebas: contrato (soltar en bloque), `smoke-crm-people.cjs` (buscar, crear, sugerido por zona, alta con grupo,
  soltar todas).

## 27. Rendimiento de los flujos del comercial (hecho)

Medido leyendo el código flujo a flujo (ficha, lista, mapa, Apuntar, Hoy, Buscar). Lo hecho, con sus reglas en
`docs/DESARROLLO.md` §3:

- **Ficha**: unas 40 consultas en 6 tandas seguidas → una tanda en paralelo; lo repetido (la empresa ×4, zonas ×3,
  miembros ×3, enlaces ×2) sale de la caché por petición; «Grupo» ya no carga todas las empresas enteras (índice).
- **Lista**: no carga todas las personas para el desplegable de listas; nombres de grupo solo de lo que se ve;
  sectores sin el mapa de mercado.
- **Mapa**: las activas y las descartadas a la vez; «se enfría» con una fila por empresa (vista
  `crm_last_activity`, migración `20261127`) en vez de todas las interacciones; nota según el tipo (§24).
- **Hoy**: igual con «se enfría»; el «lo último que pasó» solo de las que salen hoy.
- **Apuntar**: tras guardar, solo los nombres (antes, la ficha entera de cada una); mientras piensa, dice lo que va
  haciendo (leer, separar por sitio, buscar en el CRM, cualificar, pulir).
- **Pendiente** (medir antes): partir `crm/service.ts` (~1600 líneas) por secciones; un `?part=` para que los
  formularios `data-async` no pinten la página entera; histórico de la ficha en *server island*.

## 28. Mapa: solo lo que tiene sitio exacto; deshacer «Situar ciudades»; grupos más pequeños

Pedido de Cristian: muchas empresas importadas (FBD, eventos…) solo tienen «Valencia» y se amontonaban en el centro de
la ciudad (un abanico de 123); y el botón «Situar 108 ciudades en el mapa» no se entendía.

- **Por defecto, solo las que tienen su sitio exacto** (ficha de Google). Las demás se cuentan («N sin ficha de Google:
  no salen») y se pueden ver con el filtro «Sin ficha de Google → En el centro de su ciudad» (`?aprox=1`).
- **«Situar ciudades»** (solo admin, como antes) busca en Google el punto de cada ciudad; ahora solo sale si se piden
  ver las de su ciudad, y explica qué hace. **«Deshacer «Situar ciudades»»** (admin, con confirmación) quita el punto de
  todas las ciudades (`clearZoneLocations`); no toca las empresas ni su ficha de Google.
- **Grupos más pequeños**: radio de 45 px de lejos, 30 a nivel de ciudad, 18 de barrio, y sin agrupar desde el zoom 16
  (calle): pegadas, pero cada una suelta.
- Promotoras y DJs ya tienen su pestaña: el mapa por defecto enseña Empresas.
- Pruebas: `map.test.ts` (no salen y se cuentan), contrato (deshacer solo admin) y `smoke-map.cjs` (ocultas por
  defecto, situar, deshacer con confirmación y volver a situar).

## 29. Personas = gente del local; «Trabaja con» = Promotoras y DJs, cada una en su bloque

Pedido de Cristian: no se entendía si un DJ nuevo iba en «Personas» (con papel «DJ») o en «Trabaja con», ni cómo se
creaba uno que aún no está en el CRM.

- **Personas**: solo la gente del local (dueño, socio, encargado, booking, RR. PP., marketing, staff). El papel es un
  desplegable (con «Otro…» para escribirlo) y el diálogo avisa: «¿Es un DJ o una promotora? Añádelo en «Trabaja con»».
  Se guarda como texto (los papeles importados se siguen viendo igual).
- **Trabaja con** (en un local): un bloque **Promotoras** y otro **DJs**. Cada uno busca **solo en su tipo**
  (`accountSearch(q, kind)`; `/admin/api/crm/account-search?kind=`). Lo que ya tienes sale como «Ya en tu CRM ·
  Valencia»; al final, siempre, **«+ Añadir «X» a Promotoras»** (o a DJs), que lo crea en su pestaña y lo enlaza. Al
  elegir aparecen los días, la frecuencia, la nota y, en DJs, residente o invitado. Sin elegir no se envía.
- Desde una promotora o un DJ, el bloque es el de locales. Los enlaces de otros tipos salen en «Otros enlaces».
- Al crear por nombre con un tipo, solo se reutiliza una que se llame igual **y sea de ese tipo**.
- Un espacio sin tipos de promotora/DJ sigue con un solo bloque en el que se elige qué es lo nuevo.
- Pruebas: `smoke-crm.cjs` (dos bloques, «Añadir a Promotoras», DJ nuevo residente que no ve locales al buscar, pestañas
  Promotoras y DJs, papel en desplegable).

## 30. Tamaño en tramos (según local, conciertos o festival); Festival sí, Promotora no

Pedido de Cristian: el «Aforo» en número (abajo, en la Ficha) repetía «Tamaño del local».

- **Un solo dato: Tamaño**, con cuatro tramos (Pequeño, Mediano, Grande, Masivo) y, debajo de cada uno y en pequeño,
  su rango. Los rangos dependen de lo que es (`SIZE_LIMITS` en `priority.ts`): local hasta 150 / 500 / 1.500;
  conciertos hasta 500 / 2.000 / 10.000; festival hasta 5.000 / 20.000 / 50.000. Al marcar «Festival» o «Conciertos»
  en el formato, los rangos cambian.
- **Formato**: se añade **Festival** (se mide como conciertos) y se quita **Promotora** (tiene su propia ficha, §24; lo
  viejo marcado se ignora).
- Migración `20261128` (Enjoy): el aforo apuntado pasa a su tramo (sin pisar el tamaño que ya hubiera) y el campo
  «Aforo» se archiva (se puede recuperar en Campos). La tarjeta «Ficha» no sale si no le quedan campos.
- Pruebas: `priority.test.ts` (escalas y tramos), SQL `67_enjoy_size_capacity`, `smoke-crm.cjs`.

## 31. Lo que cambias se guarda solo; lo que apuntas, con botón

Pedido de Cristian: había «Guardar» en cada bloque y no se sabía qué necesitaba botón.

- **Regla**: cambiar un dato se guarda al momento (un clic en un chip o desplegable; al salir de un texto), con
  «Guardado ✓» al lado. Apuntar un hecho (una interacción, enlazar, añadir una persona) sí lleva botón, que se llama
  por lo que hace.
- **Cómo** (`AdminLayout.astro`): un formulario con `data-autosave` (y `data-async`) se manda solo al cambiar un campo
  y su botón (`data-autosave-btn`) no se enseña; `[data-autosave-status]` dice «Guardando…» / «Guardado ✓»; un error
  sale abajo como siempre. `data-no-autosave` excluye un campo (p. ej. un buscador).
- **Dónde**: Contacto (actualiza los botones de contacto), Datos (actualiza la cabecera), tipo de cliente, campos de
  la Ficha. **Grupo**: al pinchar en el buscador salen los grupos de su ciudad; elegir uno (o «Crear el grupo») ya lo
  guarda. **Listas**: chips en Datos («fbd ✕», «+ Lista» con las que ya existen), se guardan al añadir o quitar; ya no
  están en Personas (las de una persona, en su ficha).
- Pruebas: `smoke-crm.cjs` (campos sin botón, error en aviso), `smoke-crm-people.cjs` (grupo al elegir, sugeridos al
  pinchar, listas), `smoke-followup.cjs` (contacto al salir del campo).

## 32. Otros espacios: lo mismo con otros nombres (Oquea, Trama, Sizec…)

Criterio de Cristian: nada de esto puede ser solo de Enjoy; dar de alta otro espacio tiene que ser configurar, no
programar. La forma es la misma en todos: **clientes** a los que se vende, que pueden ir en **grupos**, y alrededor
**figuras externas** que trabajan con varios clientes a la vez y pesan más que su gente de dentro.

| Ficha (perfil del tipo) | Qué es | Enjoy | Oquea | Trama | Sizec |
|---|---|---|---|---|---|
| Cliente (`venue`) | A quien se vende | Local, sala | Centro de buceo | Director/agencia de casting | Empresa de nutrición |
| Organizador (`promoter`) | Trabaja con muchos clientes y monta cosas con ellos | Promotora | ONG | Representante | (la que haya) |
| Profesional (`dj`) | Persona que colabora con varios clientes | DJ | Instructor autónomo | — | Nutricionista externo |
| Grupo (`parent_id`) | Varios clientes de un mismo dueño | Grupo Cosmic | Cadena de centros | Grupo de casting | Grupo de empresas |
| Personas | La gente de dentro del cliente | Dueño, encargado | Dueño, staff | Director, ayudante | Dirección, calidad |

**Ya es de cada espacio** (sin tocar código): los tipos y sus pestañas (Empresas · Instructores · ONGs · Descartadas),
el perfil de cada tipo (`kinds` en `crm_settings`, editor en Campos del CRM), los bloques de «Trabaja con» (uno por
tipo de organizador/profesional, con su nombre), grupos (buscar, sugerir por ciudad y por titular), titular y CIF,
listas, soltar en bloque, mapa, autoguardado, Apuntar (separa por sitio y sabe el tipo).

**Todavía es de Enjoy** (lo resuelve #71 «Configura tu CRM», presets por sector en vez de constantes):

- Las preguntas y pesos de cada perfil (`priority.ts`, `profiles.ts`): formato de local, fiesta, DJ, pantallas,
  tamaño en tramos (`SIZE_LIMITS`), dinámicas; de promotora y DJ (estilo, seguidores, caché…). En otro espacio:
  p. ej. Oquea — tipo de centro, alumnos al mes, temporada; instructor — certificaciones, centros con los que
  colabora.
- El «encaje con lo que vendemos» (paquetes de Enjoy: pantalla, peticiones, fotos, fidelización).
- En el enlace de un profesional, «residente / invitado» (en Oquea sería «fijo / colabora»).

Plan para #71: un **preset por sector** (ocio nocturno = lo de hoy; buceo; casting; nutrición…) con las preguntas, los
pesos, los tramos de tamaño, los paquetes y las palabras del enlace, guardado en `crm_settings` del espacio y editable
por el admin. El código lee el preset del espacio en vez de las constantes; Enjoy se queda con el de ocio nocturno sin
cambiar nada. Los nombres internos de los perfiles (`venue`, `promoter`, `dj`) se mantienen (no hace falta migrar);
en pantalla siempre sale el nombre del tipo del espacio.

## 33. Seguimiento rehecho: próximo paso arriba, «¿Qué ha pasado?» de un toque

Pedido de Cristian: el seguimiento era un formulario largo (con quién, por dónde, qué pasó, nota, cambiar el próximo
paso y «Guardar»).

- **Próximo paso** arriba, con lo que propone la app debajo, y dos botones: **«Hecho: ¿qué pasó?»** (baja a apuntar
  con la nota lista) y **«Cambiar»** (cuándo, por dónde, con quién y qué; «Guardar próximo paso» y «Quitar próximo
  paso» dentro).
- **¿Qué ha pasado?**: con quién y por dónde ya vienen puestos (lo previsto o lo que propone la app; «Cambiar» si hace
  falta); la nota es opcional y **cada resultado es su botón** (Sin respuesta, Contestó, Interesado, No interesado,
  Cita conseguida, Solo una nota): un toque y queda apuntado; la app propone el siguiente paso con la regla de los 3
  intentos. «Solo una nota» sin texto no se apunta (lo avisa).
- **Borrador**: la nota se guarda en el navegador mientras se escribe; si se cierra la página, al volver sale «Tienes
  una nota sin apuntar» (con «Descartar»); al apuntar se borra.
- **Interacciones**: las 5 últimas; «Ver todas» enseña el resto.
- Pruebas: `smoke-followup.cjs` (Hecho → nota, «Solo una nota» vacía no se apunta, borrador tras recargar, un toque
  apunta), `smoke-accounts.cjs`, `smoke-route.cjs` (próximo paso con «Cambiar»).

## 34. Tablero: columnas que decide el historial, no el comercial

Pedido de Cristian: un tablero tipo Jira en CRM (pestaña **Tablero**, y «Lista | Mapa | Tablero»). El CRM va antes que
Propuestas en el menú: la propuesta es el último paso de la venta.

- **Quién ve qué**: el comercial, solo su tablero (las empresas que lleva); `?comercial=` se ignora para él (lo fuerza
  `crm.board()`, no la página). Admin y gerentes ven todas y filtran por comercial (chips arriba).
- **Columnas** (`src/lib/crm/pipeline.ts`, lógica pura con pruebas): se calculan con lo apuntado en Seguimiento y no se
  mueven a mano, para que no se cuele el «ya casi está» de quien vende. En orden de prioridad:
  - **Cerrada**: ganada (`won_at`; con K3, cuando paga por Stripe).
  - **Perdida**: descartada o la última interacción es «No interesado».
  - **Cierre**: tiene una propuesta publicada (con K2, también el enlace de pago enviado), sin pagar.
  - **Negociando**: ha contestado alguna vez (Contestó, Interesado o Cita).
  - **Primer contacto**: alguna interacción de verdad (las notas no cuentan), sin respuesta.
  - **Investigada**: tiene cualificación o investigación con IA, sin contactar.
  - **Sin empezar**: el resto.
- **Datos**: la vista `crm_activity_summary` (migración `20261129`, `security_invoker`) da por empresa las interacciones
  de verdad, la primera y la última, la primera respuesta y el último resultado; una consulta por tablero (en trozos de
  300), no el historial entero.
- **Plazos** (Configurar → Datos del CRM → Campos → Tipos de cliente): días desde el primer contacto para cerrar, por
  tipo de cliente; 60 por defecto y 180 si es «grande» (en un grupo, es un grupo, o tamaño grande o masivo). Se guardan
  en `crm_settings.kinds` (`cycleDays`, `cycleDaysBig`, de 7 a 730). Pasado el plazo y sin cerrar, la tarjeta avisa
  («N días sin cerrar»); **no se cierra sola**. También avisa con 8 o más interacciones en Negociando.
- **Tarjeta**: tipo, comercial (en «Todos»), desde cuándo está en la columna, interacciones, último resultado, próximo
  paso y avisos. Como mucho 60 por columna (el resto, contadas). Las atascadas van primero.
- Pruebas: `pipeline.test.ts`, `supabase/tests/68_crm_activity_summary.test.sql`, `smoke-board.cjs` (la columna avanza
  sola, el comercial no ve otros ni con la URL, filtro del admin, plazo por tipo).
- Después: «Generar pago» desde la ficha (K2), pagado = Cerrada con aviso y celebración (K3), análisis con IA de las
  interacciones de cada comercial, recordatorios por WhatsApp.

## 35. Generar pago desde la ficha (tarifa por tamaño, cupón, enlace)

Pedido de Cristian: el cierre se hace desde el CRM, no solo desde la propuesta. Tarjeta **Cobrar** en la ficha:

1. **Tamaño**: si no se sabe, lo pregunta (Pequeño, Mediano, Grande, Masivo, con los tramos según sea local, conciertos
   o festival, §30) y lo guarda en la cualificación.
2. **Tarifa**: sale marcada la de su tamaño (`price_option.size`, que el admin pone en Configurar → Precios) y de su
   sector; si no hay de su tamaño, la más típica. Se puede elegir otra («plan superior»). Solo las activas, no «a medida»
   y con enlace de pago de Stripe (`src/lib/crm/charge.ts`, con pruebas).
3. **Cupón** (opcional): los que se pueden usar hoy. Stripe lo aplica con su código de promoción; la tarjeta enseña lo
   que paga con el descuento.
4. **Enlace**: el Payment Link de la tarifa con `client_reference_id=pay_<id>` (este cobro) y `prefilled_promo_code`.
   «Copiar enlace» y «Mandar por WhatsApp» (con un mensaje y su teléfono). Se puede anular mientras no esté pagado.

- **El precio lo fija la empresa**: la base de datos (`payment_request_guard`, migración `20261130`) copia importe,
  periodo y enlace de la tarifa e ignora lo que mande el navegador; un precio **a medida** (sin tarifa, con un enlace de
  Stripe creado para ese importe) solo lo pone un admin. Un enlace enviado solo se puede anular; pagado lo marca el
  servidor (K3, webhook).
- **Tablero**: con un enlace enviado (sin anular) la empresa pasa a **Cierre** (§34).
- El comercial cobra lo suyo (o lo libre); gerentes y admin, cualquiera.
- Pruebas: `charge.test.ts`, `payment.test.ts`, `supabase/tests/69_payment_request.test.sql`, `smoke-charge.cjs`.
- Al pagarse: §36.

## 36. Pagado = Cerrada: aviso, email y celebración

- **Stripe** (webhook del espacio, `src/lib/commissions/stripe.ts`): `checkout.session.completed` con
  `client_reference_id = pay_<id>` y cobrado (o sin nada que cobrar, p. ej. primer mes gratis) → se registra el ingreso
  (pago único) y `payment_request_paid` (migración `20261201`): el cobro queda **pagado**, la empresa **ganada** para quien
  generó el enlace (estado cliente, en su historial), el ingreso atribuido a la empresa y a esa persona (comisiones) y
  aviso **«X ha pagado»** a quien lo vendió y a admins y gerentes. Stripe repite avisos: la segunda vez no hace nada.
  En suscripciones, las cuotas siguientes entran como hasta ahora (sin atribución automática a la empresa).
- **Sin Stripe** o pagado por transferencia: un gerente o admin pulsa «Marcar pagado» en el enlace o «Ya ha pagado (sin
  enlace)» en la tarjeta Cobrar. Mismo efecto y mismo aviso. El comercial no puede: lo que cierra es el dinero, no él.
- **Aviso**: tipo `payment_paid` (acción, se da por visto al abrirlo), con email inmediato como el resto de avisos que
  piden atención. Lleva a la ficha de la empresa.
- **Celebración** (`Celebration.astro`): la primera vez que alguien ve el aviso sin leer, confeti y «X ha pagado»; una
  sola vez por aviso (se recuerda en el navegador) y sin animación si la persona la tiene desactivada en su sistema.
- **Tablero**: ganada → columna **Cerrada** (§34).
- Pruebas: `stripe.test.ts` (pay_, repetido, suscripción, sin cobrar), `supabase/tests/70_payment_paid.test.sql`,
  `smoke-charge.cjs` (webhook firmado → celebración una vez, «Cerrada», aviso al admin; a mano sin enlace).
