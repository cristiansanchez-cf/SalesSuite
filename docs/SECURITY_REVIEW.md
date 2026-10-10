# Revisión de seguridad y mantenimiento (checkpoint 10-oct-2026)

Revisión completa antes de seguir creciendo (CRM con datos de clientes de empresas, varios espacios: Enjoy, Oquea y los
que vengan). Qué se miró, qué se arregló y qué queda pendiente, por orden de gravedad.

## Arreglado

| Gravedad | Qué pasaba | Arreglo |
|---|---|---|
| Alta | **Contacto del comercial entre espacios.** El contacto que ven los clientes en la propuesta estaba en el perfil global (`users`). El admin de *otro* espacio podía invitar a un comercial y cambiarle el WhatsApp que ven los clientes de *este*. | Va por espacio, en la membresía (`membership.contact_*`). `set_my_contact(tenant, …)` para el propio; `set_member_contact` solo cambia el de su espacio; `get_public_contact` lee el del espacio de la propuesta. Prueba del ataque en `55_rep_contact.test.sql`. |
| Media | **Enlaces `javascript:`.** Web, Instagram, LinkedIn… se pintaban como enlace tal cual. Escribiendo directamente por la API se podía guardar `javascript:…`. | Restricción `^https?://` en `account` y `crm_contact` (NOT VALID: no bloquea datos viejos). `safeHref` en todas las pantallas que pintan enlaces. La IA: lo que no trae fuente http(s) se descarta al leerlo. El importador guarda siempre la URL completa. |
| Media | **Leer webs de empresas (SSRF).** La comprobación de IP privada se hacía al resolver; con *DNS rebinding* la conexión podía ir a otra IP. Faltaban rangos (IPv4 dentro de IPv6, NAT64, 198.18/15…). | La IP se comprueba **al conectar** (`lookup` propio en `node:http(s)`), con la lista de rangos ampliada. Pruebas en `website.test.ts`. |
| Media | **Coste sin tope.** Google y la IA cuestan dinero por llamada; cualquiera del equipo podía lanzar miles. | Tope por persona y día (`usage_counter` + `bump_usage`): 300 Google, 40 IA. |
| Media | **La base de datos dejaba más que la app.** Mover y clasificar en bloque y los arreglos (`crm_fix`) los podía hacer un gerente llamando a la API, aunque la app solo se lo enseña al admin. El CSV de Territorio dejaba a un gerente. | Solo admin también en SQL (`crm_move_accounts`, `crm_classify_accounts`, política `crm_fix_admin`) y en la demo. `importCsv` exige `importCrm`. |
| Baja | Demo distinta de Postgres: `saveZone` perdía el punto del mapa; clasificar en bloque no era atómico; `setZoneLocation` sin rango. | Igualados; el contrato de cuentas lo prueba en las dos (`accounts.contract.ts`, «CRM fase 4»). |
| Baja | «Situar ciudades» podía quedarse en bucle con ciudades que Google no encuentra. | El navegador manda las fallidas para saltarlas (`skip`). |

Migración: `supabase/migrations/20261117000000_security_hardening.sql`. Pruebas nuevas: `59_security_hardening.test.sql`,
`safe-href.test.ts`, `permissions-crm.test.ts` (matriz de roles), contrato «CRM fase 4», y en `smoke-cleanup.cjs` que
un comercial no entra en Datos del CRM. CI pasa ahora también `smoke-org`, `smoke-personalize` y `smoke-setup-ai`.

## Pendiente (anotado, sin arreglar todavía)

- **CSP** (Content-Security-Policy): la consola no la manda. Hoy el riesgo está acotado (Astro escapa todo y los
  enlaces pasan por `safeHref`), pero es la red de seguridad que falta. Hay que listar los orígenes (MapTiler, OSM,
  Google Fonts, Supabase, Stripe) y probarla en modo *report-only* primero.
- **Detalle del error de la IA** (`aiReason`): enseña al admin el motivo técnico del fallo. Útil para depurar; revisar
  que no lleve nada interno antes de abrirlo a más roles.
- **Partners y `ai_research`**: la política de lectura de la investigación con IA deja leer a un partner lo de las
  cuentas que ve. No es de otro espacio, pero decidir si un partner debe verla.
- **Paridad demo / Postgres** en recortes de texto (la demo no siempre corta a la misma longitud que SQL).
- **Listas muy largas en `in()`** de PostgREST: con miles de ids la URL puede pasarse de largo; trocear si aparece.
- **Orden alfabético**: Postgres ordena con su *collation*; la demo con `localeCompare`. Puede variar con tildes.

## Multiespacio: lo que aún es «de Enjoy»

La revisión encontró supuestos de Enjoy (ocio nocturno, España) que también ven otros espacios. No son una fuga de
datos (cada espacio solo ve lo suyo, RLS por `tenant_id`), pero sí de **criterio**: Oquea (centros de buceo, ONGs) vería
preguntas y textos de discotecas.

- Prompt y claves de cualificación de la investigación con IA (`research.ts`), criterios de prioridad y eliminatorios
  (`priority.ts`), el prompt de Limpiar (`cleanup.ts`), el tipo «DJ» (`account.kind`).
- País de casa España y prompts en español (`zones-normalize.ts`), `regionCode 'ES'` en Google (`places.ts`).
- Iconos y nombres de tipos del mapa; textos de ejemplo («Nombre del local», «Club Sol»).

Se arregla con la configuración del CRM por espacio de «Configura tu CRM» (siguiente fase): cada espacio guarda su país,
idioma, tipos de cliente, cualificación y eliminatorios, y Enjoy queda como un espacio más con lo de hoy como semilla.

## Cómo se comprueba

`npx astro check` (0 errores, 0 avisos), `npx vitest run`, `bash supabase/tests/run-local.sh`,
`bash supabase/tests/run-it.sh` (contratos sobre Postgres) y los smokes de `.github/workflows/ci.yml`.
