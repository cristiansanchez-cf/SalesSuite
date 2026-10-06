/** Bienvenida de Configurar (/admin/setup/welcome): solo admins y managers, la primera vez que entran en «Configurar». */
import { defineMessages } from '../core';

type Step = { title: string; lede: string; points: string[]; go: string };

const es = {
  title: 'Bienvenida a Configurar',
  step: (n: number, total: number) => `Paso ${n} de ${total}`,
  next: 'Siguiente', back: 'Atrás', skip: 'Saltar', start: 'Empezar',
  again: 'Ver la bienvenida de Configurar',
  hello: {
    title: (name: string) => `${name}, esto es Configurar`,
    lede: (tenant: string) => `Aquí preparas lo que el equipo de ${tenant} vende y cómo lo vende. Solo lo ven los admins y los managers. En dos minutos, qué hay en cada parte.`,
  },
  now: 'Hoy hay',
  open: 'Abrir',
  steps: {
    company: { title: 'Empresa', lede: 'Quiénes sois, qué vendéis y cómo se os ve.', points: ['La configuración guiada: o la rellenas paso a paso o se la das hecha a la IA con vuestros documentos.', 'La marca: logo, colores y fuentes de las propuestas.'], go: 'Abrir Empresa' },
    playbook: { title: 'Playbook', lede: 'Cómo vende tu equipo: las jugadas para abrir, presentar, responder objeciones y cerrar.', points: ['Las que funcionan suben solas: el ranking sale de las ventas.', 'Lo que propone tu equipo te llega para aprobarlo.'], go: 'Abrir Playbook' },
    market: { title: 'Mercado', lede: 'A quién vendéis: los sectores, el cliente ideal y quién decide.', points: ['Cada sector tiene su receta de propuesta: qué bloques salen y en qué orden.', 'Lo ve tu equipo en Aprende y en la bienvenida.'], go: 'Abrir Mercado' },
    catalog: { title: 'Catálogo', lede: 'Los bloques con los que se hacen las propuestas.', points: ['Lo que tu equipo puede enseñar y vender, con la UI de verdad.', 'Cada cambio es una versión nueva: las propuestas enviadas no cambian.'], go: 'Abrir Catálogo' },
    prices: { title: 'Precios', lede: 'Las tarifas y los descuentos que ve el comercial al cotizar.', points: ['Tarifa por bloque y política de precio de los colaboradores.', 'Cupones y descuentos con su límite.'], go: 'Abrir Precios' },
    commissions: { title: 'Comisiones', lede: 'Cuánto gana cada uno y cuándo.', points: ['Planes de comisión por persona o por equipo.', 'Liquidación: lo que se debe, lo pagado y el histórico.'], go: 'Abrir Comisiones' },
  } satisfies Record<string, Step>,
  done: { title: 'Listo', lede: 'Empieza por lo que más te falte. Puedes volver a esta guía desde Configuración guiada.', go: 'Empezar a configurar' },
  counts: { plays: (n: number) => (n === 1 ? '1 jugada' : `${n} jugadas`), sectors: (n: number) => (n === 1 ? '1 sector' : `${n} sectores`), modules: (n: number) => (n === 1 ? '1 bloque' : `${n} bloques`) },
};

export const setupWelcomeMessages = defineMessages({
  es,
  en: {
    title: 'Welcome to Configure',
    step: (n: number, total: number) => `Step ${n} of ${total}`,
    next: 'Next', back: 'Back', skip: 'Skip', start: 'Start',
    again: 'See the Configure welcome',
    hello: {
      title: (name: string) => `${name}, this is Configure`,
      lede: (tenant: string) => `This is where you set up what the ${tenant} team sells and how. Only admins and managers see it. Two minutes: what each part is for.`,
    },
    now: 'Today',
    open: 'Open',
    steps: {
      company: { title: 'Company', lede: 'Who you are, what you sell and how you look.', points: ['Guided setup: fill it in step by step, or hand your documents to the AI.', 'Brand: the logo, colours and fonts of your proposals.'], go: 'Open Company' },
      playbook: { title: 'Playbook', lede: 'How your team sells: plays to open, present, handle objections and close.', points: ['The ones that work rise on their own: the ranking comes from sales.', 'What your team proposes comes to you for approval.'], go: 'Open Playbook' },
      market: { title: 'Market', lede: 'Who you sell to: sectors, ideal customer and who decides.', points: ['Each sector has its proposal recipe: which blocks and in what order.', 'Your team sees it in Learn and in the welcome.'], go: 'Open Market' },
      catalog: { title: 'Catalog', lede: 'The blocks proposals are built from.', points: ['What your team can show and sell, with the real UI.', 'Every change is a new version: sent proposals do not change.'], go: 'Open Catalog' },
      prices: { title: 'Prices', lede: 'The rates and discounts reps see when quoting.', points: ['Price per block and the partner price policy.', 'Coupons and discounts with their limits.'], go: 'Open Prices' },
      commissions: { title: 'Commissions', lede: 'How much each person earns and when.', points: ['Commission plans per person or team.', 'Settlement: what is owed, what is paid and the history.'], go: 'Open Commissions' },
    },
    done: { title: 'Done', lede: 'Start with what is missing most. You can come back to this guide from Guided setup.', go: 'Start configuring' },
    counts: { plays: (n: number) => (n === 1 ? '1 play' : `${n} plays`), sectors: (n: number) => (n === 1 ? '1 sector' : `${n} sectors`), modules: (n: number) => (n === 1 ? '1 block' : `${n} blocks`) },
  },
  pt: {
    title: 'Boas-vindas a Configurar',
    step: (n: number, total: number) => `Passo ${n} de ${total}`,
    next: 'Seguinte', back: 'Voltar', skip: 'Pular', start: 'Começar',
    again: 'Ver as boas-vindas de Configurar',
    hello: {
      title: (name: string) => `${name}, isto é Configurar`,
      lede: (tenant: string) => `Aqui você prepara o que a equipe de ${tenant} vende e como vende. Só admins e managers veem. Em dois minutos, o que há em cada parte.`,
    },
    now: 'Hoje há',
    open: 'Abrir',
    steps: {
      company: { title: 'Empresa', lede: 'Quem vocês são, o que vendem e como aparecem.', points: ['A configuração guiada: preencha passo a passo ou entregue seus documentos à IA.', 'A marca: logo, cores e fontes das propostas.'], go: 'Abrir Empresa' },
      playbook: { title: 'Playbook', lede: 'Como sua equipe vende: jogadas para abrir, apresentar, responder objeções e fechar.', points: ['As que funcionam sobem sozinhas: o ranking vem das vendas.', 'O que sua equipe propõe chega para você aprovar.'], go: 'Abrir Playbook' },
      market: { title: 'Mercado', lede: 'Para quem vocês vendem: setores, cliente ideal e quem decide.', points: ['Cada setor tem sua receita de proposta: quais blocos e em que ordem.', 'Sua equipe vê isso em Aprenda e nas boas-vindas.'], go: 'Abrir Mercado' },
      catalog: { title: 'Catálogo', lede: 'Os blocos com que se fazem as propostas.', points: ['O que sua equipe pode mostrar e vender, com a UI de verdade.', 'Cada mudança é uma nova versão: as propostas enviadas não mudam.'], go: 'Abrir Catálogo' },
      prices: { title: 'Preços', lede: 'As tarifas e descontos que o vendedor vê ao cotar.', points: ['Tarifa por bloco e política de preço dos parceiros.', 'Cupons e descontos com seu limite.'], go: 'Abrir Preços' },
      commissions: { title: 'Comissões', lede: 'Quanto cada um ganha e quando.', points: ['Planos de comissão por pessoa ou equipe.', 'Liquidação: o que se deve, o que foi pago e o histórico.'], go: 'Abrir Comissões' },
    },
    done: { title: 'Pronto', lede: 'Comece pelo que mais falta. Você pode voltar a este guia em Configuração guiada.', go: 'Começar a configurar' },
    counts: { plays: (n: number) => (n === 1 ? '1 jogada' : `${n} jogadas`), sectors: (n: number) => (n === 1 ? '1 setor' : `${n} setores`), modules: (n: number) => (n === 1 ? '1 bloco' : `${n} blocos`) },
  },
  ko: {
    title: '설정에 오신 것을 환영합니다',
    step: (n: number, total: number) => `${total}단계 중 ${n}단계`,
    next: '다음', back: '뒤로', skip: '건너뛰기', start: '시작',
    again: '설정 안내 다시 보기',
    hello: {
      title: (name: string) => `${name}님, 여기가 설정입니다`,
      lede: (tenant: string) => `${tenant} 팀이 무엇을 어떻게 파는지 여기서 준비합니다. 관리자와 매니저만 볼 수 있어요. 2분이면 각 부분을 알 수 있어요.`,
    },
    now: '현재',
    open: '열기',
    steps: {
      company: { title: '회사', lede: '누구인지, 무엇을 파는지, 어떻게 보이는지.', points: ['가이드 설정: 단계별로 채우거나 문서를 AI에 맡기세요.', '브랜드: 제안서의 로고, 색상, 글꼴.'], go: '회사 열기' },
      playbook: { title: '플레이북', lede: '팀의 판매 방식: 시작, 발표, 반론 대응, 마무리 플레이.', points: ['잘 되는 플레이는 자동으로 올라갑니다: 순위는 판매에서 나옵니다.', '팀이 제안한 내용은 승인을 위해 전달됩니다.'], go: '플레이북 열기' },
      market: { title: '시장', lede: '누구에게 파는지: 업종, 이상적 고객, 결정권자.', points: ['업종마다 제안서 레시피가 있습니다: 어떤 블록을 어떤 순서로.', '팀은 학습과 환영 화면에서 봅니다.'], go: '시장 열기' },
      catalog: { title: '카탈로그', lede: '제안서를 만드는 블록.', points: ['팀이 보여주고 팔 수 있는 것, 실제 UI로.', '변경할 때마다 새 버전: 보낸 제안서는 바뀌지 않습니다.'], go: '카탈로그 열기' },
      prices: { title: '가격', lede: '견적 시 영업 담당자가 보는 요금과 할인.', points: ['블록별 요금과 파트너 가격 정책.', '쿠폰과 할인, 그리고 한도.'], go: '가격 열기' },
      commissions: { title: '커미션', lede: '누가 얼마를 언제 버는지.', points: ['개인 또는 팀별 커미션 플랜.', '정산: 미지급, 지급 완료, 내역.'], go: '커미션 열기' },
    },
    done: { title: '완료', lede: '가장 부족한 것부터 시작하세요. 가이드 설정에서 이 안내로 돌아올 수 있어요.', go: '설정 시작' },
    counts: { plays: (n: number) => `플레이 ${n}개`, sectors: (n: number) => `업종 ${n}개`, modules: (n: number) => `블록 ${n}개` },
  },
});
