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

Pendiente: un asistente integrado en la consola que haga la entrevista sin salir de aquí.

## A mano — `/admin/setup`

Puntos de partida por tipo de negocio (solo añaden lo que falta) y formularios para sectores, actores y situaciones.
