/** Decks de inversión (docs/DECKS.md). */
import { defineMessages } from '../core';

export const decksMessages = defineMessages({
  es: {
    nav: 'Decks', eyebrow: 'Inversión', title: 'Decks',
    lede: 'Vuestros decks de inversión: uno por inversor, con su enlace y quién lo abre. Se montan como una propuesta.',
    newDeck: 'Nuevo deck', analytics: 'Analítica', analyticsLede: 'Qué inversor ha abierto su deck, cuánto lo ha leído y a quién escribir hoy.', empty: 'Aún no hay decks. Crea uno para un inversor de tu CRM.',
    dialogTitle: 'Nuevo deck', investor: 'Inversor', investorHelp: 'Búscalo en tu CRM (fondo o business angel). Si no está, se crea como inversor.',
    investorPlaceholder: 'Nombre del fondo o de la persona', titleLabel: 'Título', titlePlaceholder: (who: string) => `Deck para ${who}`, create: 'Crear deck', cancel: 'Cancelar',
    status: { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' } as Record<string, string>,
    opens: (n: number) => (n === 1 ? '1 apertura' : `${n} aperturas`), never: 'Sin abrir', blocks: (n: number) => (n === 1 ? '1 bloque' : `${n} bloques`),
    platform: { label: 'Startup: sección Decks', on: 'Activada', off: 'Desactivada', turnOn: 'Activar', turnOff: 'Quitar' },
    accountTitle: (n: number) => `Decks · ${n}`, newForAccount: 'Crear deck',
  },
  en: {
    nav: 'Decks', eyebrow: 'Investment', title: 'Decks',
    lede: 'Your investment decks: one per investor, with its link and who opens it. Built like a proposal.',
    newDeck: 'New deck', analytics: 'Analytics', analyticsLede: 'Which investor opened their deck, how much they read and who to write to today.', empty: 'No decks yet. Create one for an investor in your CRM.',
    dialogTitle: 'New deck', investor: 'Investor', investorHelp: 'Find them in your CRM (fund or business angel). If they are not there, they are created as an investor.',
    investorPlaceholder: 'Fund or person name', titleLabel: 'Title', titlePlaceholder: (who: string) => `Deck for ${who}`, create: 'Create deck', cancel: 'Cancel',
    status: { draft: 'Draft', published: 'Published', archived: 'Archived' },
    opens: (n: number) => (n === 1 ? '1 open' : `${n} opens`), never: 'Not opened', blocks: (n: number) => (n === 1 ? '1 block' : `${n} blocks`),
    platform: { label: 'Startup: Decks section', on: 'On', off: 'Off', turnOn: 'Turn on', turnOff: 'Remove' },
    accountTitle: (n: number) => `Decks · ${n}`, newForAccount: 'Create deck',
  },
  pt: {
    nav: 'Decks', eyebrow: 'Investimento', title: 'Decks',
    lede: 'Os vossos decks de investimento: um por investidor, com o seu link e quem o abre. Montam-se como uma proposta.',
    newDeck: 'Novo deck', analytics: 'Analítica', analyticsLede: 'Que investidor abriu o seu deck, quanto leu e a quem escrever hoje.', empty: 'Ainda não há decks. Cria um para um investidor do teu CRM.',
    dialogTitle: 'Novo deck', investor: 'Investidor', investorHelp: 'Procura-o no teu CRM (fundo ou business angel). Se não estiver, cria-se como investidor.',
    investorPlaceholder: 'Nome do fundo ou da pessoa', titleLabel: 'Título', titlePlaceholder: (who: string) => `Deck para ${who}`, create: 'Criar deck', cancel: 'Cancelar',
    status: { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' },
    opens: (n: number) => (n === 1 ? '1 abertura' : `${n} aberturas`), never: 'Por abrir', blocks: (n: number) => (n === 1 ? '1 bloco' : `${n} blocos`),
    platform: { label: 'Startup: secção Decks', on: 'Ativada', off: 'Desativada', turnOn: 'Ativar', turnOff: 'Tirar' },
    accountTitle: (n: number) => `Decks · ${n}`, newForAccount: 'Criar deck',
  },
  ko: {
    nav: '덱', eyebrow: '투자', title: '덱',
    lede: '투자 덱: 투자자마다 하나씩, 링크와 열람 기록이 함께 있습니다. 제안서처럼 만듭니다.',
    newDeck: '새 덱', analytics: '분석', analyticsLede: '어떤 투자자가 덱을 열었는지, 얼마나 읽었는지, 오늘 누구에게 연락할지.', empty: '아직 덱이 없습니다. CRM의 투자자에게 보낼 덱을 만드세요.',
    dialogTitle: '새 덱', investor: '투자자', investorHelp: 'CRM에서 찾으세요(펀드 또는 엔젤 투자자). 없으면 투자자로 새로 만듭니다.',
    investorPlaceholder: '펀드 또는 사람 이름', titleLabel: '제목', titlePlaceholder: (who: string) => `${who}용 덱`, create: '덱 만들기', cancel: '취소',
    status: { draft: '초안', published: '게시됨', archived: '보관됨' },
    opens: (n: number) => `열람 ${n}회`, never: '열람 없음', blocks: (n: number) => `블록 ${n}개`,
    platform: { label: '스타트업: 덱 섹션', on: '켜짐', off: '꺼짐', turnOn: '켜기', turnOff: '끄기' },
    accountTitle: (n: number) => `덱 · ${n}`, newForAccount: '덱 만들기',
  },
});
