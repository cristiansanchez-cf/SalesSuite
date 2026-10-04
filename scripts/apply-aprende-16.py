#!/usr/bin/env python3
"""
Correcciones del fundador tras probar la app como comercial (4-oct). Va después de apply-imaginatelo.py. Idempotente.

- Nombres: «Batiq» es Selvatic (Selvatic Málaga Fest) y «Topamin Fest» es Dopamine Fest (transcripción errónea).
- «Foto en tarjeta» no se entendía: es el modo transparente (nos ponemos encima de lo que ya tenga el cliente:
  visuales, vídeos, karaoke, promociones). Texto redactado a partir de sus palabras: revisarlo.

    python3 scripts/apply-aprende-16.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())

NOMBRES = [('Batiq Málaga Fest', 'Selvatic Málaga Fest'), ('Batiq Fest', 'Selvatic Fest'), ('Batiq', 'Selvatic'), ('Topamin Fest', 'Dopamine Fest'), ('Topamin', 'Dopamine')]
TRANSPARENTE = {'label': 'Modo transparente',
                'says': 'Nos ponemos encima de lo que ya tengas en pantalla: tus visuales, tus vídeos, el karaoke o tus promociones. '
                        'Las peticiones salen en una tarjeta pequeña que lo complementa sin tapar el show.'}


def walk(o):
    if isinstance(o, dict):
        if o.get('scene') == 'tp.photo' and o.get('label') == 'Foto en tarjeta':
            o.update(TRANSPARENTE)
        return {k: walk(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v) for v in o]
    if isinstance(o, str):
        for a, b in NOMBRES:
            o = o.replace(a, b)
    return o


t = walk(t)
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
s = P.read_text()
assert 'Batiq' not in s and 'Topamin' not in s and 'Foto en tarjeta' not in s
print('aprende 16: Selvatic y Dopamine Fest; «Foto en tarjeta» → «Modo transparente»')
