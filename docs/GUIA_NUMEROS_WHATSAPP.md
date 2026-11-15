# Guía: los números de WhatsApp (Enjoy, Cofundo y el agente)

> Para Cristian, para hacerlo por tu cuenta sin la sesión de Claude. Escrita el 15 de noviembre de 2026.
> Lo técnico de fondo: `docs/ASSISTANT.md` (el agente) y `docs/LEADS.md` §7 y §8 (WhatsApp a los leads).
> Los menús de Meta cambian de nombre a menudo: si algo no está donde dice, búscalo por la palabra en negrita.

## 1. Qué número hace qué

| Número | Para qué | ¿Está en Meta (API)? | ¿WhatsApp en el móvil? |
|---|---|---|---|
| **Personal** | Tus cosas | No | Sí, el normal |
| **Enjoy** (el 69…, el que ya está) | Escribir y responder a los clientes de Enjoy (automático + tú a mano) | Sí, ya está | Sí (WhatsApp Business, si ya lo tienes en coexistencia) |
| **Cofundo** (nuevo) | Escribir y responder a los clientes de Cofundo (automático + tú a mano) | Sí (paso 4) | Sí, WhatsApp Business |
| **Agente** (nuevo) | El asistente: solo le escribe el equipo (tú y los comerciales) para apuntar en el CRM | Sí (paso 2) | **No. Nunca instales WhatsApp con este número** |

Hoy el agente vive en el número de Enjoy. Al terminar esta guía, el número de Enjoy queda **solo para clientes de
Enjoy** y el agente pasa a su propio número.

**Por qué el agente necesita su propio número:** un número no puede escribirse a sí mismo (ese chat no pasa por Meta).
Tú escribirás al agente desde el móvil de Enjoy o el de Cofundo, y los comerciales desde los suyos.

## 2. Primero: el número del agente (lo más rápido y lo que más usarás)

Todo en la **misma cartera de Meta que Enjoy** (la que ya funciona). Así sirve el mismo token, la misma app y el mismo
webhook: no hay que tocar nada técnico salvo una variable en Vercel.

1. **Mete la SIM del número del agente en un móvil cualquiera**, solo para recibir el SMS o la llamada de verificación.
   **No instales WhatsApp ni WhatsApp Business con él**: si el número está en una app de WhatsApp, Meta no deja
   añadirlo a la API (o te obliga a borrarlo de la app).
2. **Meta Business Suite → WhatsApp Manager** (business.facebook.com → Cuentas de WhatsApp → la de Enjoy) →
   **Números de teléfono → Añadir número de teléfono**.
   - **Nombre visible:** Meta lo revisa y tiene que tener relación con la empresa de la cartera. Mientras sea la
     cartera de Enjoy, algo como «Enjoy the Club · Asistente» pasa sin problemas. (No lo ven los clientes: solo el equipo.)
   - Categoría: la que encaje (Servicios profesionales, por ejemplo).
   - Verifica con el **SMS o la llamada**.
3. Cuando salga en la lista: **copia su «Phone number ID»** (un número largo; no es el teléfono). Si te pide un **PIN de
   verificación en dos pasos**, ponle uno y guárdalo en tu gestor de contraseñas.
4. **Comprueba que el token sigue sirviendo:** Configuración del negocio → **Usuarios del sistema** → el que creaste para
   el CRM → **Activos asignados**: tiene que tener la cuenta de WhatsApp de Enjoy con control total. Como el número
   nuevo está en esa misma cuenta, no hace falta un token nuevo.
5. **Vercel** → el proyecto → Settings → **Environment Variables** (Production):
   - `ASSISTANT_WHATSAPP_PHONE_ID` = el *Phone number ID* del paso 3.
   - Opcional: `ASSISTANT_WHATSAPP_NUMBER` = el número tal como quieres que se enseñe (`+34 6xx xxx xxx`). Si no lo
     pones, la app se lo pregunta a Meta.
   - **Deployments → los tres puntos del último → Redeploy.**
   - Comprueba: abre `https://enjoy.ventas.cofundo.io/api/health` → tiene que decir `assistantNumberConfigured: true`.
6. **Plantillas del recordatorio de la mañana** (`equipo_recordatorio_es`, `_en`, `_fr`): son de la cuenta de WhatsApp,
   no del número, así que **si ya las tenías aprobadas en la de Enjoy, valen**. Si no, créalas como dice
   `docs/ASSISTANT.md` (tabla «Recordatorios de la mañana»), categoría *Utility*.
7. **Que el agente sepa quién eres:**
   - Tienes que ser **miembro** (admin o comercial) de cada espacio con el que quieras trabajar: Oquea, Enjoy, SciScreen
     y, cuando exista, Cofundo. Ser superadmin no basta. Se hace en cada espacio → Configurar → **Equipo**.
   - **Mi cuenta → Teléfono**: el número **desde el que le vas a escribir**. Hoy solo se admite **uno por persona**
     (ver §6): pon el de Cofundo o el de Enjoy, el que vayas a usar para hablar con el agente.
   - Cada comercial igual: su móvil de trabajo en Mi cuenta.
8. **Prueba:** desde ese móvil, escribe «hola» al número del agente. Te preguntará «¿Para qué empresa trabajas hoy?»
   con un botón por empresa. Elige, manda un audio («He hablado con Sala X, quieren…»), y te enseñará el resumen con
   **Guardar** / **Cambiar**. «empresa» vuelve a preguntar la empresa.
   - Si no contesta: el teléfono de Mi cuenta no coincide con el que escribe, o no eres miembro del espacio.
   - Si escribe otra persona que no es del equipo, el agente no contesta (es a propósito).

## 3. El espacio de Cofundo en el CRM (antes del número de clientes de Cofundo)

Los clientes que escriban al número de Cofundo tienen que caer en un CRM de Cofundo, que hoy no existe.

1. Entra como superadmin → **Plataforma → Nuevo espacio** → «Cofundo». Te quedará en `cofundo.ventas.cofundo.io`.
2. Añádete como admin y añade a los comerciales que vayan a vender Cofundo.
3. **Leads → Ajustes** del espacio de Cofundo:
   - **Email:** una cuenta de Resend de Cofundo con el dominio `cofundo.io` verificado (como hiciste con Enjoy:
     `docs/LEADS.md` §7, punto 4), remitente (p. ej. `hola@cofundo.io`), «Responder a», firma y a quién avisar.
   - Lo de WhatsApp lo rellenas en el paso 4.
4. Cuando la web de Cofundo tenga formulario de contacto, se conecta igual que la de Enjoy:
   `POST https://cofundo.ventas.cofundo.io/api/v1/leads` (contrato en `docs/LEADS.md` §1).

## 4. El número de clientes de Cofundo

Quieres dos cosas a la vez: que la app escriba sola el primer mensaje **y** contestar tú desde el móvil. Eso en Meta se
llama **coexistencia** (el mismo número en la app WhatsApp Business y en la API).

**Provisional, en la cartera de Meta de Enjoy** (lo más rápido; es lo que propones y funciona):

1. Instala **WhatsApp Business** en un móvil con la SIM de Cofundo y crea el perfil (nombre «Cofundo», foto, web
   `cofundo.io`). Úsalo con normalidad unos días si puedes: Meta puede pedir algo de actividad antes de dejarlo conectar.
2. Conéctalo a la API **con coexistencia**: en WhatsApp Manager (cuenta de Enjoy) → **Añadir número** → la opción de
   **usar un número que ya está en la app WhatsApp Business** (o «Conectar WhatsApp Business app»). Meta te pide escanear
   un QR desde la app del móvil (WhatsApp Business → Ajustes → **Plataforma empresarial** / dispositivos vinculados).
   Si no te sale esa opción en tu cuenta, busca «WhatsApp Business app coexistence» en la ayuda de Meta: la activan por
   países y por cuenta.
   - El **nombre visible** «Cofundo» en una cartera de Enjoy puede que Meta no lo apruebe a la primera (pide relación
     con la empresa). Si lo rechaza: o «Enjoy the Club · Cofundo» provisional, o pasa ya a la cartera propia (§5).
3. Copia el **Phone number ID** del número de Cofundo.
4. **Plantillas de Cofundo** en la cuenta de WhatsApp (las de Enjoy dicen «soy Cristian, de Enjoy the Club», no valen):
   copia `wa1` y `wa2` de `docs/LEADS.md` §8 cambiando «Enjoy the Club» por «Cofundo», categoría *Utility*, idiomas
   es/en/fr, con nombres propios: `cofundo_hola_es`, `cofundo_recordatorio_es`, etc.
5. En el espacio de Cofundo → **Configurar → Leads entrantes → WhatsApp a los leads** (paso a paso): pega el Phone number
   ID (lo comprueba contra Meta), pon los nombres de las plantillas de Cofundo y activa **Enviar por WhatsApp**.
6. **Leads → Ajustes → Activar** (arriba a la derecha) cuando «Lo que tienes» diga que está todo.
7. Prueba con un lead de prueba (`"test": true`) y luego uno real desde otro móvil.

Lo mismo vale para el de Enjoy: si el 69… no está en coexistencia y quieres contestar desde el móvil, el camino es el
mismo (paso 2).

## 5. Más adelante: Cofundo en su propia cartera de Meta

No es urgente. Cuando quieras separar Cofundo de Enjoy del todo:

- **No hace falta Instagram.** Una cartera (business.facebook.com → Crear cartera) se crea con tu cuenta de Facebook.
- **Verificar la empresa** (documentos de la sociedad + la web `cofundo.io`) no es obligatorio para empezar: sin
  verificar, Meta limita cuántas conversaciones puedes **empezar tú** al día y cuántos números tienes. Para responder a
  quien te escribe no hay límite.
- **Pero la app hoy usa un solo token de Meta para los leads de todos los espacios** (`WHATSAPP_TOKEN`). Con una cartera
  aparte haría falta un token por espacio: es un cambio en la app (§6). El agente sí admite su propio token
  (`ASSISTANT_WHATSAPP_TOKEN`).

## 6. Lo que falta en la app (pídemelo cuando vuelvas a tener sesión)

1. **Varios teléfonos por persona** en Mi cuenta, para que el agente te reconozca tanto si le escribes desde el móvil de
   Enjoy como desde el de Cofundo. Hoy, uno.
2. **Complementar en vez de sustituir:** con el resumen delante, un audio o texto nuevo **se añade** a lo anterior (hoy
   «Cambiar» descarta y hay que mandarlo todo otra vez). Botones: **Guardar** · **Añadir algo** · **Cambiar**.
3. **Token de Meta por espacio**, para el día que Cofundo tenga su propia cartera (§5).
4. (Opcional) Que el agente te pregunte la empresa solo si no la dices: «apunta en Oquea que…» iría directo.

## 7. Comprobaciones rápidas

- `https://enjoy.ventas.cofundo.io/api/health`: dice si están el token, el secreto del webhook y el número del agente.
- **Configurar → Asistente** (en cualquier espacio): a qué número escribe el equipo, quién tiene ya el teléfono puesto y
  un mensaje listo para pasar a los comerciales.
- Si un mensaje no llega a la app: Vercel → Logs, busca `webhook`. Si solo ves el `GET` de verificación y ningún `POST`,
  falta conectar la app a la cuenta de WhatsApp (`subscribed_apps`, `docs/LEADS.md` §7 punto 7).
- Nunca pegues tokens ni secretos en un chat: van solo en Vercel.
