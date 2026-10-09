/** Textos fijos de la propuesta pública (/d/<token>), en el idioma de la propuesta (no en el de quien la abre). */
import { defineMessages, type Locale } from '../core';

const es = {
  forProspect: (p: string) => `Propuesta para ${p}`,
  ogWith: (tenant: string, p: string) => `Propuesta de ${tenant} para ${p}`,
  og: (tenant: string) => `Propuesta de ${tenant}`,
  scroll: 'Ver hacia abajo', slides: '▸ Ver como presentación', prev: 'Anterior', next: 'Siguiente', slidesNav: 'Diapositivas', deck: 'presentación',
  hello: (title: string) => `Hola, os escribo por la propuesta «${title}».`,
  whatsapp: 'Hablemos por WhatsApp', email: 'Escríbenos', phone: 'Llámanos', web: 'Web',
};

export const proposalMessages = defineMessages({
  es,
  en: {
    forProspect: (p: string) => `Proposal for ${p}`,
    ogWith: (tenant: string, p: string) => `${tenant}'s proposal for ${p}`,
    og: (tenant: string) => `Proposal from ${tenant}`,
    scroll: 'Scroll view', slides: '▸ View as slides', prev: 'Previous', next: 'Next', slidesNav: 'Slides', deck: 'presentation',
    hello: (title: string) => `Hi, I'm writing about the proposal "${title}".`,
    whatsapp: "Let's talk on WhatsApp", email: 'Email us', phone: 'Call us', web: 'Website',
  },
  pt: {
    forProspect: (p: string) => `Proposta para ${p}`,
    ogWith: (tenant: string, p: string) => `Proposta de ${tenant} para ${p}`,
    og: (tenant: string) => `Proposta de ${tenant}`,
    scroll: 'Ver em rolagem', slides: '▸ Ver como apresentação', prev: 'Anterior', next: 'Próximo', slidesNav: 'Slides', deck: 'apresentação',
    hello: (title: string) => `Olá, escrevo sobre a proposta «${title}».`,
    whatsapp: 'Vamos conversar no WhatsApp', email: 'Escreva para nós', phone: 'Ligue para nós', web: 'Site',
  },
  ko: {
    forProspect: (p: string) => `${p} 맞춤 제안서`,
    ogWith: (tenant: string, p: string) => `${tenant}의 ${p} 맞춤 제안서`,
    og: (tenant: string) => `${tenant} 제안서`,
    scroll: '아래로 보기', slides: '▸ 슬라이드로 보기', prev: '이전', next: '다음', slidesNav: '슬라이드', deck: '프레젠테이션',
    hello: (title: string) => `안녕하세요, 「${title}」 제안서 관련해 연락드립니다.`,
    whatsapp: 'WhatsApp으로 상담하기', email: '이메일 보내기', phone: '전화하기', web: '웹사이트',
  },
});

/** Idioma de una propuesta (es-ES, en-GB, ko-KR…) → el de sus textos fijos. Catalán y francés, por ahora en español e inglés. */
export const proposalLang = (locale: string | null | undefined): Locale => {
  const l = (locale ?? 'es').slice(0, 2);
  return l === 'ko' || l === 'pt' || l === 'en' ? l : l === 'fr' ? 'en' : 'es';
};
export const proposalText = (locale: string | null | undefined) => proposalMessages[proposalLang(locale)];
