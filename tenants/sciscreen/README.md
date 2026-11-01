# SciScreen

Espacio creado desde **Plataforma → Nueva empresa** (docs/ORG.md §Alta de una empresa). Su contenido (agente de alta) y
su CRM (importado desde su export de HubSpot) están en la base de datos; **este directorio solo trae la marca**, para
aplicarla con `alta-espacio` sin tocar nada más (no hay catálogo, mercado, jugadas, precios ni campos del CRM).

## De dónde sale (SciScreen design system 1.0, 1 nov 2026)

| Aquí | Del design system |
|---|---|
| Fondo `#fcfaf5`, superficie `#f6f2e6` | `--color-surface` paper-50, `--color-surface-subtle` cream-50 |
| Texto `#242320`, secundario `#53524f`, borde `#e9e8e3` | paper-900, paper-700 (el terciario falla AA sobre cream), paper-200 (borde de tarjeta) |
| Principal `#2246b2` | `--color-accent` blue-700: «el azul actúa» (enlaces, botones, foco) |
| Acento `#e1f5ff` con texto `#000341` | blue-50 + navy-950 («el navy es»: marca) |
| Radios 24 / píldora | tarjetas 24, botones y chips en píldora |
| Darker Grotesque 500 y 700 (titulares), Instrument Sans variable (texto) | las fuentes que sirve su app (OFL, licencias en `assets/fonts/`). Nunca pedir 600 a Darker Grotesque |
| `logo.svg` | su lockup para fondo claro, rehecho como su componente `Logo` (CONFLICTS C13): la geometría de `logo3` en navy con la banda en el color de la página. **No** se usa el `logo2.svg` entregado |
| `logo-on-dark.svg` | `logo3` / `lockup-on-navy.svg` tal cual (crema sobre navy) |
| `favicon.svg` | `mark.svg` (isotipo, navy) |
| `og.png` | 1200×630: el lockup crema sobre navy-950, hecho aquí (sus fotos no tienen el formato y algunas llevan texto) |

Fuera a propósito: las fotos (pendientes de versiones limpias, SCI-88), el sello (es su producto, no su marca comercial) y
el verde/rojo de estados (la propuesta no los usa).

## Aplicar

GitHub → Actions → **Producción** → `alta-espacio`, espacio `sciscreen`, primero con «Solo comprobar».
