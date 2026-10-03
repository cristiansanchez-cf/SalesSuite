# Plantillas de email de Supabase Auth

Todas enlazan a `{{ .RedirectTo }}&token_hash=…&type=…`. La app siempre envía un `redirectTo`
del tipo `https://<dominio-del-tenant>/admin/auth/confirm?next=…`, así que el enlace vuelve al
dominio correcto de cada tenant y funciona aunque se abra en otro dispositivo (no depende de PKCE).

| Plantilla en Supabase (Auth → Email Templates) | Archivo | Asunto sugerido |
|---|---|---|
| Invite user | `invite.html` | Te han invitado a la consola de dossiers |
| Magic Link | `magic_link.html` | Tu enlace para entrar |
| Reset Password | `recovery.html` | Elige una contraseña nueva |

Con la CLI (`supabase/config.toml`) se aplican solas en local; en el proyecto en la nube hay que
pegarlas en el panel (ver docs/SETUP.md §3).
