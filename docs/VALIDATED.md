# Registro de recorridos validados

Método (docs/FOUNDATIONS.md §7): cuando el fundador prueba un recorrido y dice **«validado»**, se anota aquí con el test que lo protege. Desde ese momento:

- si un cambio rompe ese test y **el requisito no cambió**, se arregla el código;
- si **el requisito cambió**, se rehace el test en el mismo cambio y se anota aquí la fecha y el motivo;
- un test de esta lista **nunca** se salta, se desactiva ni se deja fallando.

| Recorrido | Test que lo protege | Validado por el fundador | Notas |
|---|---|---|---|
| Crear propuesta → módulos → publicar → enlace público | `scripts/smoke-e2e.cjs`, `scripts/smoke-admin.cjs` | Pendiente | |
| Acceso con código por email (guía «acceso sin contraseña») | `scripts/smoke-admin.cjs` (demo) · prueba manual en Supabase | Pendiente | Validado en el Cerebro de Ventas; falta la prueba real de esta app (§10 de la guía) |
| Equipo: invitar, roles, jefe/a de ventas | `scripts/smoke-tenant-admin.cjs`, `supabase/tests/31_team.test.sql` | Pendiente | |
| Colaborador: cuentas, precio por cuenta, invitar a un colega | `scripts/smoke-partner.cjs` | Pendiente | |
| Playbook, aportes con aprobación | `scripts/smoke-playbook.cjs` | Pendiente | |
| Mercado, configuración guiada | `scripts/smoke-market.cjs`, `scripts/smoke-tenant-admin.cjs` | Pendiente | |
| Qué ha funcionado (cierres y recomendaciones) | `scripts/smoke-evidence.cjs` | Pendiente | |
| Avisos (campana, email, resumen) | `scripts/smoke-notifications.cjs`, `src/lib/notify/notify.contract.ts` | Pendiente | |
| Zonas y cuentas (reserva, bloqueo, conflictos) | `scripts/smoke-accounts.cjs`, `supabase/tests/33_accounts.test.sql` | Pendiente | |
| Comisiones (plan, venta declarada, liquidación, API, cupones) | `scripts/smoke-commissions.cjs`, `src/lib/commissions/*.test.ts`, `supabase/tests/34_commissions.test.sql` | Pendiente | |
| Idiomas | `scripts/smoke-i18n.cjs` | Pendiente | |
| Empieza aquí (onboarding del vendedor) e historial de condiciones | `scripts/smoke-start.cjs`, `supabase/tests/36_conditions.test.sql`, `src/lib/commissions/commissions.contract.ts` | Pendiente | Prueba guiada: docs/PUESTA_EN_MARCHA.md §G |
| Bienvenida paso a paso (tutorial + primera propuesta) | `scripts/smoke-welcome.cjs`, `supabase/tests/38_daily_digest.test.sql` | Pendiente | |
| Resumen diario de seguimientos (email a las 7:00, preferencia y zona horaria) | `scripts/smoke-daily.cjs`, `src/lib/notify/daily.test.ts`, `supabase/tests/38_daily_digest.test.sql` | Pendiente | |
| Analítica de dossiers (aperturas, secciones, aviso al autor) | `scripts/smoke-analytics.cjs`, `src/lib/analytics/analytics.test.ts`, `supabase/tests/37_dossier_views.test.sql` | Pendiente | |
| Móvil sin desbordes | `scripts/smoke-mobile.cjs` | Pendiente | |
