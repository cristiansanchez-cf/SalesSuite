# Conecta tu IA (servidor MCP)

Criterio de Cristian: «lo que ya hacemos por WhatsApp, por MCP, para que los usuarios lo puedan conectar a su IA
directamente».

El CRM habla MCP (Model Context Protocol): cada persona conecta su IA y la usa con el CRM con sus permisos de siempre.
La IA puede ser Claude (Claude Code, Claude Desktop, claude.ai), ChatGPT, Cursor, VS Code…

## Cómo se conecta

- **Mi cuenta → Conecta tu IA** (`/admin/account#ia`).
  - La dirección del servidor: `https://<dominio del espacio>/api/mcp`.
  - **Crear clave**: se le pone un nombre («Claude del portátil»).
  - La clave (`ss_mcp_…`) se enseña **una vez**, con las instrucciones ya rellenas para Claude Code, Cursor/VS Code
    (`mcp.json`) y Claude Desktop (`mcp-remote`).
  - La lista muestra cuándo se usó cada clave y permite **Revocar** (deja de valer al momento). Como mucho 10 activas.
- **Fase 2 (pendiente)**: OAuth, para añadirlo en claude.ai y ChatGPT con un clic entrando con la cuenta. El servidor ya
  responde 401 con `WWW-Authenticate: Bearer resource_metadata=…/.well-known/oauth-protected-resource`, como pide el
  protocolo.

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

- OAuth 2.1 (PKCE y registro dinámico) para claude.ai y ChatGPT.
- Tope de peticiones por clave (hoy solo cuenta el tope de IA en `preparar_apunte`).
