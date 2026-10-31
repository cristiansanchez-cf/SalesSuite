# Configuración guiada

Para el admin o el jefe/a de ventas: dejar la empresa lista (clientes, actores, situaciones, cómo se vende, precios) una sola vez.

## Con IA (recomendado) — `/admin/setup/ia`

Cinco bloques, uno cada vez: **Tu empresa → Clientes y actores → Situaciones → Cómo se vende → Precios → Comprobar**.

En cada bloque:
1. **Copiar el prompt** (`src/lib/setup/ai-import.ts`, `promptFor`). Va personalizado («Eres el asistente de Cristian, de Enjoy…»): el asistente de su ChatGPT/Claude le entrevista de una en una (también por audio) y, al terminar, devuelve **solo un bloque JSON** con nuestro formato.
2. **Pegar** lo que devuelva (con o sin ```json, con texto alrededor: da igual).
3. **Revisar**: qué se va a añadir y qué ya estaba (no se toca).
4. **Importar**: solo añade, por clave o por nombre; nunca borra ni pisa. Pasa al bloque siguiente.

Al final, **Comprobar**: dónde ha quedado cada cosa (con su número) y el siguiente paso: invitar al primer comercial y repartir zonas.

**Primer admin de un espacio vacío** (sin sectores): al entrar va directo aquí (`?first=1`), sin la bienvenida de comercial. Una vez hay sectores, Inicio no lo vuelve a comprobar en un día (cookie `ss_ready`).

Formato de cada bloque: `FORMATS` en `ai-import.ts`. Es tolerante: lo que sobre se recorta, lo que falte queda vacío, los papeles y tipos se entienden dichos a su manera («quien decide» → decisor, «guardián» → guardian, «al mes» → month).

### Agente de alta — `/admin/setup/agente`

Lo más rápido para una empresa nueva (y lo que usa el superadmin justo después de **Plataforma → Nueva empresa**, docs/ORG.md
§Alta de una empresa). En `/admin/setup/ia` sale arriba «Que lo prepare la IA con su web y sus documentos».

1. Se le da **su web**, **hasta 4 documentos** (PDF o texto, 4 MB en total: presentación, tarifas, argumentario…) y, si se
   quiere, unas líneas.
2. Claude (`src/lib/setup/agent.ts`, Sonnet con lectura y búsqueda web) lo lee todo y devuelve un **borrador de los cinco
   bloques** con el mismo formato que los prompts, más **lo que no ha encontrado**, en forma de preguntas cortas. No inventa:
   lo que no está en las fuentes queda vacío (los precios, solo si están escritos). Escribe en el idioma del espacio.
3. Se contestan las preguntas que se sepan (una línea basta) y **Afinar** vuelve a pasarlo con el borrador anterior y las
   respuestas (sin volver a leer la web). Se puede repetir.
4. **Importar** pasa los cinco bloques por el mismo importador (`importBlock`): solo añade, nunca borra ni pisa, y lleva a
   **Comprobar**. Los precios solo los importa quien gestiona el espacio.

El borrador viaja en el formulario: no se guarda nada hasta importar. Sin `ANTHROPIC_API_KEY` el botón sale desactivado; con
`AI_RESEARCH_FIXTURE=1` (pruebas) responde un borrador de ejemplo. Prueba: `src/lib/setup/agent.test.ts`; smoke, el final de
`scripts/smoke-new-space.cjs` (alta → su admin → agente → afinar → importar).

## A mano — `/admin/setup`

Puntos de partida por tipo de negocio (solo añaden lo que falta) y formularios para sectores, actores y situaciones.
