# Conecta tu IA (servidor MCP)

Criterio de Cristian: «lo que ya hacemos por WhatsApp, por MCP, para que los usuarios lo puedan conectar a su IA
directamente».

El CRM habla MCP (Model Context Protocol): cada persona conecta su IA y la usa con el CRM con sus permisos de siempre.
La IA puede ser Claude (Claude Code, Claude Desktop, claude.ai), ChatGPT, Cursor, VS Code…

## Cómo se conecta

**Mi cuenta → Conecta tu IA** lleva a `/admin/ia`. El diseño copia el tutorial de conexión del Cerebro (repositorio
AIBrains, `docs/tutorial-conectar.md`):

- **La dirección entera**, con su `https://` (`https://<dominio del espacio>/api/mcp`), y **el nombre ya puesto**
  («<Espacio> CRM»): no hay que inventarse nada. Las dos cosas con «Copiar».
- **Una pestaña por IA**:
  - **Claude** (recomendado): sus pasos, y cómo se ve la ventana «Agregar conector personalizado» con los dos campos ya
    rellenos (una emulación, no una captura: no envejece y se lee en el móvil). Dice qué NO tocar: las opciones de
    autenticación ya vienen detectadas.
  - **ChatGPT**: el modo desarrollador y la misma dirección.
  - **Claude Code**: `claude mcp add --transport http …` y después `/mcp` para entrar.
  - **Cursor y VS Code**: el `mcp.json` con la dirección; entra con la cuenta la primera vez.
  - **Con clave**: para herramientas que no saben entrar con una cuenta. La clave (`ss_mcp_…`) se enseña una vez, con
    las instrucciones ya rellenas.
- Cómo será la pantalla de «Autorizar».
- **Pruébalo**: «¿Qué me toca hoy?». Se acaba probándolo, no en «ya está conectado».
- **Tus conexiones**: las de cuenta («Claude · Con tu cuenta») y las de clave, cuándo se usaron y «Revocar» (deja de
  valer al momento). Como mucho 10 activas.

## OAuth (conectar con la cuenta)

Servidor de autorización propio, en la misma app. El Cerebro usa el de Supabase, pero aquí no sirve tal cual:

- Hay que activarlo en el panel de Supabase.
- Sus tokens son de la persona y no de un espacio.
- No saldrían en «Tus conexiones» para revocarlos.

Lo aprendido del Cerebro (AIBrains `docs/fase-2-auth.md`) se aplica igual:

- **Descubrimiento**:
  - Sin token, `/api/mcp` responde 401 con `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/api/mcp"`.
    Claude solo lo mira en un 401.
  - `/.well-known/oauth-protected-resource[/api/mcp]` (RFC 9728): `resource` es igual, carácter a carácter, a la URL que
    se pega.
  - `/.well-known/oauth-authorization-server` (y `openid-configuration`, RFC 8414).
  - Los sirve una ruta de verdad, `src/pages/.well-known/[...doc].ts` (lo que dicen: `src/lib/mcp/well-known.ts`). En
    Vercel, una dirección sin ruta sale con 404 aunque el middleware conteste. Así falló el primer «Agregar conector»
    en claude.ai: «No se pudo registrar con el servicio de inicio de sesión».
- **CIMD** (Client ID Metadata Documents), lo que claude.ai usa por defecto («Usar la identidad publicada de Claude»):
  - No se registra: su `client_id` es la URL https de su ficha (nombre y vueltas). El servidor lo anuncia con
    `client_id_metadata_document_supported: true`.
  - La ficha se lee al usarla, con el mismo cuidado que la web de una empresa: solo direcciones públicas (comprobado
    al conectar), 5 s, JSON, como mucho 64 KB. Tiene que decir que es ella misma (`client_id` igual a su URL) y traer
    vueltas válidas.
  - Se guarda en `oauth_client`, con caché de 10 minutos. Si luego no se puede leer, vale la guardada: un fallo suyo no
    corta un refresco.
  - Migración 20270119: el `client_id` puede ser también una URL https (como mucho 200 caracteres).
- **Registro dinámico** `/oauth/register` (RFC 7591):
  - Solo clientes públicos (sin secreto): el PKCE S256 es obligatorio. Pida el método que pida, se le registra como
    `none`.
  - Vueltas permitidas: https, http solo en localhost/127.0.0.1, o el esquema propio de una app (`cursor://…`). Nunca
    `javascript:`, `data:`, `file:`…
- **Autorizar** `/admin/oauth/authorize`:
  - Sin sesión, al login y de vuelta (`safeNext` acepta `+` y `~` de la consulta).
  - Enseña qué app pide qué, como quién, en qué espacio y adónde vuelve.
  - Nunca redirige a una vuelta no registrada para ese cliente. En loopback el puerto no cuenta: Claude Code usa uno
    distinto cada vez.
  - Sin marcos (`frame-ancestors 'none'`).
  - Al autorizar: código de un solo uso, 10 minutos, solo su hash, con el reto PKCE. Vuelve con `code`, `state` e `iss`.
- **Token** `/oauth/token`:
  - Acepta form-urlencoded y JSON.
  - Código + verificador → token (8 h) y refresco (90 días). El código se marca usado antes de dar nada.
  - Refresco con rotación: los dos nuevos, y el refresco viejo deja de valer.
  - Revocar: `/oauth/revoke` (RFC 7009) o «Revocar» en la página.
- **Tablas**: `oauth_client`, `oauth_code` y, en `mcp_token`, `refresh_hash` y `refresh_expires_at` (migración
  20270118). Sin políticas: solo el servidor.
  - La persona solo puede revocar.
  - El servidor puede rotar (el guard deja cambiar token y refresco solo fuera de los roles `authenticated`/`anon`).
- Pruebas:
  - `src/lib/mcp/oauth.test.ts`: PKCE, vueltas, coincidencia, metadatos y CIMD.
  - Test SQL 94: la persona no rota; el servidor sí; `client_id` de CIMD sí, http o demasiado largo no.
  - `scripts/smoke-mcp-oauth.cjs`: el flujo entero, como claude.ai, y lo que no debe pasar.

## Qué puede hacer (herramientas)

| Herramienta | Qué hace |
|---|---|
| `buscar_empresas` | Por nombre (a medias, sin tildes). |
| `ver_empresa` | La ficha: estado, quién la lleva, contacto, próximo paso, cualificación y lo que falta, lo importante, personas, últimas interacciones, propuestas. |
| `lo_de_hoy` | Lo que se enfría, lo atrasado, lo de hoy y mañana (lo mismo que el recordatorio de la mañana). |
| `registrar_contacto` | Llamada, WhatsApp, visita… y cómo fue (renueva la reserva; el CRM propone el siguiente paso). |
| `proximo_paso` | Qué y cuándo (día y hora, en su zona horaria). |
| `preguntas_cualificacion` / `cualificar` | Lo que falta, con sus opciones, y marcarlo (sin desmarcar lo que ya estaba). |
| `anotar_dato` | Un dato de la empresa; `importante` lo pone arriba. |
| `crear_empresa` | Con su ciudad y tipo. Si ya existe una con ese nombre, la devuelve y no duplica. |
| `anadir_persona` | Y la vincula a una empresa con su papel. |
| `preparar_apunte` → `guardar_apunte` | Como el asistente de WhatsApp: lo que cuenta con sus palabras → qué se guardaría en cada empresa (con candidatas) → guardar tras confirmar. Usa la IA del espacio (su tope diario). |

Las herramientas de una en una no gastan la IA del espacio: entiende la IA de la persona y la app guarda.

## Cómo funciona

- **Servidor**: `src/pages/api/mcp.ts`, Streamable HTTP sin estado, respuestas JSON (vale en Vercel). Solo POST; GET y
  DELETE dan 405 porque no hay sesiones. CORS abierto: la llave es la clave, no hay cookies. El middleware lo deja pasar
  sin el control de origen.
- **Herramientas**: `src/lib/mcp/tools.ts` (SDK oficial `@modelcontextprotocol/sdk`).
  - Pasan por los mismos servicios que la web y WhatsApp (`AdminContext` de esa persona por `contextAs`, el mismo que usa
    WhatsApp), así que los permisos y las reglas son los de siempre.
  - El contexto se monta solo al usar una herramienta: `initialize` y `tools/list` no tocan la base de datos.
  - Los errores del CRM vuelven como texto para la IA, en el idioma de la persona (Accept-Language).
- **Claves**: `src/lib/mcp/tokens.ts`; tabla `mcp_token` (migración 20270117; test SQL 94).
  - Se guarda solo el sha256. Cada uno ve, crea y revoca las suyas (RLS); al revocar solo cambia `revoked_at`.
  - El servidor las comprueba con service role y apunta `last_used_at` como mucho cada 5 minutos.
  - `client_id` y `expires_at` quedan para el OAuth.
- Pruebas: `scripts/smoke-mcp.cjs`. Hace con un cliente MCP de verdad todo lo de arriba: clave, herramientas, apunte,
  errores y revocación.

## Pendiente

- claude.ai ya funciona en producción (Oquea, 23/11/2026, con las opciones que vienen por defecto: CIMD). Falta
  probar ChatGPT y ajustar el texto de sus pasos a lo que se vea.
- Tope de peticiones por clave (hoy solo cuenta el tope de IA en `preparar_apunte`).
- Tope de registros dinámicos (hoy cualquiera puede registrar un cliente; sin autorizar no consigue nada).
