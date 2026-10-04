# Prompt para el agente con el contexto de negocio de Oquea · cómo entregarnos el negocio

> Pega la sección «Prompt» al agente que **conoce el negocio de Oquea** (decisiones, clientes, equipo, precios). Lo que
> devuelva se guarda tal cual en `docs/ventas/oquea/fuentes/` y la sesión de Oquea lo carga con un script por documento.
> Es el mismo camino que hizo Enjoy the Club: así se llenan **Aprende**, el **playbook**, **Preparar mensaje** y las
> **propuestas** sin inventar nada.

---

## Prompt (copiar desde aquí)

Hola. Vamos a dar de alta a **Oquea** en **Cofundo Ventas**: una consola donde el equipo comercial aprende a vender
(«Aprende»), prepara cada conversación con el cliente y le manda una **propuesta** personalizada por enlace. Todo lo que
ve el comercial y el cliente sale de lo que tú nos cuentes, así que necesitamos el negocio **completo, con fuente y en
un formato fijo**.

### Reglas (innegociables)

1. **Ningún dato sin fuente.** Si no lo sabes, escribe **PENDIENTE: <qué falta> — lo sabe <quién>**. Mejor un hueco que
   un dato inventado.
2. **Solo lo que existe hoy.** Distingue siempre **EN PRODUCCIÓN** (se vende), **EN PRUEBAS** (se vende con aviso) y
   **ROADMAP** (no se vende). Lo que no está en producción no sale en ninguna propuesta.
3. **Precios solo de la tabla oficial** (documento 04). Nada de cifras de retorno, plazos ni promesas de servicio que no
   estén firmadas.
4. **Lo literal, literal.** Lo que va entre comillas «…» es una frase real (de un cliente, de un comercial, de la web).
   Si lo redactas tú, márcalo con **[REDACTADO]** para que el fundador lo revise.
5. **Escribe para el móvil del comercial.** Frases cortas, una idea por bloque, segunda persona al cliente, sin jerga
   interna. `{company}` = nombre del cliente; `{prospect}` = nombre de la persona.
6. **Claves estables.** Cada pieza lleva una `key` en minúsculas con guiones (`director-centro`, `obj-precio-temporada`).
   No la cambies en revisiones posteriores: es cómo sabemos qué sustituye a qué.
7. **Un documento por mensaje**, numerado, en Markdown, con las secciones y tablas de las plantillas de abajo. Si un
   documento es muy largo, pártelo (`03a`, `03b`).

### Taxonomías (usa exactamente estos valores)

| Campo | Valores |
|---|---|
| **Papel de un actor** | `decisor` (firma) · `pagador` (pone el dinero) · `influenciador` (su opinión pesa) · `campeon` (te ayuda por dentro) · `usuario` (lo usa a diario) · `guardian` (no decide, pero puede tumbarlo) |
| **Tipo de jugada** | `pitch` (cómo presentarlo) · `fit` (para quién y cuándo no) · `discovery` (preguntas) · `proof` (pruebas y casos) · `objection` · `monetization` (precio) · `script` (guion) · `tip` (consejo) |
| **Etapa** | `prospeccion` · `primer_contacto` · `descubrimiento` · `pitch_demo` · `objeciones` · `negociacion` · `cierre` · `seguimiento` · `mentalidad` |
| **Objeción** | `precio` · `tiempo` (me lo pienso) · `desconfianza` · `no_lo_necesito` · `no_decido_yo` · `comparar` · `ya_tengo_proveedor` |
| **Quién la ve** | `all` · `team` (solo equipo interno: estrategia, objetivos) · `partners` (solo colaboradores externos) |

### Los documentos que necesitamos (en este orden)

#### 01 · Empresa y producto

```markdown
# 01 · Empresa y producto
## 1. Oquea en una frase                       (≤ 200 caracteres; la que diría un comercial en un ascensor)
## 2. Por qué existimos                         (paso 0 de Aprende)
### La visión · `vision`
### Por qué ahora · `por-que-ahora`
### Cómo gana dinero la empresa · `modelo`
### Lo que no somos · `no-somos`
### Estrategia / objetivos del año · `estrategia-…` · audiencia: team
## 3. Así funciona, de principio a fin          (máx. 8 pasos; título ≤ 80, texto ≤ 240)
| # | Título | Qué pasa | Quién lo hace (actor) | Superficie (app buceador / panel centro / …) |
## 4. Qué hay hoy
| Funcionalidad | Estado (EN PRODUCCIÓN / EN PRUEBAS / ROADMAP) | Para quién | Cómo se explica en una frase | Fuente |
## 5. Lo que NO se dice nunca                   (lista: promesas, comparaciones, cifras, funciones que no existen)
## 6. Competencia y alternativas                (qué usa hoy el cliente: Excel, papel, otra app… y cómo nos diferenciamos)
## 7. Vocabulario                               (términos propios y cómo traducirlos: en / pt / ko si los hay)
```

#### 02 · Mercado: sectores, actores y situaciones

Un bloque por **sector** (tipo de cliente al que se vende: centro de buceo, hotel con centro, cadena, escuela,
liveaboard…). Confirma o corrige los que ya tenemos de partida: «Centros de buceo», «Hoteles y posadas con centro de
buceo», «Cadenas de centros».

```markdown
## <Nombre del sector> · `<key>`
_Una línea: qué es._
**Por qué nos compra** (propuesta de valor, 2–3 frases)
**Cliente ideal** (viñetas: tamaño, nº de buceadores/mes, zona, tecnología que ya usa…)
**Cuándo NO venderle** (viñetas: descalificadores)
**Cómo decide** (quién empuja, quién firma, quién puede tumbarlo, qué hace falta para cerrar)
**Tamaño de la venta** (rango de la tabla de precios del doc 04)
**Ciclo de venta** (días/semanas; temporada alta y baja; mejor momento y canal para contactar)
**Qué enseñarle, en orden** (los 4–7 bloques de la propuesta, ver doc 05)

### Actores
| key | Nombre | Papel | Quiere | Le duele | Cómo abordarle | Cómo te ayuda | Cómo lo tumba | Objeciones típicas |
```

Después, las **situaciones** que cambian cómo se vende (para comparar ventas parecidas):

```markdown
## Situaciones
| key | Nombre | Valores posibles | Qué cambia en la venta |
(p. ej. `temporada`: alta / baja · `tamano`: <500 / 500–2000 / >2000 buceadores al año · `tecnologia-actual`: papel / Excel / otra app)
```

#### 03 · Jugadas (el playbook)

Todo lo que un comercial bueno sabe y uno nuevo no: cómo presentarlo, preguntas, objeciones, cierres, seguimientos,
consejos. **Mínimo 6 por sector** y las generales. Una tabla o un bloque por jugada:

```markdown
### <Título> · `<key>`
- **Tipo:** pitch | fit | discovery | proof | objection | monetization | script | tip
- **Etapa:** …            - **Objeción:** … (solo si es de tipo objection)
- **Sectores:** keys del doc 02 (vacío = general)     - **Actores:** keys del doc 02 (vacío = todos)
- **Quién la ve:** all | team | partners
- **Cuándo usarla:** (≤ 1000)
- **Texto:** (ideal < 600 caracteres; lo que el comercial dice, tal cual lo diría)
- **Por qué funciona:** (≤ 2000)
- **Fuente:** (quién lo dijo / de qué venta salió / [REDACTADO])
```

Para las **objeciones**: «lo que dice el cliente» → lo que contestas → cómo vuelves a la venta.
Si una técnica viene de un experto de ventas, cítala **literal** con su autor y enlace; la adaptación a Oquea va aparte
y marcada.

#### 04 · Precios, cupones y suelos

```markdown
| key | Plan / tarifa | Precio | Periodo (mes / año / temporada / buceador) | Para qué sector y tamaño | Qué incluye | Notas |
| Cupones | key · descuento · condiciones · quién puede darlo · caducidad |
| Suelo de negociación | lo mínimo que se puede cerrar y quién lo autoriza |
| Prueba gratis | ¿existe? duración, condiciones |
```

#### 05 · La propuesta por sector (lo que recibe el cliente)

Una por sector. Es la receta del enlace que se le manda al cliente; el comercial elige 2–3 opciones y la propuesta se
arma sola.

```markdown
# 05 · Propuesta para <sector> · `<key del sector>`
## Tipo de cliente (elección 1)          ej.: centro pequeño / mediano / grande — cambia módulos y precio
## Ángulo (elección 2), de A a D           el motivo principal por el que este cliente compraría
### Ángulo A · <nombre>
- Portada: título (≤ 120) + subtítulo (≤ 300)
- 3 tarjetas literales: «Lo que te pasa hoy» → «Con Oquea»
### Ángulo B … (hasta D)
## Bloques, en orden                      portada → problema → producto (pantallas reales de la app) → caso → precio → cierre
| # | Bloque | Qué enseña | Texto (≤ 220 por pantalla) | Cuándo entra (siempre / si ángulo X / si tipo Y) |
## Tope                                   nº máximo de bloques (recomendado ≤ 7)
## Preguntas que cambian la propuesta     ¿tiene X? → añade/quita bloque Y
## Cierre                                 la pregunta con la que se cierra el dossier + CTA (WhatsApp, llamada, email)
## Nunca                                  lo que esta propuesta no debe decir
```

#### 06 · Casos reales

```markdown
| key | Cliente (¿se puede nombrar?) | Sector | Antes | Qué hicieron con Oquea | Resultado (con cifra solo si es real y hay permiso) | Frase literal | Foto/captura (con permiso) |
```

#### 07 · Organización comercial

```markdown
| Persona | Rol (fundador / comercial / colaborador externo / partner) | Zona | Sectores | Idioma | A quién reporta |
| Zonas | nombre · países/regiones |
| Comisiones | % o importe por plan · cuándo se paga · reglas para colaboradores |
| Canales | cómo llegan los clientes (eventos, ferias de buceo, agencias, referidos, outbound…) |
```

### Formato de entrega

- Un mensaje por documento, empezando por **01** y **02** (sin ellos no se puede cargar nada más).
- Al final de cada documento, una lista **PENDIENTES** (qué falta y quién lo sabe) y una lista **[REDACTADO]** (lo que has
  escrito tú y hay que validar).
- Si te pedimos correcciones, devuelve el documento entero con las mismas `key`, marcando **[NUEVO]** o **[QUITAR]**.

Gracias. Empieza por el 01.

---

## Para la sesión de Oquea (no se pega): qué se hace con cada documento

| Documento | Se guarda en | Se carga en `tenants/oquea/tenant.json` | Se ve en |
|---|---|---|---|
| 01 | `docs/ventas/oquea/fuentes/01-empresa.md` | `playbook[]` generales (`vision`, `modelo`…), `tour`, `catalog[]` | Aprende · paso 0, recorrido, catálogo |
| 02 | `…/02-mercado.md` | `market[]` (+ `personas[]`), `facets[]` | Aprende · sectores, actores; cuentas; comparar ventas |
| 03 | `…/03-jugadas.md` | `playbook[]` | Aprende, ficha de venta, Preparar mensaje |
| 04 | `…/04-precios.md` | `price_options[]`, `coupons[]` | Editor de propuestas, tarjeta de precio |
| 05 | `…/05-propuesta-<sector>.md` | `market[].proposal` (docs/PROPOSAL_PRESETS.md) | Nueva propuesta, dossiers de ejemplo |
| 06 | `…/06-casos.md` | bloques `case-study`, jugadas `proof` | Propuestas, Aprende |
| 07 | `…/07-organizacion.md` | Alta de equipo, zonas y comisiones (desde la consola, no en el JSON) | Equipo, organigrama, comisiones |

Cada documento → un script `scripts/apply-oquea-NN.py` idempotente → `npm run tenant:bootstrap -- tenants/oquea --dry-run`
→ documento de vuelta `docs/ventas/oquea/agente/NN-…-CARGADO.md` con lo cargado, lo que quedó PENDIENTE y lo redactado.
