#!/usr/bin/env python3
"""
Contenido de Oquea en coreano (Cristian, 9-oct-2026): los comerciales coreanos no entienden el contenido en español.
Activa la traducción automática del contenido a coreano (docs/I18N.md §Contenido) con su glosario. La traducción la
hace el workflow «Producción → traducir» (scripts/content-translate.ts, Claude), se ve con la marca «traducción
automática» y la revisa después alguien de Corea. Idempotente.

    python3 scripts/apply-oquea-10.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
t['content_i18n'] = {
    'locales': ['ko'],
    'glossary': [
        'Oquea: brand name, never translate (written "Oquea").',
        'logbook / Logbook: keep "로그북" in Korean.',
        'centro de buceo → 다이빙 센터',
        'buceador / buceadores → 다이버',
        'punto de inmersión / dive site → 다이빙 포인트',
        'inmersión → 다이빙 (a single dive)',
        'centro fundador / red de centros fundadores → 창립 센터 / 창립 센터 네트워크',
        'ONG → NGO',
        'comercial (the sales rep) → 영업 담당자',
        'propuesta / dossier → 제안서',
        'QR: keep "QR".',
        'Fun dive, Open Water, Advanced Open Water, Divemaster, Rescue Diver: keep in English.',
        'Names of places, dive sites and people: keep as written.',
    ],
    'notes': 'Oquea is a platform for dive centres: divers scan the centre\'s QR after a dive and it is saved in their logbook; the centre keeps the list of its divers and appears on the map. Korean reps sell it to dive centres in Korea. Prices and commissions: keep numbers and the % sign exactly.',
}
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 10: contenido en', ', '.join(t['content_i18n']['locales']), '·', len(t['content_i18n']['glossary']), 'entradas de glosario')
