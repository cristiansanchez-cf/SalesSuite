# Oquea en Cofundo Ventas · handoff para una sesión dedicada

> Documento para **abrir una sesión de Claude solo para Oquea** sin pisar la de Enjoy. Pega la sección 4 como primer
> mensaje de la sesión nueva. Los otros dos documentos de esta carpeta son lo que esa sesión pide a cada fuente:
> - [`01-PROMPT-REPO-UI.md`](./01-PROMPT-REPO-UI.md) → al agente del **repositorio de Oquea** (código de la UI) y al **Figma**.
> - [`02-PROMPT-AGENTE-NEGOCIO.md`](./02-PROMPT-AGENTE-NEGOCIO.md) → al **agente con el contexto de negocio de Oquea**.

---

## 1. Qué es esto y qué se reutiliza

Cofundo Ventas (este repo) es **una sola plataforma con varios espacios** (tenants). Enjoy the Club es el primero. Oquea
será el segundo, con su marca, su catálogo de módulos, su mercado, su playbook y sus propuestas. **No se copia el
código**: se da de alta un espacio nuevo en `tenants/oquea/` y, si hace falta, se añaden plantillas de módulo.

| Qué | Enjoy (hecho) | Oquea (por hacer) |
|---|---|---|
| Marca: colores, fuentes, logo, favicon, OG | `tenants/enjoy/tenant.json` → `theme_tokens`, `brand`; `tenants/enjoy/assets/` | `tenants/oquea/…` (doc 01) |
| UI del producto en las propuestas | Plantillas `live-screen` (la pantalla del local) y `phone-tour` (el móvil del invitado), recreadas del producto real | Plantillas nuevas con la UI real de Oquea (doc 01) |
| Catálogo de módulos | `catalog[]` | `catalog[]` |
| Mercado: sectores, actores, cliente ideal | `market[]` con `personas[]` | doc 02 |
| Situaciones (para comparar ventas) | `facets[]` | doc 02 |
| Playbook (guiones, objeciones, cierre…) | `playbook[]` (~190 jugadas) | doc 02 |
| Tarifas y cupones | `price_options[]`, `coupons[]` | doc 02 |
| Receta de propuesta por sector (tipo, ángulo, módulos, tope) | `market[].proposal` (docs/PROPOSAL_PRESETS.md) | doc 02 |
| Aprende, «Empieza aquí», recorrido del producto | Sale solo de lo anterior (+ `tour`) | Igual |
| Dossiers de ejemplo | `scripts/sample-dossiers.ts` (`SAMPLES`) | Añadir los de Oquea |

## 2. Cómo trabajamos con Enjoy (lo aprendido, para replicarlo)

1. **El negocio llega en documentos numerados** (01 empresa, 02 mercado, … 08 propuesta de locales, 11 conciertos…)
   escritos por un agente de ventas con el contexto. Cada documento se guarda tal cual en `docs/ventas/<tenant>/fuentes/`.
2. **Cada documento se carga con un script idempotente** (`scripts/apply-propuesta-08.py`, `apply-respuestas-12.py`…)
   que edita `tenants/<tenant>/tenant.json`. Nunca se edita el JSON a mano: así se puede rehacer en orden y se ve qué
   viene de qué documento.
3. **Reglas de contenido** (innegociables):
   - Ningún dato sin fuente: si no hay dato, se deja vacío o se marca **PENDIENTE**.
   - Solo se venden funcionalidades que existen hoy (lista explícita de «qué hay en producción»).
   - Precios solo de la tabla de tarifas. Nada de prometer servicio (soporte 24h, plazos) ni cifras de retorno.
   - Lo que va entre comillas es literal. Las técnicas de los creadores, literales y atribuidas.
   - Cuando el que carga redacta algo propio, lo dice («textos míos, corrígelos») en un documento de vuelta
     (`docs/ventas/<tenant>/agente/NN-…-CARGADO.md`).
4. **Comprobación antes de subir**: `npm run tenant:bootstrap -- tenants/oquea --dry-run` (valida todo, incluida cada
   combinación de cada receta), tests, smokes y un render local de las propuestas.
5. **Producción**: GitHub → Actions → «Producción» con `tenant = oquea`: `alta-espacio` (crea o actualiza) y
   `dossiers-ejemplo`. Dominio y DNS: `docs/SETUP.md` §6; redirect de Auth: §3.1.
6. **Lo visual se itera con capturas**: el fundador manda capturas de su web/app y referencias; se recrean como
   plantillas de módulo (`docs/MODULE_AUTHORING.md`), con los tokens del tema, nunca con colores fijos.

## 3. Cómo convivir con la sesión de Enjoy sin pisarse

- **Rama propia**: `claude/oquea-tenant`, creada desde la rama de producción actual (`claude/dreamy-dijkstra-a4xm1g`).
- **Solo toca lo suyo**: `tenants/oquea/**`, `docs/ventas/oquea/**`, `docs/oquea/**`, `scripts/apply-oquea-*.py`.
  Para el alta de Oquea en producción, el workflow «Producción» se lanza con `ref = claude/oquea-tenant` y
  `tenant = oquea`: lee los datos de su rama y no toca a Enjoy.
- **Código compartido (`src/**`, migraciones, workflows)**: nunca directamente. Si Oquea necesita una plantilla nueva
  (su app, su panel del centro), se hace en su rama y se abre un **PR contra la rama de producción**; la sesión de Enjoy
  lo revisa y lo integra (el despliegue de la web sale de esa rama). Las plantillas nuevas no cambian las existentes.
- **Nunca** lanzar `migraciones` desde la sesión de Oquea sin coordinar. **Nunca** editar `tenants/enjoy/**`.
- Si la sesión de Oquea necesita algo transversal (un cambio en el editor, en Aprende…), lo apunta en
  `docs/oquea/PETICIONES.md` y se resuelve en la de Enjoy.

## 4. Primer mensaje para la sesión de Oquea (copiar y pegar)

```
Vas a dar de alta a Oquea como segundo espacio de Cofundo Ventas, igual que se hizo con Enjoy the Club.
Lee primero, en este orden: docs/oquea/00-HANDOFF.md, docs/BRAND_INTAKE.md, docs/ONBOARDING_TENANT.md,
docs/PROPOSAL_PRESETS.md, docs/PLAYBOOK.md, docs/MODULE_AUTHORING.md, y mira tenants/enjoy/tenant.json y
scripts/apply-propuesta-08.py como ejemplo de cómo se carga el negocio.

Reglas:
- Trabajas en la rama claude/oquea-tenant (créala desde claude/dreamy-dijkstra-a4xm1g). Solo tocas tenants/oquea/**,
  docs/ventas/oquea/**, docs/oquea/** y scripts/apply-oquea-*.py. Lo que sea de src/** va por PR a la rama de
  producción. Nunca tocas tenants/enjoy/** ni lanzas migraciones.
- Ningún dato sin fuente: si falta, PENDIENTE. Solo funcionalidades que existen. Precios solo de la tabla. Lo literal,
  literal. Lo que redactes tú, márcalo.
- Hablas en español con el fundador (Cristian): respuestas cortas y visuales, y preguntas al final.

Primer paso: crea tenants/oquea/ (copia la estructura de tenants/enjoy/ pero vacía de contenido de Enjoy: sin sus
textos, módulos, jugadas, tarifas ni fotos), y prepárame:
1) la lista de lo que necesitas del repo y del Figma de Oquea (usa docs/oquea/01-PROMPT-REPO-UI.md), y
2) la lista de documentos de negocio que necesitas del agente de Oquea (usa docs/oquea/02-PROMPT-AGENTE-NEGOCIO.md).
Después vamos cargando lo que llegue, documento a documento, con un script por documento.
```

## 5. Lo que ya existe y sirve para Oquea

- **Preset de sector** en la configuración guiada: «Centros de buceo», «Hoteles y posadas con centro de buceo» y
  «Cadenas de centros», con actores de partida (director del centro, instructor, instructor autónomo, buceadores,
  recepción, responsable de cadena). Son un punto de partida; el agente de Oquea los confirma o corrige.
- **Toda la consola** (Aprende, Preparar mensaje, cuentas y zonas, comisiones, organigrama, notificaciones, idiomas
  es/en/pt/ko) funciona para cualquier espacio sin tocar código.
- **Plantillas genéricas** que Oquea puede usar ya: portada (`hero-pitch`), problema → solución, caso real, tarjeta de
  precio, pestañas, «En directo» (fotos y vídeos reales en tira), «Lo que ya te cuesta» (cifras del cliente).
- **Lo que es de Enjoy y no sirve tal cual**: la pantalla en vivo y el móvil del invitado recrean la app de Enjoy. Oquea
  necesita sus propias plantillas con la UI de su app (doc 01).
