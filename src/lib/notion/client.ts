/**
 * Cliente de la API de Notion, SOLO LECTURA (docs/CRM_DINAMICO.md §48). Con la clave de una integración interna
 * (NOTION_TOKEN, en Vercel) que solo ve lo que se comparte con ella. Nada aquí escribe en Notion.
 * Notion permite unas 3 peticiones por segundo: se va de una en una y, con 429, se espera lo que diga Retry-After.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const NOTION_VERSION = '2025-09-03';
const API = 'https://api.notion.com/v1';

export class NotionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export interface NotionPage { id: string; url: string; createdTime: string; lastEditedTime: string; archived: boolean; properties: Record<string, any> }
export interface NotionApi {
  /** La base: su título y sus fuentes de datos. */
  database(id: string): Promise<{ title: string; dataSources: Array<{ id: string; name: string }> }>;
  /** Las columnas de una fuente de datos, con sus opciones en orden (las etapas del embudo, tal cual). */
  dataSource(id: string): Promise<Record<string, { type: string; options?: string[] }>>;
  /** Todas las filas (páginas) de una fuente de datos. */
  rows(dataSourceId: string): Promise<NotionPage[]>;
  /** Los bloques de una página con todos sus hijos dentro (`children`). */
  blocks(pageId: string): Promise<any[]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** El id de una base o página a partir de su enlace (o el id tal cual). */
export function notionId(raw: string): string | null {
  const s = String(raw ?? '').trim();
  const m = /([0-9a-f]{32})(?:[?#/]|$)/i.exec(s.replace(/-/g, '')) ?? /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(s);
  if (!m) return null;
  const h = m[1].replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function httpNotion(token: string, f: typeof fetch = fetch, o: { gapMs?: number; maxBlocks?: number } = {}): NotionApi {
  const gap = o.gapMs ?? 350;
  let last = 0;
  async function call(method: 'GET' | 'POST', path: string, body?: unknown, tries = 0): Promise<any> {
    const wait = last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await f(`${API}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return data;
    if ((r.status === 429 || r.status >= 500) && tries < 3) {
      const ra = Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * (tries + 1));
      return call(method, path, body, tries + 1);
    }
    throw new NotionError(r.status, String(data?.code ?? 'error'), String(data?.message ?? `Notion ${r.status}`).slice(0, 300));
  }
  const maxBlocks = o.maxBlocks ?? 5000;
  return {
    async database(id) {
      const d = await call('GET', `/databases/${id}`);
      return { title: (d.title ?? []).map((t: any) => t.plain_text ?? '').join(''), dataSources: (d.data_sources ?? []).map((x: any) => ({ id: x.id, name: x.name ?? '' })) };
    },
    async dataSource(id) {
      const d = await call('GET', `/data_sources/${id}`);
      const out: Record<string, { type: string; options?: string[] }> = {};
      for (const [k, v] of Object.entries((d.properties ?? {}) as Record<string, any>)) {
        const opts = v?.[v.type]?.options;
        out[k] = { type: String(v.type), ...(Array.isArray(opts) ? { options: opts.map((o: any) => String(o.name)) } : {}) };
      }
      return out;
    },
    async rows(dataSourceId) {
      const out: NotionPage[] = [];
      let cursor: string | undefined;
      do {
        const d = await call('POST', `/data_sources/${dataSourceId}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
        for (const p of d.results ?? []) {
          if (p.object !== 'page') continue;
          out.push({ id: p.id, url: p.url, createdTime: p.created_time, lastEditedTime: p.last_edited_time, archived: !!(p.archived || p.in_trash), properties: p.properties ?? {} });
        }
        cursor = d.has_more ? d.next_cursor : undefined;
      } while (cursor && out.length < 5000);
      return out;
    },
    async blocks(pageId) {
      let count = 0;
      const children = async (id: string): Promise<any[]> => {
        const out: any[] = [];
        let cursor: string | undefined;
        do {
          const d = await call('GET', `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
          for (const b of d.results ?? []) {
            if (++count > maxBlocks) throw new NotionError(413, 'too_many_blocks', `La página tiene más de ${maxBlocks} bloques`);
            // Las páginas y bases hijas no se leen por dentro (son otras páginas).
            if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') b.children = await children(b.id);
            out.push(b);
          }
          cursor = d.has_more ? d.next_cursor : undefined;
        } while (cursor);
        return out;
      };
      return children(pageId);
    },
  };
}

/** El valor de una propiedad como texto (o fecha); lo vacío es null. */
export function propValue(p: any): { text: string | null; start?: string | null; end?: string | null } {
  if (!p) return { text: null };
  const rich = (xs: any[]) => (xs ?? []).map((x) => x.plain_text ?? '').join('');
  switch (p.type) {
    case 'title': return { text: rich(p.title) || null };
    case 'rich_text': return { text: rich(p.rich_text) || null };
    case 'select': return { text: p.select?.name ?? null };
    case 'status': return { text: p.status?.name ?? null };
    case 'multi_select': return { text: (p.multi_select ?? []).map((x: any) => x.name).join(', ') || null };
    case 'date': return { text: p.date?.start ?? null, start: p.date?.start ?? null, end: p.date?.end ?? null };
    case 'number': return { text: p.number == null ? null : String(p.number) };
    case 'checkbox': return { text: p.checkbox ? 'Sí' : 'No' };
    case 'url': return { text: p.url ?? null };
    case 'email': return { text: p.email ?? null };
    case 'phone_number': return { text: p.phone_number ?? null };
    default: return { text: null };
  }
}
