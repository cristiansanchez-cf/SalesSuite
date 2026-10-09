# CRM dinámico: arquitectura (propuesta para decidir)

> Estado: **fase 1 hecha** (campos por espacio, ficha, columnas y filtros) y **menú corto** hecho. Lo demás, propuesta. Objetivo: que cada espacio (Enjoy, Oquea…) tenga **su propio CRM**
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
  nadie); borrar personas e importar es de admin o gerente; crear campos al importar, solo admin.
- **Importar** (`src/lib/crm/import.ts`, puro): `readCsv` → `profileColumns` (dato de serie, campo existente o nuevo
  con su tipo adivinado) → `suggestMapping` (valores sin emojis y variantes unificadas: «DJ/AV» = «DJ + AV») →
  `buildPlan`. Duplicados exactos fuera; personas por email, LinkedIn o nombre + empresa; empresas por nombre (+ ciudad
  al importar empresas); «CEO», «DJ»… en la columna de empresa no crean empresas (pasan a papel o notas); responsables
  por nombre parcial (si no es del equipo, queda sin asignar); ciudades → zonas (las nuevas, dentro del país); lo que no
  encaja en su campo va a notas como «Columna: valor». Al fusionar no se pisa nada: solo se rellenan huecos.
- **Deshacer**: borra lo creado (`import_id`), devuelve lo fusionado a su estado anterior, quita los vínculos nuevos,
  archiva los campos creados y borra las ciudades que quedaron vacías.
- **Servicio**: `admin.crm.*` (`src/lib/crm/service.ts`). Pantallas: `Cuentas → Empresas | Personas | Importar`
  (`/admin/accounts`, `/admin/people`, `/admin/import`), ficha de empresa con «Grupo y personas», ficha de persona,
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
- **Arreglo del FBD** (Cuentas → Importar → Arreglos): el Instagram del local guardado en la persona pasa a la empresa.
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
