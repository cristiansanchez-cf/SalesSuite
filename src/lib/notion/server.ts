/**
 * Importar desde Notion en el servidor (docs/CRM_DINAMICO.md §48): la API de verdad con NOTION_TOKEN o, en la demo y en
 * las pruebas (AI_RESEARCH_FIXTURE=1), una base inventada. Nada de datos reales aquí.
 */
import type { AdminContext } from '../admin/auth';
import { env } from '../env';
import { appMode } from '../mode';
import { httpNotion, type NotionApi, type NotionPage } from './client';
import { createNotionImport } from './service';

/* eslint-disable @typescript-eslint/no-explicit-any */
const rt = (t: string, a: Record<string, boolean> = {}) => ({ type: 'text', plain_text: t, href: null, annotations: a });
const b = (type: string, t: string, extra: Record<string, unknown> = {}, children?: any[]) => ({ id: `${type}-${t.slice(0, 8)}`, type, has_children: !!children?.length, [type]: { rich_text: [rt(t)], ...extra }, ...(children ? { children } : {}) });
const sel = (name: string | null) => ({ type: 'select', select: name ? { name } : null });
const txt = (t: string | null) => ({ type: 'rich_text', rich_text: t ? [rt(t)] : [] });
const date = (d: string | null) => ({ type: 'date', date: d ? { start: d, end: null } : null });
const DEMO_DS = '00000000-0000-4000-8000-00000000d501';
const DEMO_PAGES: Array<{ id: string; title: string; tipo: string; origen: string; etapa: string; paso: string; fecha: string; blocks: any[] }> = [
  { id: '00000000-0000-4000-8000-00000000d511', title: 'Marta Prueba — Startup Demo', tipo: 'Cliente', origen: 'Mío', etapa: 'Negociación', paso: 'Enviar la propuesta revisada', fecha: '2026-11-10', blocks: [
    b('heading_2', 'Contexto'), b('paragraph', 'Startup de ejemplo que quiere levantar una ronda.'),
    { id: 'tbl', type: 'table', has_children: true, table: { has_column_header: true, table_width: 2 }, children: [
      { id: 'r1', type: 'table_row', table_row: { cells: [[rt('Persona')], [rt('Rol')]] } },
      { id: 'r2', type: 'table_row', table_row: { cells: [[rt('Marta Prueba')], [rt('CEO')]] } },
    ] },
    b('heading_2', 'Bitácora'),
    b('heading_3', '2 oct 2026'), b('bulleted_list_item', 'Primera llamada: quieren automatizar la facturación.'),
    b('heading_3', '14 oct 2026'), b('bulleted_list_item', 'Propuesta enviada por email.'),
    b('heading_3', 'Mediados de oct. 2026'), b('bulleted_list_item', 'Sin fecha exacta: se queda en el documento.'),
    b('heading_2', 'Mensajes enviados'), b('toggle', 'Correo de la propuesta', {}, [b('quote', 'Hola Marta, te adjunto la propuesta.')]),
  ] },
  { id: '00000000-0000-4000-8000-00000000d512', title: 'Fondo Demo Capital', tipo: 'Partner / Aliado', origen: 'Startup Maker / Young', etapa: 'Contacto inicial', paso: 'Cerrar el acuerdo de ojeador', fecha: '2026-11-20', blocks: [
    b('heading_2', 'Historial'), b('bulleted_list_item', '20 abr 2026: primer contacto en un evento'), b('bulleted_list_item', '23 abr: café; interesados en ver startups'),
  ] },
  { id: '00000000-0000-4000-8000-00000000d513', title: 'Sala Ejemplo (Sala Ejemplo Club)', tipo: 'Cliente', origen: 'Enjoy the Club', etapa: 'Lead', paso: '', fecha: '', blocks: [b('paragraph', 'Cliente de Enjoy: se documenta en Enjoy.')] },
];
export function fixtureNotion(): NotionApi {
  const page = (p: (typeof DEMO_PAGES)[number]): NotionPage => ({
    id: p.id, url: `https://www.notion.so/${p.id.replace(/-/g, '')}`, createdTime: '2026-10-01T10:00:00.000Z', lastEditedTime: '2026-10-20T10:00:00.000Z', archived: false,
    properties: {
      Cliente: { type: 'title', title: [rt(p.title)] }, Tipo: sel(p.tipo), Origen: sel(p.origen), Etapa: sel(p.etapa),
      'Próximo paso': txt(p.paso || null), 'Fecha próximo paso': date(p.fecha || null), 'Cómo entró': txt('Por un evento de ejemplo'),
    },
  });
  return {
    async database() { return { title: 'Seguimiento de prueba', dataSources: [{ id: DEMO_DS, name: 'Seguimiento de prueba' }] }; },
    async dataSource() {
      return {
        Cliente: { type: 'title' }, Tipo: { type: 'select', options: ['Cliente', 'Partner / Aliado', 'Asesor', 'Institucional / Ecosistema'] },
        Origen: { type: 'select', options: ['Mío', 'Startup Maker / Young', 'Enjoy the Club', 'Oquea', 'Consultoría dev', 'Otro'] },
        Etapa: { type: 'select', options: ['Lead', 'Contacto inicial', 'Propuesta enviada', 'Negociación', 'En pausa', 'Cerrado ganado', 'Cerrado perdido'] },
        'Próximo paso': { type: 'rich_text' }, 'Fecha próximo paso': { type: 'date' }, 'Cómo entró': { type: 'rich_text' },
      };
    },
    async rows() { return DEMO_PAGES.map(page); },
    async blocks(id) { return structuredClone(DEMO_PAGES.find((p) => p.id === id)?.blocks ?? []); },
  };
}

export function notionApiFromEnv(): NotionApi | null {
  const token = env('NOTION_TOKEN');
  if (token) return httpNotion(token);
  return appMode() === 'demo' || env('AI_RESEARCH_FIXTURE') === '1' ? fixtureNotion() : null;
}
export const notionFor = (admin: AdminContext, api: NotionApi | null = notionApiFromEnv()) => createNotionImport(admin, { api });
