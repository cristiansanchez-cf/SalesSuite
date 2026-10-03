# Plantillas de email de Supabase Auth

Todas enlazan a `{{ .RedirectTo }}&token_hash=…&type=…`. La app siempre envía un `redirectTo`
del tipo `https://<dominio-del-tenant>/admin/auth/confirm?next=…`, así que el enlace vuelve al
dominio correcto de cada tenant y funciona aunque se abra en otro dispositivo (no depende de PKCE).

| Plantilla en Supabase (Auth → Email Templates) | Archivo | Asunto sugerido |
|---|---|---|
| Invite user | `invite.html` | Te han invitado |
| Magic Link | `magic_link.html` | Tu código para entrar |
| Confirm signup | `confirm_signup.html` | Confirma tu email |
| Reset Password | `recovery.html` | Elige una contraseña nueva |

Con la CLI (`supabase/config.toml`) se aplican solas en local; en el proyecto en la nube hay que
pegarlas en el panel (ver docs/SETUP.md §3).

Estilo común (guía «acceso sin contraseña»): fondo `#faf9f7`, tarjeta blanca con radio 12 y padding 32,
fuentes del sistema, botón principal `#1a1a1a` y secundario `#f4f2ef`. En los correos de acceso el
**código va primero** y el botón es secundario: el enlace falla si se abre en otro navegador o si un
antivirus lo «visita» antes; el código funciona siempre.
