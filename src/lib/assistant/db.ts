/** Estado del asistente (service role): quién escribe desde un teléfono y por dónde va su conversación. */
import type { State } from './flow';

export interface Member { tenantId: string; userId: string }
export interface Conversation { state: State; seen: string[]; version: number }
export interface AssistantDb {
  /** Las personas del equipo con ese teléfono (solo dígitos, con prefijo). */
  membersByPhone(digits: string): Promise<Member[]>;
  get(tenantId: string, userId: string): Promise<Conversation>;
  /** false si otra petición la cambió entre medias (se vuelve a leer y se reintenta). */
  save(tenantId: string, userId: string, c: Conversation, prevVersion: number): Promise<boolean>;
  userLocale(userId: string): Promise<string | null>;
  /** Nombre, idioma y zona horaria (para el número del asistente: saludar y saber qué es «hoy»). */
  userProfile(userId: string): Promise<{ name: string | null; locale: string | null; timezone: string }>;
  /** Los nombres de las empresas, por id. */
  tenantNames(ids: string[]): Promise<Record<string, string>>;
  /** Para qué empresa trabaja hoy en el número del asistente (docs/ASSISTANT.md §Un número para todas las empresas). */
  session(userId: string): Promise<HubSession | null>;
  saveSession(userId: string, s: HubSession): Promise<void>;
}
/** Lo mínimo de un mensaje para apuntarlo después de elegir empresa. */
export interface PendingMsg { id: string; kind: 'text' | 'audio' | 'button' | 'other'; text: string; forwarded?: boolean; mediaId?: string | null; buttonId?: string | null; at: string }
export interface HubSession { tenantId: string | null; chosenAt: string | null; askedAt: string | null; pending: PendingMsg[] }
export const EMPTY: Conversation = { state: { step: 'idle' }, seen: [], version: 0 };
