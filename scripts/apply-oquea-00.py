#!/usr/bin/env python3
"""
Aplica a tenants/oquea/tenant.json la entrega 00 «Marca y UI» (docs/ventas/oquea/fuentes/00-entrega-marca-y-ui.md),
sacada de los repos oquea-web (Astro) y OqueaApp (Flutter). Idempotente.

- Tema: tokens de oquea-web/src/styles/tokens.css (Design System v1.4.0). Solo claro.
- Gilroy 300–700 (licencia web confirmada por Oquea). Titulares también en Gilroy: DM Serif Display / Caveat
  van por Google Fonts y el tema solo admite woff2 propios (PENDIENTE decidir si las portadas las usan).
- Logo navy (fondo claro) y blanco (fondo oscuro), favicon, OG 1200×630 generada en la entrega.
- Contacto y razón social del pie.
Los archivos ya están en tenants/oquea/assets/ (copiados tal cual de la entrega).

    python3 scripts/apply-oquea-00.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())

GILROY = "'Gilroy', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
t['theme_tokens'] = {
    'colors': {
        'bg': '#ffffff',                # --color-bg
        'surface': '#fbfbfb',           # --color-bg-secondary
        'text': '#292929',              # --color-text-primary
        'muted': '#7c7c7c',             # --color-text-muted
        'border': '#efefef',            # --color-border
        'primary': '#3757be',           # --color-primary-dark (CTA / activo)
        'primary-contrast': '#ffffff',
        'accent': '#d0ff00',            # --oq-accent: solo relleno, nunca texto
        'accent-contrast': '#1f294c',   # navy, --oq-linkwater-900
    },
    'radius': {'card': '24px', 'button': '999px', 'pill': '999px'},
    'font': {
        'display': GILROY,
        'sans': GILROY,
        'faces': [{'family': 'Gilroy', 'src': f'asset:fonts/gilroy-{n}.woff2', 'weight': w}
                  for n, w in [('light', '300'), ('regular', '400'), ('medium', '500'), ('semibold', '600'), ('bold', '700')]],
    },
}

t['brand'] = {
    'logoUrl': 'asset:logo.svg',
    'logoOnDarkUrl': 'asset:logo-dark.svg',
    'logoAlt': 'Oquea',
    'faviconUrl': 'asset:favicon.svg',
    'ogImageUrl': 'asset:og.jpg',
    'contact': {
        'whatsapp': '34673225293',
        'email': 'enrique@oquea.com',
        'website': 'https://oquea.com',
    },
    'legal': 'Oquea Technologies SL · Avenida Diego Fernández de Mendoza 11, 3º B, 29006 Málaga, España',
}

t['$comment'] = ('Alta de Oquea en Cofundo Ventas (docs/oquea/00-HANDOFF.md). El contenido entra documento a documento con '
                 'scripts/apply-oquea-NN.py, nunca a mano. Estado y pendientes: docs/oquea/ESTADO.md.')

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea: tema, marca y contacto cargados')
