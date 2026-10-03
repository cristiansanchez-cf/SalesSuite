/**
 * Exporta TODO el contenido comercial de un espacio a Markdown, para revisarlo fuera (p. ej. con un agente que sabe
 * vender) y devolverlo mejorado. Sale de tenants/<slug>/tenant.json, que es lo que carga el alta del espacio.
 *
 *   npx tsx scripts/export-sales.ts enjoy        → docs/ventas/<slug>/01…04-*.md
 *
 * Cada pieza lleva su `key`: así lo que vuelva se puede casar con lo que hay, sin duplicar.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KIND_LABEL, KIND_ORDER, OBJECTION_LABEL, STAGE_LABEL, AUDIENCE_LABEL } from '../src/lib/playbook/types';
import { ROLE_LABEL, ROLE_HINT } from '../src/lib/playbook/market';

/* eslint-disable @typescript-eslint/no-explicit-any */
const slug = process.argv[2] ?? 'enjoy';
const t = JSON.parse(await readFile(join('tenants', slug, 'tenant.json'), 'utf8')) as any;
const out = join('docs', 'ventas', slug);
await mkdir(out, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const mods = new Map<string, any>(t.catalog.map((m: any) => [m.key, m]));
const modName = (k: string | null) => (k ? mods.get(k)?.name ?? k : 'General (todos los módulos)');
const segName = new Map<string, string>(t.market.map((s: any) => [s.key, s.name]));
const personaName = new Map<string, string>(t.market.flatMap((s: any) => s.personas.map((p: any) => [p.key, `${p.name} (${s.name})`])));
const q = (s: string | null | undefined) => (s ?? '').trim();
const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');
const eur = (n: number) => `${new Intl.NumberFormat('es-ES').format(n)} €`;
const PERIOD: Record<string, string> = { month: '/mes', year: '/año', event: '/evento', once: 'pago único' };

const header = (n: string, title: string, what: string) => `# ${n} · ${title}

_${t.name} · exportado el ${today} de \`tenants/${slug}/tenant.json\`._

${what}

> **Para quien revise esto (persona o agente):** cambia el texto todo lo que quieras, pero **no cambies las \`key\`** (así sé qué
> pieza sustituye a cuál). Si algo sobra, márcalo **[QUITAR]**; si falta, añádelo como **[NUEVO]** con una \`key\` inventada
> en minúsculas y guiones. Respeta los límites de cada campo (están en «04 · Cómo lo usa el comercial»).

`;

// ---------------------------------------------------------------- 01 · empresa y producto
{
  const L: string[] = [header('01', 'La empresa y el producto', 'Qué es, qué vende, cómo funciona y cuánto cuesta. Es lo primero que aprende un comercial.')];
  const pitch = t.playbook.filter((p: any) => !p.module_key && p.kind === 'pitch');
  L.push('## 1. Qué es y cómo se presenta (jugadas generales de tipo «Cómo presentarlo»)\n');
  for (const p of pitch) L.push(`### ${p.title} · \`${p.key}\`\n\n${q(p.body)}\n${p.when_to_use ? `\n**Cuándo:** ${p.when_to_use}` : ''}${p.why_it_works ? `\n**Por qué funciona:** ${p.why_it_works}` : ''}\n`);

  L.push(`## 2. Visión, estrategia y objetivos

> **HUECO — hoy no existe en la app.** Aprende explica el producto, a quién se vende y cómo, pero no **por qué** la empresa
> hace lo que hace ni **qué objetivos** persigue. Es lo que convierte a un comercial en alguien que cree en lo que vende.

Rellenar (cada punto, 2–5 frases, en el tono de la empresa):

- \`vision\` · **La visión:** por qué esto es tan grande. Qué cambia en una fiesta cuando el público es protagonista.
- \`estrategia-bandera\` · **Plantar la bandera en todas partes:** por qué hay cosas gratis (p. ej. la pantalla «Lite» / el
  modelo para bares) y qué se gana con estar en cada local antes que nadie.
- \`estrategia-djs\` · **Los DJ como canal:** por qué importan, qué ganan ellos y cómo nos abren puertas.
- \`objetivos\` · **Objetivos de este año:** cuántos locales/eventos, en qué ciudades, qué sector primero y por qué.
- \`modelo\` · **Cómo gana dinero la empresa** (y el cliente): cuotas, comisión por peticiones, packs… y qué NO se vende todavía.
- \`por-que-ahora\` · **Por qué ahora:** qué pasa en el mercado (ocio nocturno en caída, móviles, redes) que lo hace urgente.
- \`no-somos\` · **Lo que no somos:** para no prometer de más.

Dónde saldrá: un bloque nuevo al principio de Aprende («Por qué existimos») antes del recorrido del producto, y como
contexto para el guion de cada reunión.

Piezas que ya rozan esto (están en «03»; quizá deban moverse aquí): ${t.playbook.filter((p: any) => /roadmap|hoy|validado|bandera|gratis|dj/i.test(p.key + p.title)).map((p: any) => `«${p.title}» (\`${p.key}\`)`).join(', ') || '—'}.
`);

  L.push('## 3. Así funciona, de principio a fin (el recorrido de 1 minuto)\n\nLo ve todo comercial nada más entrar. Cada paso: título (≤ 80), texto (≤ 240) y lo que se enseña al lado.\n');
  t.tour.forEach((s: any, i: number) => L.push(`${i + 1}. **${s.title}** — ${q(s.body)}  \n   _Se enseña:_ ${s.ui ? `\`${s.ui}\` (UI real del producto)` : s.image ? 'una imagen' : '—'}`));
  L.push('');

  L.push('## 4. Qué ofrecemos (los módulos de la propuesta)\n\nCada módulo es un bloque de la propuesta que recibe el cliente. Aquí, lo que dice cada uno.\n');
  for (const m of t.catalog) {
    const p = m.props ?? {};
    L.push(`### ${m.name} · \`${m.key}\`\n\n_${q(m.description)}_  \nTipo: \`${m.block_type}\`${m.default_price != null ? ` · Precio por defecto: ${eur(m.default_price)}` : ''}\n`);
    if (p.eyebrow || p.title) L.push(`- **Antetítulo:** ${q(p.eyebrow) || '—'}\n- **Título:** ${q(p.title)}${p.rotatingWords?.length ? ` _(palabras que rotan: ${p.rotatingWords.join(' / ')})_` : ''}`);
    if (p.lede || p.subtitle) L.push(`- **Entradilla:** ${q(p.lede ?? p.subtitle)}`);
    if (p.stats?.length) L.push(`- **Cifras:** ${p.stats.map((s: any) => `${s.value} ${s.label}`).join(' · ')}`);
    if (p.features?.length) L.push(`- **Incluye:** ${p.features.join(' · ')}`);
    if (p.tabs) for (const tab of p.tabs) L.push(`- **Pestaña «${tab.label}»:** ${q(tab.title)} — ${q(tab.body)}${tab.bullets?.length ? ` _(${tab.bullets.join(' · ')})_` : ''}${tab.mock?.kind === 'chat' ? `\n  - Chat de ejemplo: ${tab.mock.messages.map((x: any) => `«${x.text}»`).join(' → ')}` : ''}`);
    if (p.scenes) {
      L.push('- **Pantallas que se enseñan (y la frase que dice el comercial en cada una):**');
      for (const s of p.scenes) L.push(`  - **${s.label}** (\`${s.scene}\`): ${q(s.says)}`);
    }
    if (m.block_type === 'phone-tour') L.push('- **Pasos del móvil** (fijos en el código; dime si quieres cambiar el texto): Escanea · Llega al evento · ¿Qué quiere hacer? · Su foto/mensaje · Pendiente (paga 2 €, solo se cobra si se acepta) · ¡En pantalla! · Álbum · Pide su canción.');
    if (p.cta) L.push(`- **Botón:** ${p.cta.label}`);
    L.push('');
  }

  L.push('## 5. Tarifas\n\nLo que el comercial elige en la propuesta: primero el tipo y luego la tarifa (★ = la típica, va preseleccionada).\n');
  L.push('| Sector | Tipo | Tarifa | Precio |\n|---|---|---|---|');
  for (const o of t.price_options) L.push(`| ${segName.get(o.segment) ?? o.segment ?? '—'} | ${o.kind ?? '—'} | ${o.default ? '★ ' : ''}${o.label} | ${eur(o.amount)} ${PERIOD[o.period] ?? o.period ?? ''} |`);
  L.push('\n## 6. Descuentos (cupones)\n\nRegla: ningún descuento sin contrapartida.\n');
  L.push('| Código | Qué es | Valor | Contrapartida |\n|---|---|---|---|');
  for (const c of t.coupons) L.push(`| \`${c.code}\` | ${c.label} | ${c.kind === 'percent' ? `${c.value / 100} %` : c.kind === 'fixed' ? eur(c.value / 100) : `${c.value} meses gratis`} | ${q(c.note) || '—'} |`);
  L.push('');
  await writeFile(join(out, '01-EMPRESA-Y-PRODUCTO.md'), L.join('\n'));
}

// ---------------------------------------------------------------- 02 · mercado
{
  const L: string[] = [header('02', 'A quién vendemos', 'Cada sector: por qué nos compra, a quién buscar, a quién no, cómo decide y quién es quién. Más las «situaciones» que cambian cómo se vende.')];
  L.push(`Papeles posibles de cada actor: ${Object.entries(ROLE_LABEL).map(([k, v]) => `**${v}** (\`${k}\`: ${ROLE_HINT[k as keyof typeof ROLE_HINT]})`).join(' · ')}\n`);
  for (const s of t.market) {
    L.push(`## ${s.name} · \`${s.key}\`\n\n_${q(s.description)}_\n`);
    const f = (label: string, v: string | undefined) => v && L.push(`**${label}**\n\n${q(v)}\n`);
    f('Por qué nos compra (propuesta de valor)', s.value_prop);
    f('Cliente ideal', s.icp);
    f('Cuándo NO venderle', s.disqualifiers);
    f('Cómo decide (proceso de compra)', s.buying_process);
    f('Tamaño de la venta', s.deal_size);
    f('Ciclo de venta', s.sales_cycle);
    if (s.modules?.length) {
      L.push('**Qué enseñarle, en orden**\n');
      for (const m of [...s.modules].sort((a: any, b: any) => a.priority - b.priority)) L.push(`${m.priority}. ${modName(m.module_key)} — ${q(m.fit)}`);
      L.push('');
    }
    L.push('### Actores\n');
    for (const p of s.personas) {
      L.push(`#### ${p.name} · \`${p.key}\` · ${ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] ?? p.role}\n`);
      const g = (label: string, v: string | undefined) => v && L.push(`- **${label}:** ${q(v)}`);
      g('Quiere', p.goals); g('Le duele', p.pains); g('Cómo abordarle', p.how_to_approach);
      g('Cómo te ayuda', p.can_help); g('Cómo lo puede tumbar', p.can_block); g('Evita', p.avoid);
      if (p.objections?.length) L.push(`- **Objeciones típicas:** ${p.objections.map((o: string) => OBJECTION_LABEL[o as keyof typeof OBJECTION_LABEL] ?? o).join(', ')}`);
      for (const a of p.angles ?? []) L.push(`- **Ángulo con «${modName(a.module_key)}»:** ${q(a.angle)}`);
      L.push('');
    }
  }
  L.push('## Situaciones (lo que cambia cómo se vende)\n\nEl comercial las marca en cada propuesta; con el tiempo, la app aprende qué funciona en cada una.\n');
  for (const f of t.facets) {
    L.push(`### ${f.label} · \`${f.key}\`\n\n_Pregunta:_ ${f.question}\n`);
    for (const o of f.options) L.push(`- **${o.label}** (\`${o.key}\`)${o.hint ? ` — ${o.hint}` : ''}`);
    L.push('');
  }
  await writeFile(join(out, '02-MERCADO.md'), L.join('\n'));
}

// ---------------------------------------------------------------- 03 · jugadas
{
  const plays: any[] = t.playbook;
  const L: string[] = [header('03', 'Cómo se vende (las jugadas)', `Las ${plays.length} piezas que salen en Aprende y en el guion de cada reunión. Agrupadas como las ve el comercial: primero las generales, luego por módulo; dentro, por tipo.`)];

  // Diagnóstico: lo que salta a la vista antes de leer.
  const byModule = new Map<string, number>();
  for (const p of plays) byModule.set(p.module_key ?? 'general', (byModule.get(p.module_key ?? 'general') ?? 0) + 1);
  const empty = t.catalog.filter((m: any) => !byModule.get(m.key));
  L.push('## Antes de empezar: lo que ya sé que hay que mirar\n');
  L.push(`- **Reparto:** ${[...byModule].map(([k, n]) => `${k === 'general' ? 'General' : modName(k)}: ${n}`).join(' · ')}.`);
  if (empty.length) L.push(`- **Módulos sin ninguna jugada** (en el guion salen vacíos): ${empty.map((m: any) => `«${m.name}»`).join(', ')}.`);
  const heavy = [...byModule].filter(([k, n]) => k !== 'general' && n > 20);
  if (heavy.length) L.push(`- **Casi todo cuelga de un solo módulo** (${heavy.map(([k, n]) => `«${modName(k)}», ${n}`).join(', ')}): muchas de esas jugadas son en realidad de la pantalla en vivo, del móvil del invitado o generales. Revisa el módulo de cada una.`);
  L.push('- **Tono:** hay frases escritas para nosotros (p. ej. «El activo es el consentimiento») que el comercial lee tal cual. Cada jugada debería poder decirse en voz alta o usarse sin traducir.');
  L.push('- **Falta la capa de «por qué»** (visión, estrategia, objetivos): ver «01 · 2».\n');

  L.push(`Campos de cada jugada: **tipo** (${KIND_ORDER.map((k) => KIND_LABEL[k]).join(', ')}), **etapa** (${Object.values(STAGE_LABEL).join(', ')}), **objeción** si responde a una (${Object.values(OBJECTION_LABEL).join(', ')}), **para qué sectores/actores** (vacío = todos) y **quién la ve** (${Object.values(AUDIENCE_LABEL).join(', ')}).\n`);

  const groups = [null, ...t.catalog.map((m: any) => m.key)];
  for (const g of groups) {
    const mine = plays.filter((p) => (p.module_key ?? null) === g);
    if (!mine.length) continue;
    L.push(`## ${g ? `Módulo: ${modName(g)}` : 'Generales («Cómo se vende», valen para todo)'}\n`);
    for (const k of KIND_ORDER) {
      const list = mine.filter((p) => p.kind === k);
      if (!list.length) continue;
      L.push(`### ${KIND_LABEL[k]} (${list.length})\n`);
      for (const p of list) {
        const meta = [
          p.stage && `etapa: ${STAGE_LABEL[p.stage as keyof typeof STAGE_LABEL] ?? p.stage}`,
          p.objection && `objeción: ${OBJECTION_LABEL[p.objection as keyof typeof OBJECTION_LABEL] ?? p.objection}`,
          p.segments?.length && `sectores: ${p.segments.map((s: string) => segName.get(s) ?? s).join(', ')}`,
          p.personas?.length && `actores: ${p.personas.map((s: string) => personaName.get(s) ?? s).join(', ')}`,
          p.audience && p.audience !== 'all' && `la ven: ${AUDIENCE_LABEL[p.audience as keyof typeof AUDIENCE_LABEL]}`,
        ].filter(Boolean).join(' · ');
        L.push(`#### ${p.title} · \`${p.key}\`\n\n_${meta || 'para todos'}_\n\n${quote(q(p.body) || '(sin texto)')}\n`);
        if (p.when_to_use) L.push(`**Cuándo usarla:** ${q(p.when_to_use)}\n`);
        if (p.why_it_works) L.push(`**Por qué funciona:** ${q(p.why_it_works)}\n`);
        if (p.technique_refs?.length) L.push(`**Técnica (Cerebro de Ventas):** ${p.technique_refs.map((r: any) => `${r.title}${r.creator ? ` — ${r.creator}` : ''}`).join('; ')}\n`);
      }
    }
  }
  await writeFile(join(out, '03-JUGADAS.md'), L.join('\n'));
}

// ---------------------------------------------------------------- 04 · cómo lo usa el comercial
{
  const L: string[] = [header('04', 'Cómo lo usa el comercial (y cómo devolvérmelo)', 'Dónde aparece cada pieza de 01–03 dentro de la app, en qué orden, y el formato para devolverlo mejorado.')];
  L.push(`## 1. El día a día del comercial

1. **Bienvenida** (6 pasos, la primera vez): hola → qué vendemos (el recorrido + los módulos) → a quién (sectores) →
   cómo se vende (las 3 jugadas que más han ganado) → sus condiciones → su perfil.
2. **Aprende** (4 pasos, en orden, con progreso):
   1. **Lo que vendes, en 1 minuto** — el recorrido «Así funciona» (01 · 3).
   2. **Qué ofrecemos** — una ficha por módulo (01 · 4) con sus jugadas (03, por módulo), ordenadas por tipo:
      ${KIND_ORDER.map((k) => `«${KIND_LABEL[k]}»`).join(' → ')}.
   3. **A quién vendemos** — una ficha por sector (02): propuesta de valor, cliente ideal, actores, qué enseñar.
   4. **Cómo se vende** — las jugadas generales (03, «Generales»).
   > Hueco: no hay un paso 0 «Por qué existimos» (visión, estrategia, objetivos). Ver 01 · 2.
3. **Crea la propuesta**: elige sector, tarifa y módulos (los recomendados del sector salen ya puestos), personaliza con el
   logo/fotos/vídeo del cliente y comparte el enlace. El cliente la ve como una presentación.
4. **Guion de la reunión** (se genera solo, no inventa nada: ordena las jugadas oficiales según la propuesta):
   1. **Con quién hablas** — cada contacto de la cuenta con su papel, qué quiere, qué le duele, cómo abordarle y su ángulo
      con cada módulo (02 · actores).
   2. **Apertura** — guiones de prospección/primer contacto + «Cómo presentarlo» generales.
   3. **Descubrimiento** — preguntas generales + las de los módulos de la propuesta.
   4. **Presentación** — por cada módulo, en el orden de la propuesta: 1 «Cómo presentarlo», 1 «Para quién», 1 «Prueba»,
      1 «Consejo» y el mejor truco del equipo. **Si el módulo no tiene jugadas, sale vacío** (hoy: ${t.catalog.filter((m: any) => !t.playbook.some((p: any) => p.module_key === m.key)).map((m: any) => `«${m.name}»`).join(', ') || 'ninguno'}).
   5. **Precio** — «Precio y monetización» de los módulos + generales + consejos de negociación. Regla: después del valor.
   6. **Objeciones probables** — las de los módulos y generales, ordenadas por lo que más ha funcionado.
   7. **Cierre** — guiones de cierre y seguimiento.
5. **Preparar mensaje**: arma un texto con el contexto de la cuenta (sector, actor, situación, objeción, etapa) y las jugadas
   que mejor encajan, para pegarlo en ChatGPT/Claude con el Cerebro de Ventas conectado. Puntúa así: actor exacto +100,
   misma objeción +60, misma etapa +40, mismo sector +10, y lo que ha ganado en cierres reales.
6. **Qué ha funcionado**: cada cierre ganado o perdido registra qué jugadas se usaron; las que ganan suben solas.

## 2. Formato para devolvérmelo

Lo más fácil para mí: **los mismos cuatro documentos, editados**, respetando los títulos y las \`key\`. Para cada pieza:

| Pieza | Campos | Límites |
|---|---|---|
| Jugada (03) | título · texto · cuándo usarla · por qué funciona · tipo · etapa · objeción · sectores · actores | título ≤ 200, texto ≤ 8000 (ideal < 600), cuándo ≤ 1000, por qué ≤ 2000 |
| Paso del recorrido (01 · 3) | título · texto | título ≤ 80, texto ≤ 240, máx. 8 pasos |
| Módulo (01 · 4) | nombre · descripción · textos de la propuesta | títulos ≤ 120, entradillas ≤ 300, frase de cada pantalla ≤ 220 |
| Sector (02) | propuesta de valor · cliente ideal · cuándo no · cómo decide · tamaño · ciclo · qué enseñar | párrafos cortos o viñetas |
| Actor (02) | quiere · le duele · cómo abordarle · cómo ayuda · cómo lo tumba · objeciones · ángulos | una o dos frases cada uno |

Valores permitidos — **tipo:** ${KIND_ORDER.map((k) => `\`${k}\` (${KIND_LABEL[k]})`).join(', ')}. **Etapa:** ${Object.entries(STAGE_LABEL).map(([k, v]) => `\`${k}\` (${v})`).join(', ')}. **Objeción:** ${Object.entries(OBJECTION_LABEL).map(([k, v]) => `\`${k}\` (${v})`).join(', ')}.

Reglas de estilo que ya sigue la app (para que lo nuevo encaje):

- Se lee en el móvil, delante del cliente o justo antes: **frases cortas, una idea por bloque, poco texto**.
- Lo que el comercial **dice** va como lo diría (en segunda persona al cliente, sin jerga interna).
- \`{company}\` se sustituye por el nombre del cliente y \`{prospect}\` por el de la persona.
- Nada de importes altos ni tramos de pago en lo que ve el cliente (decisión de producto).
- Cada objeción: qué dice el cliente (entre comillas) → qué contestas → cómo vuelves a la venta.
- Si una técnica viene de un experto del Cerebro de Ventas, se cita (título y creador), no se copia su guion.
`);
  await writeFile(join(out, '04-COMO-LO-USA-EL-COMERCIAL.md'), L.join('\n'));
}

console.log(`✓ docs/ventas/${slug}/: 01-EMPRESA-Y-PRODUCTO.md, 02-MERCADO.md, 03-JUGADAS.md, 04-COMO-LO-USA-EL-COMERCIAL.md`);
