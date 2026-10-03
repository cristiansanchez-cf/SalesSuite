# Puesta en marcha (Supabase + despliegue + dominio)

Guía para pasar de "funciona en demo" a **producción con Enjoy**. El código ya está preparado; estos pasos requieren tus cuentas (Supabase, Vercel, DNS de Enjoy), así que los haces tú. Tiempo estimado: **45–60 min**.

> **Importante:** nada de esto se ha creado todavía. No había acceso a ninguna cuenta de Supabase ni de Vercel desde el entorno de desarrollo. Todo lo probado se probó contra un Postgres + PostgREST locales que imitan Supabase (`npm run db:test`, `npm run db:it`).

## Resumen

| # | Paso | Dónde | Quién |
|---|---|---|---|
| 1 | Crear el proyecto | supabase.com | Tú |
| 2 | Aplicar las migraciones | Terminal (CLI) o SQL Editor | Tú (1 comando) |
| 3 | Configurar Auth: URLs, alta cerrada, plantillas, SMTP | Panel de Supabase | Tú |
| 4 | Copiar las claves | Panel de Supabase | Tú |
| 5 | Desplegar | Vercel (o Docker) | Tú |
| 6 | Dominio `pitch.enjoytheclub.es` | Vercel + DNS de Enjoy | Tú / quien gestione el DNS de Enjoy |
| 7 | Alta del tenant Enjoy | Terminal (`npm run tenant:bootstrap`) | Tú, con la carpeta `tenants/enjoy` que rellena el agente de Enjoy |
| 8 | Verificación | Navegador | Tú (checklist abajo) |

---

## 1. Crear el proyecto en Supabase

1. https://supabase.com/dashboard → **New project**.
2. Organización: la de Cofundo. Nombre: `salessuite`.
3. **Región: Central EU (Frankfurt)**. Los datos de prospectos son de clientes europeos.
4. Genera una **contraseña de base de datos** y guárdala en tu gestor de contraseñas. La pedirá la CLI.
5. Plan: Free sirve para probar. Para producción con clientes reales, **Pro**: copias de seguridad diarias y sin pausa por inactividad. Los proyectos Free se pausan tras una semana sin uso.

Apunta el **Project ref**, que aparece en la URL del panel: `https://supabase.com/dashboard/project/<ref>`.

## 2. Aplicar las migraciones

**Opción A: CLI (recomendada).** Desde la raíz del repo:

```bash
npx supabase login                         # abre el navegador
npx supabase link --project-ref <ref>      # pide la contraseña de la BD
npx supabase db push                       # aplica supabase/migrations/*.sql en orden
```

**Opción B: SQL Editor.** Abre cada archivo de `supabase/migrations/`, **en orden de nombre**, pégalo en *SQL Editor → New query* y ejecútalo.

> ⚠️ **No ejecutes `supabase/seed.sql` en producción.** Son datos de demo con dossiers y dominios de ejemplo. El tenant real se crea en el paso 7.

Comprobación: en *Table Editor* deben aparecer `tenant`, `domain`, `users`, `membership`, `module`, `module_version`, `dossier`, `dossier_item` y `share_link`, todas con RLS activado (candado). En *Storage* debe existir el bucket **`tenant-assets`**, marcado como público.

## 3. Configurar Auth

### 3.1 URLs (*Authentication → URL Configuration*)
- **Site URL:** `https://pitch.enjoytheclub.es`
- **Redirect URLs** (añade las tres):
  - `https://pitch.enjoytheclub.es/**`
  - `https://*.cofundo.app/**` (para los subdominios de plataforma, si los usas)
  - `http://localhost:4321/**` (desarrollo)

  Cada tenant nuevo con dominio propio = una línea más aquí.

### 3.2 Alta cerrada (*Authentication → Sign In / Providers*)
- **Allow new users to sign up: OFF.** Solo se entra por invitación, desde `/admin/team` o con el script de alta.
- Provider **Email**: ON. "Confirm email" puede quedar ON; las invitaciones ya confirman.

### 3.3 Plantillas de email (*Authentication → Emails → Templates*)
Copia el contenido de cada archivo de `supabase/templates/`:

| Plantilla | Archivo | Asunto |
|---|---|---|
| Invite user | `invite.html` | Te han invitado a la consola de dossiers |
| Magic Link | `magic_link.html` | Tu código para entrar |
| Reset Password | `recovery.html` | Elige una contraseña nueva |

**Este paso es obligatorio.** Las invitaciones con la plantilla por defecto no inician sesión en la app, que funciona en servidor. Las nuestras llevan al dominio del tenant (`/admin/auth/confirm`) y funcionan aunque el email se abra en otro dispositivo.

El acceso habitual es **sin contraseña: email → código de 6 dígitos**. Lo usan sobre todo los colaboradores ([`PARTNERS.md`](PARTNERS.md)). La plantilla *Magic Link* lleva el código (`{{ .Token }}`) y además el botón. En *Authentication → Sign In / Providers → Email*, deja **Email OTP Length = 6** y **Email OTP Expiration = 3600**.

### 3.4 SMTP propio (*Project Settings → Authentication → SMTP Settings*)
El email integrado de Supabase **solo envía a los miembros del equipo del proyecto** y tiene un límite muy bajo, así que las invitaciones a los comerciales de Enjoy no llegarían. Configura un SMTP:
- Recomendado: **Resend** (gratis hasta 3.000 emails/mes). Verifica el dominio de envío (p. ej. `cofundo.app` o `enjoytheclub.es`) y usa host `smtp.resend.com`, puerto `465`, usuario `resend` y tu API key como contraseña.
- Remitente: `Dossiers <no-reply@tu-dominio>`.

## 4. Claves (*Project Settings → API Keys*)

| Variable | Dónde está | Notas |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) | Pública |
| `PUBLIC_SUPABASE_ANON_KEY` | `anon` / *publishable* key | Pública; la protege la RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` / *secret* key | **Secreta.** Solo en el servidor (Vercel: tipo *Sensitive*) y en tu `.env` local para el script de alta. Nunca en el repo. |

Valen los dos formatos de clave de Supabase: los antiguos JWT y los nuevos `sb_publishable_…` / `sb_secret_…`.

## 5. Desplegar

### Opción A: Vercel (recomendada)
1. https://vercel.com/new → importa `cristiansanchez-cf/SalesSuite`. Vercel detecta Astro y el código usa automáticamente `@astrojs/vercel`.
2. **Environment Variables** (Production y Preview): las tres del paso 4. Marca `SUPABASE_SERVICE_ROLE_KEY` como *Sensitive*.
3. Deploy. Después abre `https://<tu-proyecto>.vercel.app/api/health`. Debe responder:
   ```json
   { "status": "ok", "mode": "supabase", "database": "ok", "serviceRoleConfigured": true }
   ```
   Si ves `"mode": "misconfigured"`, el campo `problems` dice qué variable falta. Sin variables, la app **no** arranca en demo en producción: responde 503 a propósito.

### Opción B: Docker (Cloud Run, Fly, Railway…)
```bash
docker build -t salessuite .
docker run -p 8080:8080 --env-file .env salessuite
```
El contenedor escucha en el puerto 8080 y trae healthcheck en `/api/health`. Detrás de un proxy que reescriba el `Host`, pon `TRUST_FORWARDED_HOST=1`. En Cloud Run con dominio mapeado no hace falta. *El Dockerfile no se pudo construir en el entorno de desarrollo, que no tenía Docker.*

## 6. Dominio `pitch.enjoytheclub.es`

1. Vercel → proyecto → **Settings → Domains → Add** `pitch.enjoytheclub.es`.
2. En el DNS de `enjoytheclub.es` (quien lo gestione en Enjoy) crea:
   ```
   pitch   CNAME   cname.vercel-dns.com.
   ```
3. Vercel emite el certificado SSL solo (unos minutos).
4. Opcional, para subdominios de plataforma (`enjoy.cofundo.app`, `oquea.cofundo.app`…): añade `*.cofundo.app` en Vercel. Requiere que `cofundo.app` use los nameservers de Vercel.

La app decide el tenant por el dominio, usando la tabla `domain` que rellena el paso 7. Un dominio que no esté en esa tabla da 404.

## 7. Alta del tenant Enjoy

El agente o equipo de Enjoy rellena `tenants/enjoy/` siguiendo [`BRAND_INTAKE.md`](./BRAND_INTAKE.md). Después, desde tu máquina:

```bash
cp .env.example .env    # pon PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
set -a && . ./.env && set +a

npm run tenant:bootstrap -- tenants/enjoy --dry-run   # valida sin escribir nada
npm run tenant:bootstrap -- tenants/enjoy             # aplica
```

El script valida tema, marca y contenido de cada módulo con los mismos validadores que la app. Después:
- crea o actualiza el tenant y sus dominios;
- sube logos, fuentes e imágenes a Storage;
- publica el catálogo;
- **invita por email a los admins** de `admins`.

Es idempotente: se puede repetir tras cada cambio, y solo publica versión nueva de los módulos cuyo contenido cambió.

Después, los admins de Enjoy gestionan todo desde la consola: equipo, catálogo, marca y dossiers. El script solo vuelve a hacer falta para cambios masivos.

## 8. Verificación (plan §13)

En `https://pitch.enjoytheclub.es`:

- [ ] `/api/health` → `ok` / `supabase` / `database: ok`
- [ ] Llega el email de invitación del admin → "Aceptar" → pide nombre y contraseña → entra en `/admin`
- [ ] *Equipo*: invitar a un comercial → le llega el email → entra como **Comercial**
- [ ] Como comercial: crear el dossier "Sala X", añadir 4 módulos, arrastrar el #3 arriba, ocultar uno, precio por módulo con un override
- [ ] Publicar → generar enlace → abrirlo en incógnito y en tablet: orden, oculto ausente, precios, marca de Enjoy (rosa/lima, YWFTKul, logo), animaciones
- [ ] Pegar el enlace en WhatsApp → aparece la previsualización con título e imagen
- [ ] Revocar el enlace → 404. Despublicar → 404
- [ ] Un usuario de otro tenant no entra en `pitch.enjoytheclub.es/admin` (403)
- [ ] *Marca*: cambiar un color → se ve en el enlace al recargar (hasta 60 s de caché por instancia)
- [ ] *Catálogo*: nueva versión de un módulo → el dossier existente ofrece "Actualizar a vN" y no cambia hasta que se acepta

## Lo que necesito que me pases (para seguir yo)

- Cuando el proyecto exista: confirmar que `/api/health` responde `ok`. **No me pases las claves por el chat**; van en Vercel y en tu `.env`.
- La carpeta `tenants/enjoy/` rellenada por el agente de Enjoy, como commit o adjunto. Con eso valido con `--dry-run` y ajusto lo que haga falta.
- El código fuente de los bloques `nh-*` de EnjoyWeb, para portar el diseño real a los módulos (ver `BRAND_INTAKE.md` §4).

## Seguridad: recordatorios

- La `service_role` salta toda la RLS. Si se filtra, **rótala** en el panel (*API Keys → Roll*) y actualiza Vercel.
- Los enlaces `/d/<token>` son secretos compartibles: no se indexan (`noindex`) y se revocan desde el builder.
- Copias de seguridad: plan Pro (diarias), o PITR para producción seria.
