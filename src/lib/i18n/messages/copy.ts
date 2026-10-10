/** Dar una copia de una propuesta a otros comerciales (docs/I18N.md §Contenido), en su idioma. */
import { defineMessages } from '../core';

export const copyMessages = defineMessages({
  es: {
    open: 'Dar copia a un comercial', title: 'Dar una copia', body: 'Cada comercial recibe su propia copia, en borrador, con los mismos módulos y textos. La tuya no cambia.',
    to: 'Para', language: 'Idioma de la propuesta', same: 'El mismo', translate: 'Traducir también los textos propios (títulos, nombre del cliente, personalizaciones) con IA',
    translateHelp: 'Los textos de los módulos ya salen en el idioma del espacio si están traducidos.', send: 'Dar copia', cancel: 'Cancelar',
    ok: (n: number) => (n === 1 ? 'Copia creada: ya la tiene en sus propuestas.' : `${n} copias creadas: ya las tienen en sus propuestas.`),
    langs: { 'es-ES': 'Español', 'en-GB': 'Inglés', 'pt-PT': 'Portugués', 'ko-KR': 'Coreano', 'ca-ES': 'Catalán', 'fr-FR': 'Francés' },
  },
  en: {
    open: 'Give a copy to a sales rep', title: 'Give a copy', body: 'Each rep gets their own draft copy with the same modules and texts. Yours doesn’t change.',
    to: 'To', language: 'Proposal language', same: 'The same', translate: 'Also translate the custom texts (titles, client name, customisations) with AI',
    translateHelp: 'Module texts already show in the space’s language if they are translated.', send: 'Give copy', cancel: 'Cancel',
    ok: (n: number) => (n === 1 ? 'Copy created: it’s now in their proposals.' : `${n} copies created: they’re now in their proposals.`),
    langs: { 'es-ES': 'Spanish', 'en-GB': 'English', 'pt-PT': 'Portuguese', 'ko-KR': 'Korean', 'ca-ES': 'Catalan', 'fr-FR': 'French' },
  },
  pt: {
    open: 'Dar cópia a um comercial', title: 'Dar uma cópia', body: 'Cada comercial recebe a própria cópia, em rascunho, com os mesmos módulos e textos. A sua não muda.',
    to: 'Para', language: 'Idioma da proposta', same: 'O mesmo', translate: 'Traduzir também os textos próprios (títulos, nome do cliente, personalizações) com IA',
    translateHelp: 'Os textos dos módulos já aparecem no idioma do espaço se estiverem traduzidos.', send: 'Dar cópia', cancel: 'Cancelar',
    ok: (n: number) => (n === 1 ? 'Cópia criada: já está nas propostas dele.' : `${n} cópias criadas: já estão nas propostas deles.`),
    langs: { 'es-ES': 'Espanhol', 'en-GB': 'Inglês', 'pt-PT': 'Português', 'ko-KR': 'Coreano', 'ca-ES': 'Catalão', 'fr-FR': 'Francês' },
  },
  ko: {
    open: '영업 담당자에게 사본 주기', title: '사본 주기', body: '각 담당자가 같은 모듈과 텍스트로 된 자신의 초안 사본을 받습니다. 내 제안서는 바뀌지 않습니다.',
    to: '받는 사람', language: '제안서 언어', same: '그대로', translate: '직접 쓴 텍스트(제목, 고객 이름, 맞춤 내용)도 AI로 번역',
    translateHelp: '모듈 텍스트는 번역되어 있으면 이미 해당 언어로 표시됩니다.', send: '사본 주기', cancel: '취소',
    ok: (n: number) => `사본 ${n}개를 만들었습니다. 이제 각자의 제안서에 있습니다.`,
    langs: { 'es-ES': '스페인어', 'en-GB': '영어', 'pt-PT': '포르투갈어', 'ko-KR': '한국어', 'ca-ES': '카탈루냐어', 'fr-FR': '프랑스어' },
  },
});
