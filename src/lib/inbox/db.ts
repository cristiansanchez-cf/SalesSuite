/**
 * Correos al CRM (docs/CRM_DINAMICO.md §47): direcciones de cada persona y lo recibido.
 * - InboxServerDb: el servidor (webhook de Resend), con la service role: de quién es una dirección y apuntar lo recibido.
 * - InboxUserDb: la persona, con su sesión (RLS): su dirección, lo suyo y asignar lo que llegó sin empresa.
 */
export type InboundStatus = 'logged' | 'unmatched' | 'ignored' | 'error';

export interface InboundEmail {
  id: string; tenantId: string; userId: string; providerId: string; messageId: string; receivedAt: string;
  fromAddr: string | null; counterpart: string | null; subject: string | null;
  /** La nota que se apunta (asunto y lo nuevo del correo). */
  snippet: string | null;
  direction: 'in' | 'out'; status: InboundStatus; detail: string | null; accountId: string | null; activityId: string | null; createdAt: string;
}
export type NewInboundEmail = Omit<InboundEmail, 'id' | 'createdAt'>;

export interface InboxServerDb {
  /** De quién es «apuntar-<token>@…» (null si no existe o se cambió). */
  address(token: string): Promise<{ tenantId: string; userId: string } | null>;
  /** Ya se procesó este correo para esta persona (Resend reintenta). */
  seen(tenantId: string, userId: string, messageId: string): Promise<boolean>;
  record(row: NewInboundEmail): Promise<string>;
  /** Dominios de la empresa (los de sus remitentes de leads), para no tomar a un compañero por cliente. */
  internalDomains(tenantId: string): Promise<string[]>;
  userEmail(userId: string): Promise<string | null>;
}

export interface InboxUserDb {
  myToken(tenantId: string): Promise<string>;
  rotate(tenantId: string): Promise<string>;
  list(tenantId: string, userId: string, limit: number): Promise<InboundEmail[]>;
  get(id: string): Promise<InboundEmail | null>;
  update(id: string, patch: Partial<Pick<InboundEmail, 'status' | 'accountId' | 'activityId' | 'detail'>>): Promise<boolean>;
}
