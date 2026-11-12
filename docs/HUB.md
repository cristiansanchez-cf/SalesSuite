# Acceso general: ventas.cofundo.io

Una sola puerta para entrar, sea cual sea tu empresa. Es la dirección que se enlaza desde la web de Cofundo.

1. **Entras con tu email**, como siempre: te llega un código (y un botón para entrar con un clic). También con contraseña.
2. **«¿Dónde quieres ir hoy?»**: una tarjeta por cada empresa en la que tienes acceso, con su logo, tu papel (admin,
   gerente, comercial, colaborador) y su dirección. La última que elegiste sale primero y marcada. Con más de seis,
   un buscador. El superadmin ve todas.
3. **Tocas una y entras directo**, ya con sesión, en `<empresa>.ventas.cofundo.io/admin` (o en su dominio propio).
   Con **una sola empresa** no hay nada que elegir: se entra directo.

Dentro de una empresa no cambia nada: «Cambiar de espacio» (abajo a la izquierda) sigue llevando de una a otra. El login
de cada empresa enlaza al acceso general («¿Trabajas en varias empresas?…») y la página de «sin acceso» también («Ver
tus empresas»), que es justo cuando alguien ha entrado en la empresa equivocada.

## Cómo está hecho

- **Host:** `PLATFORM_DOMAIN` (por defecto `ventas.cofundo.io`); `HUB_HOST` si se quiere otro. En local,
  `hub.localhost:<puerto>` (Chrome lleva `*.localhost` a la propia máquina). Código: `src/lib/hub.ts`.
- **Sin espacio:** en ese host el middleware no busca empresa. Solo sirve entrar (`/admin/login`), confirmar el enlace
  (`/admin/auth/confirm`), elegir (`/admin/elige`), ir (`POST /admin/ir`) y salir; todo lo demás lleva a elegir.
- **Sesión:** la del acceso general es solo de `ventas.cofundo.io` (cookie de ese host) y no abre ninguna empresa por sí
  sola. Al elegir, se abre sesión en la empresa con un **enlace de un solo uso para tu propio email** (sin correo de por
  medio; lo mismo que «Cambiar de espacio», `/admin/switch`), y la empresa comprueba que eres miembro, como siempre.
  Solo se puede elegir una empresa de las tuyas (o cualquiera, si eres superadmin). Sin `SUPABASE_SERVICE_ROLE_KEY`,
  la tarjeta lleva al login de la empresa.
- **Lista de empresas:** la de «Cambiar de espacio» (`loadSpaces` en `src/lib/admin/spaces.ts`), con la RLS de quien
  entra: solo sus membresías.
- **Pruebas:** `src/lib/hub.test.ts` y `scripts/smoke-hub.cjs` (en CI).

## Para ponerlo en marcha (una vez)

1. **Vercel → el proyecto → Settings → Domains:** añadir `ventas.cofundo.io` (sin el asterisco; el comodín
   `*.ventas.cofundo.io` no lo cubre).
2. **Supabase → Authentication → URL Configuration → Redirect URLs:** añadir `https://ventas.cofundo.io/**`. Solo hace
   falta para el envío de reserva (cuando el código no sale por nuestro correo de Resend); el código de 6 dígitos
   funciona igual.
3. **Web de Cofundo:** el botón de «Acceso» → `https://ventas.cofundo.io`.
