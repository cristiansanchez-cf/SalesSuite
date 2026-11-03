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
}
export const EMPTY: Conversation = { state: { step: 'idle' }, seen: [], version: 0 };
