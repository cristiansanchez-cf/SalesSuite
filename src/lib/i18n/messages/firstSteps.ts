/** Primeros pasos en Inicio (docs/PLAN_AJUSTES.md, paso 7). */
import { defineMessages } from '../core';

const es = {
  title: 'Primeros pasos', progress: (d: number, t: number) => `${d} de ${t}`, hide: 'Ocultar', go: 'Ir', done: 'Hecho',
  ledeAdmin: 'Lo que hace falta para que tu equipo venda con todo. Se va tachando solo.',
  ledeRep: 'Tres cosas para empezar. Se van tachando solas.',
  admin: {
    company: { t: 'Prepara tu empresa', d: 'Qué vendes y a quién: lo usa todo lo demás.' },
    brand: { t: 'Pon tu marca', d: 'Tu logo y tus colores en las propuestas.' },
    team: { t: 'Invita a tu equipo', d: 'Cada persona con su acceso.' },
    leads: { t: 'Conecta tus leads', d: 'Que la web o la app mande cada solicitud al CRM y se conteste sola.' },
    assistant: { t: 'Activa el asistente de WhatsApp', d: 'Para que tu equipo apunte contándolo.' },
  },
  rep: {
    phone: { t: 'Pon tu móvil', d: 'Así te reconoce el asistente de WhatsApp.' },
    assistant: { t: 'Escribe al asistente', d: 'Cuéntale tu última visita: lo apunta en el CRM.' },
    proposal: { t: 'Crea tu primera propuesta', d: 'Eliges el cliente y los módulos; la mandas como una web.' },
  },
};

export const firstStepsMessages = defineMessages({
  es,
  en: {
    title: 'First steps', progress: (d: number, t: number) => `${d} of ${t}`, hide: 'Hide', go: 'Go', done: 'Done',
    ledeAdmin: 'What your team needs to sell at full speed. It ticks itself off.',
    ledeRep: 'Three things to get started. They tick themselves off.',
    admin: {
      company: { t: 'Set up your company', d: 'What you sell and to whom: everything else uses it.' },
      brand: { t: 'Add your brand', d: 'Your logo and colours on your proposals.' },
      team: { t: 'Invite your team', d: 'Each person with their own access.' },
      leads: { t: 'Connect your leads', d: 'Your website or app sends every request to the CRM and it gets a reply on its own.' },
      assistant: { t: 'Turn on the WhatsApp assistant', d: 'So your team logs things by telling it.' },
    },
    rep: {
      phone: { t: 'Add your mobile', d: 'That is how the WhatsApp assistant recognises you.' },
      assistant: { t: 'Write to the assistant', d: 'Tell it about your last visit: it logs it in the CRM.' },
      proposal: { t: 'Create your first proposal', d: 'Pick the client and the modules; you send it as a web page.' },
    },
  },
  pt: {
    title: 'Primeiros passos', progress: (d: number, t: number) => `${d} de ${t}`, hide: 'Ocultar', go: 'Ir', done: 'Feito',
    ledeAdmin: 'O que falta para sua equipe vender com tudo. Vai se marcando sozinho.',
    ledeRep: 'Três coisas para começar. Vão se marcando sozinhas.',
    admin: {
      company: { t: 'Prepare sua empresa', d: 'O que você vende e para quem: todo o resto usa isso.' },
      brand: { t: 'Coloque sua marca', d: 'Seu logo e suas cores nas propostas.' },
      team: { t: 'Convide sua equipe', d: 'Cada pessoa com seu acesso.' },
      leads: { t: 'Conecte seus leads', d: 'O site ou o app envia cada pedido para o CRM e ele é respondido sozinho.' },
      assistant: { t: 'Ative o assistente de WhatsApp', d: 'Para sua equipe registrar contando.' },
    },
    rep: {
      phone: { t: 'Coloque seu celular', d: 'É assim que o assistente de WhatsApp reconhece você.' },
      assistant: { t: 'Escreva para o assistente', d: 'Conte sua última visita: ele registra no CRM.' },
      proposal: { t: 'Crie sua primeira proposta', d: 'Escolha o cliente e os módulos; envie como uma página web.' },
    },
  },
  ko: {
    title: '첫 단계', progress: (d: number, t: number) => `${t}개 중 ${d}개`, hide: '숨기기', go: '이동', done: '완료',
    ledeAdmin: '팀이 제대로 영업하는 데 필요한 것입니다. 하면 저절로 체크됩니다.',
    ledeRep: '시작하는 데 필요한 세 가지입니다. 하면 저절로 체크됩니다.',
    admin: {
      company: { t: '회사 준비', d: '무엇을 누구에게 파는지: 다른 모든 것이 이것을 씁니다.' },
      brand: { t: '브랜드 넣기', d: '제안서에 들어갈 로고와 색상.' },
      team: { t: '팀 초대', d: '각자 자신의 계정으로.' },
      leads: { t: '리드 연결', d: '웹사이트나 앱의 문의가 CRM으로 들어오고 자동으로 답장합니다.' },
      assistant: { t: 'WhatsApp 어시스턴트 켜기', d: '팀이 말로 기록할 수 있도록.' },
    },
    rep: {
      phone: { t: '휴대폰 번호 넣기', d: 'WhatsApp 어시스턴트가 이 번호로 알아봅니다.' },
      assistant: { t: '어시스턴트에게 쓰기', d: '최근 방문을 알려 주면 CRM에 기록합니다.' },
      proposal: { t: '첫 제안서 만들기', d: '고객과 모듈을 고르고 웹페이지로 보냅니다.' },
    },
  },
});
