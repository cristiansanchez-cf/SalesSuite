import { describe, expect, it } from 'vitest';
import { contactLinks, repContactLink } from './contact';

const brand = { contact: { whatsapp: '34600000000', email: 'hola@marca.com' } } as never;

describe('contacto del comercial en la propuesta', () => {
  it('va primero, antes que el de la marca', () => {
    const l = contactLinks(brand, 'Propuesta', 'es-ES', { name: 'Ana', channel: 'instagram', value: '@ana.buceo' });
    expect(l[0]).toMatchObject({ kind: 'instagram', href: 'https://ig.me/m/ana.buceo', rep: true });
    expect(l.map((x) => x.kind)).toEqual(['instagram', 'whatsapp', 'email']);
  });
  it('sin valor, no hay botón propio (sale el de la marca)', () => {
    expect(contactLinks(brand, 'P', 'es', { name: 'Ana', channel: 'kakao', value: ' ' })[0].kind).toBe('whatsapp');
  });
  it('KakaoTalk: con enlace de chat abierto es botón; con ID, se enseña el ID', () => {
    expect(repContactLink({ name: '', channel: 'kakao', value: 'https://open.kakao.com/o/abc' }, 'P', 'ko')).toMatchObject({ href: 'https://open.kakao.com/o/abc', cta: '카카오톡으로 상담하기' });
    expect(repContactLink({ name: '', channel: 'kakao', value: 'diver_kim' }, 'P', 'ko')).toMatchObject({ href: null, label: 'KakaoTalk ID: diver_kim' });
    // Un enlace que no es de Kakao no se convierte en botón.
    expect(repContactLink({ name: '', channel: 'kakao', value: 'https://evil.example/x' }, 'P', 'ko')?.href).toBeNull();
    // LinkedIn: el enlace de su perfil tal cual, o su usuario; un enlace de otra web, nada.
    expect(repContactLink({ name: '', channel: 'linkedin', value: 'https://www.linkedin.com/in/laura-gomez/' }, 'P', 'es')).toMatchObject({ href: 'https://www.linkedin.com/in/laura-gomez/', cta: 'Escríbeme por LinkedIn', external: true });
    expect(repContactLink({ name: '', channel: 'linkedin', value: 'linkedin.com/in/laura-gomez' }, 'P', 'es')?.href).toBe('https://www.linkedin.com/in/laura-gomez');
    expect(repContactLink({ name: '', channel: 'linkedin', value: 'laura-gomez' }, 'P', 'en')).toMatchObject({ href: 'https://www.linkedin.com/in/laura-gomez', cta: 'Message me on LinkedIn' });
    expect(repContactLink({ name: '', channel: 'linkedin', value: 'https://evil.example/in/x' }, 'P', 'es')).toBeNull();
  });
  it('en coreano no se ofrece el WhatsApp de la marca', () => {
    expect(contactLinks(brand, 'P', 'ko-KR').map((x) => x.kind)).toEqual(['email']);
  });
  it('WhatsApp y teléfono, solo con número', () => {
    expect(repContactLink({ name: '', channel: 'whatsapp', value: '+82 10-1234-5678' }, 'P', 'es')?.href).toMatch(/^https:\/\/wa\.me\/821012345678\?text=/);
    expect(repContactLink({ name: '', channel: 'phone', value: 'abc' }, 'P', 'es')).toBeNull();
  });
});
