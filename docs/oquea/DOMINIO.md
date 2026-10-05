# Oquea · dominios

| Dominio | Para qué | Quién lo toca | Estado |
|---|---|---|---|
| `oquea-ventas.vercel.app` | Verlo ya, sin tocar ningún DNS | Cristian, en Vercel (2 min) | Dado de alta en el espacio; falta añadirlo en Vercel |
| `oquea.ventas.cofundo.io` | El definitivo de la consola y las propuestas | Cristian, en el DNS de **cofundo.io** (no el de Oquea) | Dado de alta en el espacio; falta DNS y Vercel |
| Opcional: `propuestas.oquea.com` (o el que digan) | Que las propuestas salgan con el dominio de Oquea | El dueño del DNS de `oquea.com` (1 registro) | No pedido todavía |

## 1 · Ya: `oquea-ventas.vercel.app` (sin DNS)

1. Vercel → equipo **cofundo** → proyecto **ventas** → **Settings → Domains → Add Domain**.
2. Escribe `oquea-ventas.vercel.app` → **Add**. (Si dice que ya está cogido, prueba `oquea-cofundo.vercel.app` y dímelo: lo
   cambio en el espacio.) Si pregunta por entorno, **Production**; si pregunta por redirección, **ninguna**.
3. Supabase → **Authentication → URL Configuration → Redirect URLs → Add URL**: `https://oquea-ventas.vercel.app/**`
   (para que los enlaces de acceso del email vuelvan a este dominio).
4. Comprobación: `https://oquea-ventas.vercel.app/api/health` → `"status": "ok"`. Y `https://oquea-ventas.vercel.app/admin`
   → pantalla de acceso con la marca de Oquea. Entra con tu email (te llega un código).

## 2 · Definitivo: `oquea.ventas.cofundo.io`

Es un subdominio de **cofundo.io**, el dominio de Cofundo: el DNS es el vuestro (el mismo donde está `enjoy.ventas`),
no el de Oquea. Mismo procedimiento que Enjoy (docs/PUESTA_EN_MARCHA.md, paso 6):

1. Vercel → proyecto **ventas** → **Settings → Domains → Add** → `oquea.ventas.cofundo.io`.
2. DNS de `cofundo.io` (Cloudflare) → **Add record**:
   ```
   Tipo: CNAME    Nombre: oquea.ventas    Valor: el que indique Vercel (normalmente cname.vercel-dns.com)
   Proxy: DESACTIVADO (nube gris)
   ```
3. Supabase → Redirect URLs → `https://oquea.ventas.cofundo.io/**`.
4. Comprobación: Vercel muestra el dominio con el check azul y `https://oquea.ventas.cofundo.io/api/health` → `ok`.

## 3 · Opcional: un dominio de Oquea (p. ej. `propuestas.oquea.com`)

Si se quiere que el cliente vea el dominio de Oquea, hay que pedírselo a quien gestiona el DNS de `oquea.com`. Mensaje
para mandarle, tal cual:

> Hola. Para las propuestas comerciales de Oquea necesitamos un subdominio que apunte a nuestra plataforma (Vercel).
> ¿Puedes crear este registro en el DNS de oquea.com?
>
> `Tipo: CNAME · Nombre: propuestas · Valor: cname.vercel-dns.com · TTL: automático`
> (si usáis Cloudflare, con el proxy desactivado: nube gris)
>
> No toca la web ni el correo de Oquea: es solo ese subdominio. Si Vercel pide además un registro TXT de verificación,
> te paso el valor exacto.

Nosotros, después: añadir `propuestas.oquea.com` en Vercel (Settings → Domains), en Supabase (Redirect URLs) y en
`tenants/oquea/tenant.json` → `domains` (se carga con `scripts/apply-oquea-00.py` + alta del espacio).
