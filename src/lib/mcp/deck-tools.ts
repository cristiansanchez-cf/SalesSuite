/**
 * Decks de inversión por MCP (docs/DECKS.md): la IA de la persona ve sus decks y monta o corrige sus bloques (los
 * mismos que el editor: cada bloque se valida con su esquema y lo que no vale se dice). Solo en los espacios con la
 * sección Decks activada y con los permisos de la persona (lo que no puede editar en la web, tampoco aquí).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AdminContext } from '../admin/auth';
import { AdminError, isDeckBlock } from '../admin/service';
import { REGISTRY } from '../../modules/registry';
import { deepMerge } from '../../modules/resolve';

type Json = Record<string, unknown> | unknown[];
type Out = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type Run = <A>(fn: (admin: AdminContext, args: A) => Promise<Json>) => (args: A) => Promise<Out>;

async function needDecks(admin: AdminContext) {
  if (admin.session.role === 'partner' || !(await admin.accounts.features()).decks) throw new AdminError(403, 'Este espacio no tiene la sección Decks');
}

async function deckOf(admin: AdminContext, id: string) {
  await needDecks(admin);
  const st = await admin.service.getState(id);
  if (st.dossier.kind !== 'deck') throw new AdminError(404, 'Ese id no es de un deck');
  return st;
}

function view(st: Awaited<ReturnType<AdminContext['service']['getState']>>) {
  return {
    id: st.dossier.id, titulo: st.dossier.title, inversor: st.dossier.prospectCompany, estado: st.dossier.status,
    bloques: [...st.items].sort((a, b) => a.position - b.position).map((i, n) => ({
      bloque_id: i.id, posicion: n, clave: i.moduleKey, tipo: i.blockType, nombre: i.moduleName, visible: i.visible,
      props: deepMerge(i.defaultProps, i.propOverrides, true), ...(i.error ? { error: i.error } : {}),
    })),
    se_pueden_anadir: st.catalog.filter((c) => isDeckBlock(c.blockType)).map((c) => ({ clave: c.moduleKey, tipo: c.blockType, nombre: c.moduleName })),
  };
}

/** «editar» manda el bloque entero: lo que traía el catálogo y no viene en las props, fuera (null lo quita, resolve.ts). */
const whole = (defaults: Record<string, unknown>, props: Record<string, unknown>) =>
  ({ ...Object.fromEntries(Object.keys(defaults).filter((k) => !(k in props)).map((k) => [k, null])), ...props });

export function registerDeckTools(server: McpServer, run: Run) {
  server.registerTool('decks', {
    title: 'Decks: lista',
    description: 'Los decks de inversión del espacio (solo si tiene la sección Decks): id, título, inversor y estado.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, run(async (admin) => {
    await needDecks(admin);
    return (await admin.service.listDossiers({ kind: 'deck' })).map((d) => ({ id: d.id, titulo: d.title, inversor: d.prospectCompany, estado: d.status, bloques: d.itemCount }));
  }));

  server.registerTool('deck_ver', {
    title: 'Decks: ver uno',
    description: 'Un deck con sus bloques en orden (tipo, props actuales, visible) y los bloques del catálogo que se le pueden añadir. '
      + 'Tipos: deck-cover (portada), deck-slide (titular, cita y puntos), deck-stats (cifras que cuentan, cifras pequeñas, tarjetas, reparto en barras o donut, frases), '
      + 'deck-team (personas), deck-timeline (hitos), deck-math (cuenta, ventanas de salida, tabla), deck-contact (cierre), deck-cases (acuerdos con foto). '
      + 'En los textos, *así* sale en el color principal y **así** en negrita.',
    inputSchema: { deck_id: z.string().uuid() },
    annotations: { readOnlyHint: true },
  }, run(async (admin, a: { deck_id: string }) => view(await deckOf(admin, a.deck_id))));

  server.registerTool('deck_crear', {
    title: 'Decks: crear',
    description: 'Crea un deck para un inversor (nombre del fondo o de la persona). Nace con los bloques de partida del espacio. Devuelve el deck.',
    inputSchema: { inversor: z.string().min(2).max(120), titulo: z.string().max(140).optional() },
  }, run(async (admin, a: { inversor: string; titulo?: string }) => {
    await needDecks(admin);
    const kinds = await admin.accounts.kinds().catch(() => []);
    const kind = kinds.find((k) => k.profile === 'investor')?.key;
    const same = (await admin.crm.accountSearch(a.inversor, kind ?? null)).find((c) => c.score >= 0.95);
    const accountId = same?.id ?? await admin.accounts.create({ name: a.inversor, kind });
    const id = await admin.service.createDossier({ title: a.titulo?.trim() || `Deck para ${a.inversor}`, prospectCompany: a.inversor, accountId, kind: 'deck' });
    return view(await admin.service.getState(id));
  }));

  server.registerTool('deck_bloque', {
    title: 'Decks: cambiar un bloque',
    description: 'Cambia un bloque del deck. accion: «editar» (props = todas las del bloque; se valida con su esquema), «anadir» (clave del catálogo, '
      + 'props opcionales y posicion), «quitar», «mover» (posicion, desde 0), «ocultar» o «mostrar». Devuelve el deck como queda.',
    inputSchema: {
      deck_id: z.string().uuid(),
      accion: z.enum(['editar', 'anadir', 'quitar', 'mover', 'ocultar', 'mostrar']),
      bloque_id: z.string().uuid().optional(),
      clave: z.string().max(80).optional(),
      props: z.record(z.unknown()).optional(),
      posicion: z.number().int().min(0).max(40).optional(),
    },
  }, run(async (admin, a: { deck_id: string; accion: string; bloque_id?: string; clave?: string; props?: Record<string, unknown>; posicion?: number }) => {
    const st = await deckOf(admin, a.deck_id);
    const svc = admin.service;
    const item = () => {
      const it = st.items.find((i) => i.id === a.bloque_id);
      if (!it) throw new AdminError(404, 'Ese bloque no está en el deck (mira deck_ver)');
      return it;
    };
    // Lo que no vale se explica campo a campo, para que la IA lo corrija.
    const check = (blockType: string, props: Record<string, unknown>) => {
      const schema = (REGISTRY as unknown as Record<string, { schema: z.ZodTypeAny }>)[blockType]?.schema;
      const r = schema?.safeParse(props);
      if (r && !r.success) throw new AdminError(422, 'Contenido inválido para este bloque', r.error.issues.map((i) => `${i.path.join('.') || 'props'}: ${i.message}`));
    };
    let out = st;
    if (a.accion === 'editar') {
      const it = item();
      if (!a.props) throw new AdminError(422, 'Faltan las props');
      check(it.blockType, a.props);
      out = await svc.apply(a.deck_id, { op: 'setProps', itemId: it.id, propOverrides: whole(it.defaultProps, a.props) });
    } else if (a.accion === 'anadir') {
      const c = st.catalog.find((x) => x.moduleKey === a.clave && isDeckBlock(x.blockType));
      if (!c) throw new AdminError(404, 'Esa clave no es un bloque de deck del catálogo (mira se_pueden_anadir en deck_ver)');
      if (a.props) check(c.blockType, a.props);
      const before = new Set(st.items.map((i) => i.id));
      out = await svc.apply(a.deck_id, { op: 'addItem', moduleVersionId: c.versionId, ...(a.posicion !== undefined ? { index: a.posicion } : {}) });
      const added = out.items.find((i) => !before.has(i.id));
      if (added && a.props) out = await svc.apply(a.deck_id, { op: 'setProps', itemId: added.id, propOverrides: whole(added.defaultProps, a.props) });
    } else if (a.accion === 'quitar') {
      out = await svc.apply(a.deck_id, { op: 'removeItem', itemId: item().id });
    } else if (a.accion === 'mover') {
      if (a.posicion === undefined) throw new AdminError(422, 'Falta la posicion');
      out = await svc.apply(a.deck_id, { op: 'move', itemId: item().id, toIndex: a.posicion });
    } else {
      out = await svc.apply(a.deck_id, { op: 'setVisible', itemId: item().id, visible: a.accion === 'mostrar' });
    }
    return view(out);
  }));
}
