# Cimientos: para qué es esto, qué hemos construido y cómo debería crecer

> Documento de referencia (octubre 2026). Se escribió después de muchas peticiones en poco tiempo, para volver a los objetivos de negocio y comprobar si la arquitectura los sostiene. Cada decisión de diseño debería poder justificarse con algo de la §1. Si no, sobra.

---

## 1. Objetivos de negocio

**Para qué existe:** que una empresa venda más y mejor con una red comercial mixta (equipo propio, colaboradores, el propio CEO) sin perder el control. Primero, las startups del fundador (Enjoy the Club, Oquea y las que vengan); después, otras empresas como producto (white-label, multi-empresa).

| # | Objetivo | Cómo se nota que se cumple |
|---|---|---|
| O1 | **Que un vendedor nuevo venda desde el primer día.** Al acabar su primera sesión sabe qué se vende, a quién, cómo se suele vender y qué se lleva él. | Onboarding completado en una sesión; primera propuesta enviada la primera semana |
| O2 | **Que no se pierda ninguna venta por falta de seguimiento.** El CEO está desbordado: hoy tiene tres personas que quieren comprar y no ha podido atender a ninguna. | Ningún interesado sin próximo paso; ningún seguimiento vencido más de 48 h sin aviso |
| O3 | **Que la propuesta esté siempre al día y se haga en minutos** (el origen del producto: enlaces vivos con la marca de cada empresa) | Propuesta enviada en menos de 5 minutos |
| O4 | **Que nadie se pise ni bombardee a un cliente:** territorios, cuentas reservadas, reglas de contacto | Cero conflictos de cuenta sin resolver |
| O5 | **Que cada uno sepa cuánto gana, y que se pague sin errores:** comisiones claras, configurables y auditables | Cada euro trazable hasta un cobro real; cero correcciones a mano en la liquidación |
| O6 | **Que la dirección vea el negocio con dinero real:** quién vende, cuánto, qué dura un cliente, cuánto cuesta conseguirlo | Ventas, MRR, retención, LTV y CAC por vendedor, por delegación y por empresa |
| O7 | **Que lo que funciona se aprenda y se repita:** playbook con evidencia (comprobado o hipótesis) y conectado al Cerebro de Ventas | Las jugadas comprobadas suben la tasa de cierre de quien las usa |
| O8 | **Que crezca:** de una startup con tres colaboradores a una empresa con delegaciones y 30 vendedores, y a varias empresas en la plataforma | Una delegación nueva o una empresa nueva se da de alta sin tocar código |

**Restricciones del negocio:**
- La gente vende en la calle, con el móvil y sin tiempo.
- Muchos vendedores son colaboradores externos (DJ, monitores) que comparten con amigos.
- Los precios y las condiciones a menudo **aún no están decididos**: hay que poder vender antes de tenerlo todo cerrado.
- El dinero real pasa por pasarelas de pago (hoy Stripe, mañana Redsys u otras).

---

## 2. Quién lo usa y qué pregunta trae

| Persona | Sus preguntas | Dónde debería encontrar la respuesta |
|---|---|---|
| **Vendedor nuevo** (comercial o colaborador) | ¿Qué vendo? ¿A quién? ¿Cómo se vende? ¿Qué me llevo? ¿Esto está probado? | **Empieza aquí**: una sola página guiada (§4.1) |
| **Vendedor en el día a día** | ¿Qué tengo que hacer hoy? ¿A quién llamo? ¿Qué le digo? ¿Esta cuenta es mía? | **Inicio → Hoy** y su móvil (avisos) |
| **Colaborador que trae a otros** | ¿Cómo invito a un amigo? ¿Qué gano yo? | Su inicio: «Invita a un colega» y sus referidos |
| **CEO que también vende** (el fundador hoy) | ¿A quién no he atendido? ¿Qué está a punto de cerrarse? ¿Cuánto entra este mes? | **Inicio** con lo vencido primero y un resumen diario (§4.2) |
| **Jefe/a de delegación** | ¿Cómo va mi equipo? ¿Quién necesita ayuda? | Inicio de su delegación |
| **Dirección de una empresa grande** | ¿Cómo van todas las delegaciones? ¿Cuánto vale un cliente y cuánto cuesta? | Analítica consolidada (§5.6) |
| **Admin (configura)** | Productos, precios, condiciones, territorio, equipo | Configurar, con asistentes y valores por defecto |

---

## 3. Lo que hay hoy (inventario honesto)

Se empezó como **constructor de propuestas** (enlace vivo con la marca de cada empresa) y ha crecido hasta un **sistema operativo de ventas**:

| Bloque | Estado | Valoración |
|---|---|---|
| Propuestas (builder, enlace vivo, marca por empresa) | Sólido | El núcleo original; bien probado |
| Equipo y roles (admin, jefe/a, comercial, colaborador; referidos) | Funciona | Roles fijos y empresa «plana»: **no hay delegaciones** |
| Playbook, mercado (sectores, actores) y evidencia («Qué ha funcionado») | Funciona | Útil; falta distinguir «comprobado» de «hipótesis» en la cara del vendedor |
| Avisos (campana, email, resumen semanal) | Funciona | Escriben directamente desde triggers; no hay un registro de eventos reutilizable (WhatsApp, Cerebro) |
| Zonas y cuentas (CRM básico, reservas, conflictos) | Funciona | **Dos conceptos de «cuenta»**: la del CRM y la del colaborador |
| Comisiones (motor, libro, liquidaciones, API, cupones) | Sólido | El dinero está bien protegido; falta la conexión nativa con Stripe |
| Inicio (CEO y comercial) | Primera versión | Falta lo que más duele: la agenda de seguimientos |
| Idiomas (es/en/pt/ko) | En curso | Estructura hecha; pantallas en traducción |

**Lo que se hizo con parches y conviene rehacer:**

1. **Dos implementaciones de todo.** Cada función existe en la demo (en memoria, unas 1.600 líneas que replican a mano triggers y RLS) y en Postgres (unas 1.000). Los contratos garantizan que coincidan, pero **cada requisito cuesta el doble** y es la mayor fuente de lentitud.
2. **La propuesta hace de oportunidad.** El resultado (ganada o perdida), el próximo paso, la cuenta y el cupón cuelgan del dossier. Una oportunidad real tiene varias propuestas, varios contactos y una historia, y el seguimiento debería colgar de ella.
3. **Seguimiento repartido** en tres sitios: próximo paso del dossier, historial de la cuenta y avisos. No hay «tareas».
4. **Dos «cuentas»:** `partner_account` (cuentas asignadas a un colaborador, con su política de precio) y `account` (CRM). Deberían ser la misma con una asignación.
5. **Empresa plana:** un tenant = una empresa sin unidades internas. Las delegaciones y los jefes por delegación no caben sin tocar la RLS de todo.
6. **Roles y permisos fijos en código** (y repetidos en SQL). Con delegaciones hará falta un rol por ámbito.
7. **Mucha UI en una sola pantalla** (formularios siempre visibles). El fundador pide «Añadir» arriba a la derecha y asistentes en modales.

**Lo que está bien y se conserva:**
- Postgres como fuente de verdad, con RLS para el aislamiento entre empresas.
- Triggers donde hay dinero o permisos (libro inmutable, reservas, cupones).
- Motor de comisiones puro y testeado.
- Design system Cofundo con su linter de textos.
- Mensajes tipados por idioma.

---

## 4. Recorridos que mandan (MVP de verdad)

### 4.1 Un vendedor nuevo entra por primera vez

Orden recomendado: **qué vendemos → a quién → cómo se vende → tus condiciones → tu primera propuesta.** Primero el producto: sin entenderlo, las condiciones no significan nada. Las condiciones van antes de la práctica porque es lo que el vendedor quiere saber para decidir si le compensa.

1. **Qué vendemos:** los paquetes o servicios, con una frase, para quién son y el precio orientativo (si el admin lo muestra).
2. **A quién:** el cliente ideal de cada sector y quién decide, quién paga y quién puede tumbar la venta.
3. **Cómo se vende:** las jugadas del playbook, marcadas con honestidad:
   - **Comprobado:** ganó en N ventas documentadas.
   - **Hipótesis:** es lo que el equipo cree; aún no hay ventas que lo demuestren.
4. **Tus condiciones** (opcional): solo si el admin las ha marcado como acordadas. Si no: «Tus condiciones se acordarán cuando valides que se vende. Mientras, puedes vender con normalidad». Es el caso del colaborador precavido de Enjoy.
5. **Tu primera propuesta**, y conectar el Cerebro de Ventas.

Debe acabar con las preguntas resueltas en una sesión, desde el móvil y con poco texto.

### 4.2 El CEO desbordado no pierde a nadie

- Todo interesado tiene **dueño y próximo paso con fecha**. Si no lo tiene, aparece el primero en Inicio.
- **Resumen diario** (email ahora, WhatsApp después) con lo vencido y lo de hoy, cada uno con su **mensaje propuesto** generado con el contexto y el Cerebro (ya existe «Preparar mensaje»).
- **Un clic** para hecho, posponer o delegar a otro vendedor.
- El CEO puede **reasignar** cuentas e interesados a colaboradores cuando no llega.

### 4.3 Venta diaria del comercial

Inicio → Hoy → abrir la cuenta o la oportunidad → preparar el mensaje → registrar el contacto o mover la etapa → crear o enviar la propuesta → ganar y declarar el cobro (o que llegue solo por Stripe).

### 4.4 Equipo, territorio y reglas

Delegaciones → zonas → personas. La regla de contacto («no se vuelve a contactar a esta cuenta en 15 días») es configurable. Las condiciones de cada persona son opcionales y versionadas.

### 4.5 Dinero

Cobro en Stripe (enlace de pago con el vendedor y la propuesta en los metadatos) → evento de ingreso → comisión → liquidación. Las suscripciones activas y canceladas alimentan la retención, el MRR y el LTV.

---

## 5. Arquitectura propuesta (para crecer)

### 5.1 Modelo de dominio v2

```
Empresa (tenant)
 ├─ Unidades (delegaciones, en árbol)  ← NUEVO: alcance de jefes y analítica
 ├─ Personas (membership: rol + unidad)
 ├─ Catálogo (productos, paquetes y precios; listas de precio por zona más adelante)
 ├─ Mercado (sectores, actores, situaciones) + Playbook (jugadas con evidencia)
 ├─ Territorio (zonas) + Reglas (reserva, contacto)
 ├─ Cuentas (CRM; el colaborador = cuenta asignada)   ← unifica partner_account
 │   └─ Oportunidades (etapa, valor, dueño, próximo paso)  ← NUEVO
 │       ├─ Propuestas (dossiers, enlaces)
 │       ├─ Contactos (mapa de poder)
 │       └─ Actividades y tareas (contacto, seguimiento, nota)  ← unifica próximo paso e historial
 ├─ Ingresos (eventos) ← Pasarelas (Stripe primero) y API
 ├─ Comisiones (planes, libro, liquidaciones) + Condiciones por persona (opcionales)
 ├─ Gastos (CSV ahora; banco después) → CAC
 └─ Eventos de dominio (outbox) → avisos, email, WhatsApp, Cerebro, webhooks
```

### 5.2 Una sola implementación de datos

Sustituir la demo en memoria por **Postgres de verdad también en demo y en tests**: PGlite (Postgres en WebAssembly, en el mismo proceso) o un Postgres local. Las mismas migraciones, triggers y RLS en todas partes.

- Se borran unas 1.600 líneas duplicadas.
- Cada requisito se escribe una vez.
- Los tests prueban lo que va a producción.

**Requiere un spike de un día** para confirmar que la RLS y `auth.uid()` funcionan en PGlite sin PostgREST, es decir, si la capa de datos pasa a SQL directo con el usuario en la sesión. Es el cambio con más retorno.

### 5.3 Eventos de dominio (outbox)

Cada hecho (venta ganada, contacto, cobro, aporte, conflicto…) se escribe en `domain_event`. Los avisos, emails, WhatsApp, la sincronización con el Cerebro y los webhooks de clientes **leen de ahí**. Hoy cada trigger escribe su aviso: funciona, pero no escala a más canales.

### 5.4 Pasarelas de pago (adaptadores)

Una interfaz `PaymentProvider` (crear enlace de pago con metadatos, recibir webhooks, listar suscripciones), con **Stripe** como primera implementación. Redsys u otras, después, sin tocar el motor.

**Atribución:** cada enlace de pago lleva `tenant`, `vendedor`, `propuesta` y `cupón` en los metadatos. Así no hay ventas genéricas: se sabe que la vendió Álvaro.

### 5.5 Alcance por unidad (delegaciones)

- **Una persona puede estar en varias delegaciones y en varias empresas** (decisión del 3/10): en lugar de `membership.unit_id`, una tabla `membership_unit (user, tenant, unit)`; sin filas = toda la empresa.
- Una función `can_see(unit)` en SQL que usan todas las políticas.
- Un vendedor de Enjoy y de Oquea entra una vez y cambia de empresa sin volver a identificarse (cookie compartida en `*.ventas.cofundo.io`).
- El CEO ve todas las unidades consolidadas; el jefe de delegación, la suya.
- Encaja con la RLS actual si se hace **antes** de que crezcan los datos.

### 5.6 Analítica con dinero real

Vistas SQL sobre ingresos, suscripciones, oportunidades y gastos:
- ventas y MRR por vendedor, unidad y empresa;
- retención y duración media de un cliente, LTV;
- CAC (gastos del vendedor ÷ clientes nuevos);
- efecto del Cerebro («desde que usa el Cerebro, +X % de cierre»).

Parámetros configurables para empresas que ya los conocen (duración media, contrato mínimo). Las startups empiezan con los valores calculados.

### 5.7 Integración con el Cerebro de Ventas

Actualizado con la respuesta del Cerebro (`docs/RESPUESTA_CEREBRO.md`, 3/10/2026):

- **Bases de datos separadas.** El Cerebro sirve todo a través de la vista `fichas_servibles`, que aplica sus reglas: creador autorizado, ficha publicada y guion solo si el acuerdo lo permite. Si otro producto leyera sus tablas directamente, esas reglas dejarían de aplicarse sin que nada avisara. Por eso Ventas tiene su propio proyecto (`cofundo-ventas`).
- **Identidad:** la misma persona es el mismo correo en los dos productos. Compartir solo el proveedor de identidad queda como mejora futura, en la fase Escala: el Cerebro ya usa el servidor OAuth de Supabase y Ventas podría entrar con él. Hasta entonces, cada producto tiene su acceso por código y se enlazan por email.
- **Cada producto es invisible para quien no lo usa.** Nada de Ventas aparece en el Cerebro a quien no tenga Ventas, y al revés.
- **Al Cerebro, el papel y nunca el nombre.** El texto de cada consulta se guarda 30 días y se envía a OpenAI, en EE. UU., sin acuerdo de transferencia firmado. Ventas compone la situación sin nombres propios («un DJ de ocio nocturno», no «DJ Toni de Sala X») e incluye lo que ha leído el cliente («ha abierto la propuesta 3 veces y donde más se ha parado es en el precio»). Hecho; lo protegen tests (`src/lib/playbook/context.test.ts`).
- **Etapa y objeción** solo con los valores exactos del Cerebro. Ya coinciden: 9 etapas y 7 objeciones.
- **El MCP es por persona** (token OAuth de cada vendedor): el servidor de Ventas no puede llamarlo. La integración servidor a servidor será una **API HTTP del Cerebro con clave de servidor**, que construirán contra un contrato cerrado que hay que acordar antes de programar nada.
- **Qué mandará Ventas:** el resultado de cada venta con las fichas usadas (`{ ficha_ids, resultado: ganada | perdida, cuándo }`), sin cliente ni importe, y las consultas que no encuentran nada.
- **Qué podrá dar el Cerebro**, con permiso del vendedor: patrones de fallo (diseñados, aún no construidos), en qué etapas consulta, cuánto consulta y qué búsquedas no encuentran nada. El cruce con los resultados lo hace Ventas.
- **Sin «+5 % de ventas desde que usa el Cerebro».** Con pocos usuarios y sin grupo de control sería una correlación presentada como causa. Se enseña lo defendible: cuánto consulta, qué patrones repite, si bajan y qué técnicas aparecen en las ventas ganadas.
- **Privacidad ante el CEO.** Ve patrones («seguimiento pasivo 7 veces este mes»), nunca la frase literal de su vendedor. Si Ventas enseña datos del Cerebro a un jefe, necesita una pantalla de transparencia donde el vendedor vea lo mismo que ve su jefe.
- **Marca de los creadores.** Atribuir siempre, con el creador y el enlace al vídeo original en su minuto (`fuente_url` + `fuente_timestamp`). Nunca usar su nombre como reclamo: ningún creador lo autoriza hoy (`puede_usar_marca = false`).
- **Enlace para vendedores:** el Cerebro se usa dentro de Claude o ChatGPT; la guía para conectarlo está en `https://cofundo.io/tutorial`. `cerebro.cofundo.io` es solo la pantalla de autorización. Corregido en «Empieza aquí».
- **Bloqueo del lado del Cerebro:** todavía no guardan qué fichas devolvió cada consulta. Lo añaden en su cola corta, porque también lo necesitan para el reparto con los formadores. Sin ese dato no se puede atribuir «qué técnicas usa este vendedor».

### 5.8 Seguridad, en su medida

- **Se mantiene:**
  - aislamiento entre empresas (RLS);
  - dinero (libro inmutable, idempotencia);
  - permisos de acceso;
  - claves solo en el servidor.
- **Se simplifica:** desaparece la réplica manual de cada regla en la demo (§5.2). Las reglas de negocio blandas (textos, preferencias) no necesitan trigger.

---

## 6. Principios de producto y UX

1. **«Añadir» arriba a la derecha**, con menú de lo que se puede crear en esa pantalla (Añadir actor, Añadir sector…). Nada de formularios siempre visibles.
2. **Modales con asistentes** de pocos pasos, **iconos** y **valores por defecto**: se acepta con un clic y se ajusta solo si hace falta.
3. **Poco texto:** una frase de ayuda como mucho; el resto, en «¿Qué es esto?».
4. **Lo urgente primero:** vencido, después hoy, después lo demás. En cada pantalla.
5. **Humildad con los datos:** comprobado frente a hipótesis; nada de cifras que no salgan de dinero real.
6. **Vender, desde el móvil. Configurar, desde el escritorio** (sin romperse en el móvil).
7. **Lo opcional, opcional:** condiciones, precios por zona y situaciones aparecen cuando hacen falta.

---

## 7. Método de trabajo (checkpoints)

1. **Desarrollar:** la función, con sus tests unitarios y de contrato.
2. **Validar:** el fundador la prueba en la demo y dice «validado».
3. **Congelar:** lo validado pasa a `docs/VALIDATED.md` con el test de extremo a extremo que lo protege. Desde ahí, si un cambio rompe ese test, se rehace el test (si cambió el requisito) o se arregla el código. **Nunca se salta ni se deja fallando.**
4. **Documentar:** en cada checkpoint se actualizan este documento (estado), el doc del módulo y el registro de validados.
5. **Subagentes:** cada encargo incluye sus tests y no se da por hecho sin `check`, `lint:copy`, tests y smokes en verde.

---

## 8. Fases

Estado a 3 de octubre de 2026: ✅ Empieza aquí (`/admin/start`, condiciones opcionales desde Comisiones → Plan → «Condiciones acordadas») · ✅ acceso con código según la guía (código primero, «espera N segundos», email pendiente 1 h, plantillas con el estilo de la guía). ✅ Resumen diario de seguimientos (email a las 7:00 hora local, con el mensaje preparado). ✅ Bienvenida paso a paso (`/admin/welcome`): una idea por pantalla, termina creando la primera propuesta; los admins tienen además «Prepara a tu equipo». Pendiente del MVP: «Añadir» + modales en Configurar y el espacio de Oquea.

| Fase | Contenido | Para |
|---|---|---|
| **MVP ya** (los 3 vendedores que esperan) | Empieza aquí (§4.1) con condiciones opcionales · acceso con código según la guía · Inicio con seguimientos · «Añadir» + modales en Configurar | O1, O2 |
| **Cimientos** | Una sola implementación de datos (§5.2, `docs/SPIKE_DATA.md`) · entorno de desarrollo `cofundo-ventas-dev` · desarrollo local en un comando · oportunidades y tareas (§5.1) · cuentas unificadas · outbox de eventos | Velocidad y O2/O4 |
| **Dinero real** | Stripe (enlaces con atribución, webhooks, suscripciones) · analítica por vendedor | O5, O6 |
| **Escala** | Delegaciones y roles por ámbito · analítica consolidada · precios por zona | O8, O6 |
| **Inteligencia** | WhatsApp con mensajes propuestos · integración con el Cerebro (rendimiento y fallos) · gastos por CSV con mapeo por IA → CAC | O2, O6, O7 |

---

## 9. Preguntas abiertas

Las preguntas para decidir están al final de la respuesta de cada checkpoint. Aquí quedan las respuestas.

### Decisiones del 3 de octubre de 2026

| Tema | Decisión | Qué implica |
|---|---|---|
| Una sola implementación de datos | **Sí**, con una prueba de un día primero | Resultado en `docs/SPIKE_DATA.md` |
| Dossier frente a oportunidad | **Sí, separarlos.** Antes, una analítica de dossiers para ver cómo se usan | Hecho: analítica de dossiers (`docs/ANALYTICS.md`) |
| Identidad con el Cerebro | Habrá usuarios solo del Cerebro, solo de Ventas y de los dos | **Resuelto con el Cerebro:** bases de datos separadas, mismo email como identidad y proveedor de identidad común como mejora futura (§5.7). Proyecto de Ventas: `cofundo-ventas` |
| Historial de condiciones | **Sí**, registrado y accesible, no escondido ni a la vista todo el rato | Hecho: historial automático y desplegable en «Empieza aquí» y en Comisiones → Plan |
| Primeros vendedores | Amrit (Enjoy · conciertos y artistas), Ángel (Enjoy · Results) y Uyong (Oquea · Corea, empezando por el QR gratuito). Emails más adelante | Falta el espacio de Oquea y el catálogo real de cada uno |
| Delegaciones y empresas | Un vendedor puede estar en **varias delegaciones y varias empresas**. Los vendedores pueden acabar vendiendo también este software | `membership_unit` (§5.5) y acceso único entre empresas |
| Stripe | **Una cuenta por empresa.** Importar el histórico para tener el registro completo. Atribución del vendedor con un identificador en el enlace de pago | §5.4: conexión por empresa, importación inicial y `metadata.seller` en los enlaces |
| LTV, CAC y vida media | Calcular todo lo que se pueda **automáticamente**. Los parámetros manuales son opcionales; las startups probablemente no los sepan | Las cifras salen de los datos; un campo vacío dice «aún no lo sabemos» |
| Gastos por vendedor | Cofundo empieza a usar **Holded** | Conector de Holded como primera fuente de gastos (CSV como respaldo) |
| WhatsApp | La integración más rápida y sencilla, con coste razonable: **API oficial de Meta** | Cloud API de Meta con plantillas aprobadas para los avisos |
| Cerebro de Ventas | Respondido por su agente (`docs/RESPUESTA_CEREBRO.md`) | Cambios aplicados y plan en §5.7 |
| Desarrollo local | Vale que requiera Postgres. Empaquetarlo en un solo comando, en la hoja de ruta y no ahora | Fase Cimientos: `npm run dev:local` (Postgres + PostgREST) o Docker |
| Segundo proyecto | Primero el MVP de los tres vendedores | Fase Cimientos: proyecto `cofundo-ventas-dev`, copia de producción con datos de prueba (`docs/PUESTA_EN_MARCHA.md` §10) |
| Validación | Primero «Empieza aquí» y el acceso con código | Prueba guiada en `docs/PUESTA_EN_MARCHA.md` §G |
| Dominio | Subdominio de Cofundo | `*.ventas.cofundo.io` y `demo.ventas.cofundo.io` (`docs/PUESTA_EN_MARCHA.md`) |
