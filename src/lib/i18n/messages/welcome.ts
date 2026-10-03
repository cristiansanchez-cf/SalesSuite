/** Bienvenida paso a paso (/admin/welcome): una idea por pantalla, poco texto, y se termina haciendo algo. */
import { defineMessages } from '../core';

const es = {
  title: 'Bienvenida',
  resume: { title: 'Termina tu bienvenida', lede: 'Dos minutos: qué vendes, a quién, cómo y qué ganas.', go: 'Continuar' },
  again: 'Ver la bienvenida paso a paso',
  step: (n: number, total: number) => `Paso ${n} de ${total}`,
  next: 'Siguiente', back: 'Atrás', skip: 'Saltar la bienvenida', start: 'Empezar',
  hello: { title: (name: string) => `Hola, ${name}`, lede: (tenant: string) => `En dos minutos sabrás qué vendes con ${tenant}, a quién, cómo y qué ganas.` },
  sell: { title: 'Qué vendemos', lede: 'Primero, míralo funcionar. Después, lo que puedes ofrecer.', tour: 'Mira lo que vendes', tourMeta: (n: number) => `${n} pasos · 1 minuto`, tourGo: 'Verlo ahora', empty: 'El catálogo está en preparación: te avisaremos.', from: (p: string) => `desde ${p}` },
  who: { title: 'A quién', lede: 'Dónde encaja mejor. Empieza por aquí.', tap: 'Toca un sector: cliente ideal, quién decide y cómo queda su propuesta.', icp: 'Cliente ideal', avoid: 'Mejor no', empty: 'Aún no hay sectores definidos.' },
  how: {
    title: 'Cómo se vende', lede: 'Lo que ya ha funcionado, y lo que todavía es una idea del equipo.',
    proven: (n: number) => `Comprobado · ganó en ${n}`, hypothesis: 'Hipótesis: pruébala y cuéntanos', empty: 'El equipo está preparando el playbook.',
  },
  terms: {
    title: 'Lo que ganas', pendingTitle: 'Tus condiciones, cuando hayas probado',
    pending: 'Primero comprueba que se vende. Después las acordamos contigo, sin prisa.',
    agreed: 'Acordadas', more: 'Las tienes siempre en «Empieza aquí» y en «Mis comisiones».',
  },
  team: {
    title: 'Prepara a tu equipo', lede: 'Antes de invitar a nadie, deja esto listo. Puedes hacerlo luego desde Configurar.',
    catalog: 'Revisa el catálogo y los precios', market: 'Define sectores y personas (configuración guiada)',
    invite: 'Invita a tu equipo', terms: 'Acuerda las condiciones de cada persona', go: 'Abrir',
  },
  first: {
    title: 'Tu primera propuesta', lede: '¿A quién le vas a vender primero? Solo el nombre: el resto lo preparas en la propuesta.',
    company: 'Empresa o cliente', companyPlaceholder: 'Sala Luna', create: 'Crear y abrir', later: 'Lo hago luego',
    partner: 'Tus cuentas están en «Mis cuentas». Abre una y crea su propuesta.', partnerGo: 'Ir a mis cuentas',
    cerebro: 'Y conecta el Cerebro de Ventas a tu Claude o ChatGPT para preparar cada mensaje.',
    proposalTitle: (company: string) => `Propuesta para ${company}`,
  },
};

export const welcomeMessages = defineMessages({
  es,
  en: {
    title: 'Welcome',
    resume: { title: 'Finish your welcome', lede: 'Two minutes: what you sell, to whom, how and what you earn.', go: 'Continue' },
    again: 'See the step-by-step welcome',
    step: (n, total) => `Step ${n} of ${total}`,
    next: 'Next', back: 'Back', skip: 'Skip the welcome', start: 'Start',
    hello: { title: (name) => `Hi, ${name}`, lede: (tenant) => `In two minutes you will know what you sell with ${tenant}, to whom, how, and what you earn.` },
    sell: { title: 'What we sell', lede: 'First, see it in action. Then, what you can offer.', tour: 'See what you sell', tourMeta: (n) => `${n} steps · 1 minute`, tourGo: 'Watch now', empty: 'The catalog is being prepared: we will let you know.', from: (p) => `from ${p}` },
    who: { title: 'Who to', lede: 'Where it fits best. Start here.', tap: 'Tap a sector to see its full sheet: ideal customer, who decides and how to handle each person.', icp: 'Ideal customer', avoid: 'Better not', empty: 'No sectors defined yet.' },
    how: {
      title: 'How it sells', lede: 'What has already worked, and what is still a team idea.',
      proven: (n) => `Proven · won ${n}`, hypothesis: 'Hypothesis: try it and tell us', empty: 'The team is preparing the playbook.',
    },
    terms: {
      title: 'What you earn', pendingTitle: 'Your terms, once you have tried it',
      pending: 'First check that it sells. Then we agree them with you, no rush.',
      agreed: 'Agreed', more: 'They are always in “Start here” and “My commissions”.',
    },
    team: {
      title: 'Get your team ready', lede: 'Before inviting anyone, get this ready. You can also do it later from Configure.',
      catalog: 'Review the catalog and prices', market: 'Define sectors and people (guided setup)',
      invite: 'Invite your team', terms: 'Agree each person’s terms', go: 'Open',
    },
    first: {
      title: 'Your first proposal', lede: 'Who will you sell to first? Just the name: you prepare the rest in the proposal.',
      company: 'Company or client', companyPlaceholder: 'Sala Luna', create: 'Create and open', later: 'I will do it later',
      partner: 'Your accounts are in “My accounts”. Open one and create its proposal.', partnerGo: 'Go to my accounts',
      cerebro: 'And connect the Sales Brain to your Claude or ChatGPT to prepare each message.',
      proposalTitle: (company) => `Proposal for ${company}`,
    },
  },
  pt: {
    title: 'Boas-vindas',
    resume: { title: 'Termine suas boas-vindas', lede: 'Dois minutos: o que vende, para quem, como e quanto ganha.', go: 'Continuar' },
    again: 'Ver as boas-vindas passo a passo',
    step: (n, total) => `Passo ${n} de ${total}`,
    next: 'Seguinte', back: 'Voltar', skip: 'Pular as boas-vindas', start: 'Começar',
    hello: { title: (name) => `Olá, ${name}`, lede: (tenant) => `Em dois minutos você saberá o que vende com ${tenant}, para quem, como e quanto ganha.` },
    sell: { title: 'O que vendemos', lede: 'Primeiro, veja funcionando. Depois, o que você pode oferecer.', tour: 'Veja o que você vende', tourMeta: (n) => `${n} passos · 1 minuto`, tourGo: 'Ver agora', empty: 'O catálogo está em preparação: avisaremos.', from: (p) => `a partir de ${p}` },
    who: { title: 'Para quem', lede: 'Onde encaixa melhor. Comece por aqui.', tap: 'Toque em um setor para ver a ficha completa: cliente ideal, quem decide e como tratar cada pessoa.', icp: 'Cliente ideal', avoid: 'Melhor não', empty: 'Ainda não há setores definidos.' },
    how: {
      title: 'Como se vende', lede: 'O que já funcionou e o que ainda é uma ideia da equipe.',
      proven: (n) => `Comprovado · ganhou em ${n}`, hypothesis: 'Hipótese: teste e conte para nós', empty: 'A equipe está preparando o playbook.',
    },
    terms: {
      title: 'O que você ganha', pendingTitle: 'Suas condições, depois de testar',
      pending: 'Primeiro confirme que vende. Depois combinamos com você, sem pressa.',
      agreed: 'Combinadas', more: 'Estão sempre em “Comece aqui” e em “Minhas comissões”.',
    },
    team: {
      title: 'Prepare sua equipe', lede: 'Antes de convidar alguém, deixe isto pronto. Também pode fazer depois em Configurar.',
      catalog: 'Revise o catálogo e os preços', market: 'Defina setores e pessoas (configuração guiada)',
      invite: 'Convide sua equipe', terms: 'Combine as condições de cada pessoa', go: 'Abrir',
    },
    first: {
      title: 'Sua primeira proposta', lede: 'Para quem você vai vender primeiro? Só o nome: o resto você prepara na proposta.',
      company: 'Empresa ou cliente', companyPlaceholder: 'Sala Luna', create: 'Criar e abrir', later: 'Faço depois',
      partner: 'Suas contas estão em “Minhas contas”. Abra uma e crie a proposta.', partnerGo: 'Ir para minhas contas',
      cerebro: 'E conecte o Cérebro de Vendas ao seu Claude ou ChatGPT para preparar cada mensagem.',
      proposalTitle: (company) => `Proposta para ${company}`,
    },
  },
  ko: {
    title: '환영합니다',
    resume: { title: '환영 안내 마치기', lede: '2분이면 됩니다: 무엇을, 누구에게, 어떻게 팔고 무엇을 얻는지.', go: '계속하기' },
    again: '단계별 환영 안내 다시 보기',
    step: (n, total) => `${total}단계 중 ${n}단계`,
    next: '다음', back: '이전', skip: '건너뛰기', start: '시작하기',
    hello: { title: (name) => `${name}님, 안녕하세요`, lede: (tenant) => `2분이면 ${tenant}에서 무엇을, 누구에게, 어떻게 팔고 무엇을 얻는지 알 수 있어요.` },
    sell: { title: '무엇을 파나요', lede: '먼저 작동하는 모습을 보세요. 그다음 제안할 수 있는 것들입니다.', tour: '무엇을 파는지 보세요', tourMeta: (n) => `${n}단계 · 1분`, tourGo: '지금 보기', empty: '카탈로그를 준비하고 있습니다. 준비되면 알려 드릴게요.', from: (p) => `${p}부터` },
    who: { title: '누구에게', lede: '가장 잘 맞는 곳입니다. 여기서 시작하세요.', tap: '업종을 눌러 전체 정보를 보세요: 이상적인 고객, 결정권자, 사람마다 대하는 방법.', icp: '이상적인 고객', avoid: '피하는 게 좋은 경우', empty: '아직 정의된 업종이 없습니다.' },
    how: {
      title: '어떻게 파나요', lede: '이미 효과가 있었던 것과 아직 팀의 아이디어인 것입니다.',
      proven: (n) => `검증됨 · ${n}건 성사`, hypothesis: '가설: 시도해 보고 알려 주세요', empty: '팀이 플레이북을 준비하고 있습니다.',
    },
    terms: {
      title: '얻는 것', pendingTitle: '직접 해 본 뒤에 정하는 조건',
      pending: '먼저 팔리는지 확인하세요. 그다음 함께 정하겠습니다. 서두를 필요 없어요.',
      agreed: '합의됨', more: '“여기서 시작하세요”와 “내 커미션”에서 언제든 볼 수 있습니다.',
    },
    team: {
      title: '팀 준비하기', lede: '누군가를 초대하기 전에 이것을 준비하세요. 나중에 설정에서 해도 됩니다.',
      catalog: '카탈로그와 가격 검토', market: '업종과 대상 정의(안내 설정)',
      invite: '팀 초대하기', terms: '각자의 조건 합의하기', go: '열기',
    },
    first: {
      title: '첫 제안서', lede: '누구에게 먼저 팔 건가요? 이름만 적으세요. 나머지는 제안서에서 준비합니다.',
      company: '회사 또는 고객', companyPlaceholder: 'Sala Luna', create: '만들고 열기', later: '나중에 할게요',
      partner: '계정은 “내 계정”에 있습니다. 하나를 열고 제안서를 만드세요.', partnerGo: '내 계정으로 가기',
      cerebro: '그리고 세일즈 브레인을 Claude 또는 ChatGPT에 연결해 메시지마다 준비하세요.',
      proposalTitle: (company) => `${company} 제안서`,
    },
  },
});
