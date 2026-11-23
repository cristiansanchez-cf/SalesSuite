# Importar con tu IA (por MCP)

Criterio de Cristian: «imagínate que lo tenía todo en su IA o en un sitio difícilmente exportable… con su MCP conectado
decide ir poco a poco metiendo la info. Puede haber muchos fallos en ese proceso».

## Qué puede salir mal y cómo se evita

| Riesgo | Cómo se evita |
|---|---|
| Duplicados («Club Sol» y «Club del Sol»; la IA pierde el hilo y lo reenvía todo) | Cada empresa lleva una **referencia** (`ref`): reenviarla actualiza, no duplica. Al aplicar, **nombre + ciudad** como en cualquier importación. La respuesta dice «ya_existe» con cuál. |
| Inventos o resúmenes | Cada empresa trae su **texto de origen** tal cual: se ve al revisar. Las reglas lo piden: no inventar ni resumir. |
| Cortes a mitad | `importacion_estado` dice cuántas hay, sus referencias y qué falló. |
| Lo que no existe en el CRM (tipos, preguntas, valores) | `importacion_empezar` da el **esquema** del espacio. Lo demás se responde **fila a fila** («Tipo «Federación» no existe», «screens: nope no vale») y no se guarda. |
| Pisar lo bueno | Al aplicar, solo se rellenan los huecos de lo que ya existe; las notas se suman. Cualificación y próximo paso solo en las nuevas (o donde no había nada). |
| Fechas mal (HAVANA: «el martes que viene» como fecha de la conversación) | Interacciones solo con fecha exacta (AAAA-MM-DD) y **no futura**; si no, van como dato y se avisa («¿era un próximo paso?»). |
| Un error repetido en cientos de fichas | Todo es **un lote**: «Deshacer» lo quita entero (empresas nuevas, personas e interacciones; lo completado vuelve a como estaba). |
| La IA aprueba sola sus herramientas | Las herramientas **no escriben en el CRM**: llenan un área de espera. **Aplicar** solo desde la app, una persona y un clic. |

## Cómo funciona

- **En la app**:
  - Inicio, «Importa con tu IA» (y Datos del CRM → Importar) llevan a `/admin/import/ia`.
  - Allí están los pasos: conectar la IA, pegarle el mensaje ya escrito y revisar y aplicar aquí.
  - Debajo, las importaciones: abierta, lista para revisar, aplicada o deshecha.
  - **Revisar** (`/admin/import/ia/<id>`): cada empresa con su tipo, ciudad y si es nueva o «Ya está: X»; sus avisos;
    y «De dónde sale» (el texto de origen y los datos). Botones **Aplicar** y **Deshacer**.
- **MCP** (`src/lib/mcp/tools.ts`):
  - `importacion_empezar`: el id de la importación, el esquema y las reglas.
  - `importacion_enviar`: tandas de hasta 25, con respuesta fila a fila (`nueva`, `ya_existe`, `se_junta`, avisos) y las
    rechazadas. Lleva `idempotentHint`.
  - `importacion_estado` e `importacion_terminar`: este último solo la deja lista para revisar.
- **Código**:
  - `src/lib/crm/ai-import.ts`: puro y probado; validar, juntar por referencia y el CSV.
  - `src/lib/crm/ai-import-service.ts`: sobre la importación de siempre (`crm_import` en borrador; las filas, en
    `mapping.ai`), sin tablas nuevas.
  - Al aplicar: empresas y contacto con la importación de siempre. Después, empresa a empresa: tipo, «Lo que sabemos»
    (en las nuevas; en las que ya estaban, a Notas para que «Deshacer» las deje igual), personas con su papel, teléfono
    y email, interacciones (fechadas, `import_id`), próximo paso y cualificación (la del paquete del espacio).
- **Quién**: de momento, quien puede importar (admin), como la importación por CSV; la tabla `crm_import` solo deja a
  admins.
- **Pruebas**:
  - `src/lib/crm/ai-import.test.ts`.
  - `scripts/smoke-ai-import.cjs`: un cliente MCP de verdad, tanda con una que ya está, una nueva y una con fallos;
    reenvío; estado; terminar; revisar; aplicar; ver la ficha; deshacer.

## Pendiente

- Que cada comercial importe lo suyo (quedan como suyas). Hace falta abrir `crm_import` a quien la crea y no solo al
  admin.
- Probarlo con claude.ai y ChatGPT de verdad: cuántas empresas por tanda aguantan bien y si piden permiso en cada
  llamada. Ajustar el tamaño y el mensaje.
- Personas sueltas (sin empresa) y propuestas: de momento, solo empresas con su gente.
