/** El asistente de WhatsApp: Configurar → Asistente y la tarjeta de Mi cuenta (docs/PLAN_AJUSTES.md, paso 5). */
import { defineMessages } from '../core';

const es = {
  eyebrow: 'Configurar', title: 'Asistente de WhatsApp',
  lede: 'Tu equipo le cuenta por WhatsApp lo que pasa con cada cliente, en texto o en audio, y él lo apunta en el CRM. Cada mañana les recuerda a quién escribir.',
  status: {
    hub: 'Tu equipo escribe al número del asistente de Cofundo, el mismo para todas las empresas.',
    tenant: 'Tu equipo escribe al número de WhatsApp de tu empresa.',
    off: 'Todavía no está activo en tu empresa. Se activa con el número de WhatsApp de tu empresa (Leads entrantes → WhatsApp a los leads) o con el número común de Cofundo.',
    number: 'Número del asistente', unknown: 'No hemos podido leer el número en Meta.', open: 'Abrir WhatsApp',
  },
  how: {
    title: 'Así funciona',
    items: [
      'Cada persona pone su móvil en Mi cuenta: así la reconoce.',
      'Le escribe o le manda un audio contando lo que ha pasado.',
      'El asistente lo apunta en la ficha del cliente y pregunta antes de guardar.',
      'Cada mañana le dice a quién toca escribir hoy y le propone el mensaje.',
    ],
  },
  chat: { me: 'Hablé con Club Sol, quieren propuesta para el viernes', bot: 'Lo apunto en Club Sol: «Quieren propuesta para el viernes». Próximo paso: mandar la propuesta, el viernes. ¿Lo guardo?', yes: 'Sí', saved: 'Guardado en Club Sol.' },
  team: {
    title: 'Tu equipo', lede: 'Sin teléfono en Mi cuenta, el asistente no reconoce a esa persona.',
    ready: 'Listo', missing: 'Falta el teléfono', count: (n: number, t: number) => `${n} de ${t} con el teléfono puesto`, empty: 'Todavía no hay nadie en el equipo.',
    copyTitle: 'Mensaje para el equipo', copyHelp: 'Pásaselo por donde habléis normalmente.', copy: 'Copiar', copied: 'Copiado',
    message: (number: string, url: string) => `Para usar el asistente de WhatsApp:\n1. Pon tu móvil en Mi cuenta: ${url}\n2. Escribe o manda un audio a ${number} contándole lo que pasa con cada cliente. Él lo apunta en el CRM.`,
  },
  reminders: {
    title: 'Recordatorios de cada mañana', lede: 'De 9:00 a 12:00, a quien lo active en Mi cuenta: a quién toca escribir hoy y, si dice que sí, el mensaje propuesto.',
    platform: (t: string) => `La plantilla (${t}) la aprueba Cofundo en Meta: no tienes que hacer nada.`,
    own: (t: string) => `Con la plantilla ${t}, aprobada en Meta.`,
    missing: 'Para escribir primero, WhatsApp pide una plantilla aprobada por Meta. Se pone en Leads entrantes → WhatsApp a los leads.',
  },
  card: {
    title: 'Tu asistente de WhatsApp', lede: 'Cuéntale lo que pasa con cada cliente, en texto o en audio, y lo apunta en el CRM.',
    writeTo: 'Escríbele a', open: 'Abrir WhatsApp', from: (p: string) => `Escríbele desde este móvil: ${p}. Es como te reconoce.`,
    noPhone: 'Pon tu teléfono arriba para que te reconozca.',
    same: 'Ese es el número del asistente. Escríbele desde tu móvil, no desde ese número: un número no puede escribirse a sí mismo.',
    off: 'Tu empresa todavía no tiene el asistente activo.', tipsTitle: 'Prueba con',
    tips: ['«Hablé con Club Sol, quieren propuesta el viernes»', 'Un audio contando una visita', '«¿Qué tengo hoy?»'],
  },
};

export const assistantSetupMessages = defineMessages({
  es,
  en: {
    eyebrow: 'Configure', title: 'WhatsApp assistant',
    lede: 'Your team tells it on WhatsApp what happens with each client, in text or voice, and it logs it in the CRM. Every morning it reminds them who to write to.',
    status: {
      hub: 'Your team writes to the Cofundo assistant number, the same for every company.',
      tenant: 'Your team writes to your company’s WhatsApp number.',
      off: 'It is not active in your company yet. It is turned on with your company’s WhatsApp number (Incoming leads → WhatsApp to leads) or with the common Cofundo number.',
      number: 'Assistant number', unknown: 'We could not read the number from Meta.', open: 'Open WhatsApp',
    },
    how: {
      title: 'How it works',
      items: [
        'Each person adds their mobile in My account: that is how it recognises them.',
        'They write or send a voice note telling what happened.',
        'The assistant logs it on the client’s record and asks before saving.',
        'Every morning it tells them who to write to today and suggests the message.',
      ],
    },
    chat: { me: 'Talked to Club Sol, they want a proposal by Friday', bot: 'Logging it on Club Sol: “They want a proposal by Friday”. Next step: send the proposal, Friday. Save it?', yes: 'Yes', saved: 'Saved on Club Sol.' },
    team: {
      title: 'Your team', lede: 'Without a phone in My account, the assistant does not recognise that person.',
      ready: 'Ready', missing: 'Phone missing', count: (n: number, t: number) => `${n} of ${t} with their phone added`, empty: 'Nobody in the team yet.',
      copyTitle: 'Message for the team', copyHelp: 'Send it wherever you usually talk.', copy: 'Copy', copied: 'Copied',
      message: (number: string, url: string) => `To use the WhatsApp assistant:\n1. Add your mobile in My account: ${url}\n2. Write or send a voice note to ${number} telling it what happens with each client. It logs it in the CRM.`,
    },
    reminders: {
      title: 'Morning reminders', lede: 'From 9:00 to 12:00, to whoever turns them on in My account: who to write to today and, if they say yes, the suggested message.',
      platform: (t: string) => `The template (${t}) is approved by Cofundo in Meta: nothing for you to do.`,
      own: (t: string) => `With the template ${t}, approved in Meta.`,
      missing: 'To write first, WhatsApp needs a template approved by Meta. It goes in Incoming leads → WhatsApp to leads.',
    },
    card: {
      title: 'Your WhatsApp assistant', lede: 'Tell it what happens with each client, in text or voice, and it logs it in the CRM.',
      writeTo: 'Write to', open: 'Open WhatsApp', from: (p: string) => `Write from this mobile: ${p}. That is how it recognises you.`,
      noPhone: 'Add your phone above so it recognises you.',
      same: 'That is the assistant’s number. Write from your mobile, not from that number: a number cannot message itself.',
      off: 'Your company does not have the assistant active yet.', tipsTitle: 'Try',
      tips: ['“Talked to Club Sol, they want a proposal by Friday”', 'A voice note about a visit', '“What do I have today?”'],
    },
  },
  pt: {
    eyebrow: 'Configurar', title: 'Assistente de WhatsApp',
    lede: 'Sua equipe conta-lhe por WhatsApp o que acontece com cada cliente, em texto ou áudio, e ele registra no CRM. Todas as manhãs lembra-lhes a quem escrever.',
    status: {
      hub: 'Sua equipe escreve para o número do assistente da Cofundo, o mesmo para todas as empresas.',
      tenant: 'Sua equipe escreve para o número de WhatsApp da sua empresa.',
      off: 'Ainda não está ativo na sua empresa. Ativa-se com o número de WhatsApp da empresa (Leads recebidos → WhatsApp aos leads) ou com o número comum da Cofundo.',
      number: 'Número do assistente', unknown: 'Não conseguimos ler o número na Meta.', open: 'Abrir WhatsApp',
    },
    how: {
      title: 'Como funciona',
      items: [
        'Cada pessoa põe o celular em Minha conta: é assim que a reconhece.',
        'Escreve-lhe ou manda um áudio contando o que aconteceu.',
        'O assistente registra na ficha do cliente e pergunta antes de guardar.',
        'Todas as manhãs diz-lhe a quem escrever hoje e propõe a mensagem.',
      ],
    },
    chat: { me: 'Falei com o Club Sol, querem proposta para sexta', bot: 'Registro no Club Sol: «Querem proposta para sexta». Próximo passo: enviar a proposta, sexta. Salvo?', yes: 'Sim', saved: 'Salvo no Club Sol.' },
    team: {
      title: 'Sua equipe', lede: 'Sem telefone em Minha conta, o assistente não reconhece essa pessoa.',
      ready: 'Pronto', missing: 'Falta o telefone', count: (n: number, t: number) => `${n} de ${t} com o telefone posto`, empty: 'Ainda não há ninguém na equipe.',
      copyTitle: 'Mensagem para a equipe', copyHelp: 'Envie por onde falam normalmente.', copy: 'Copiar', copied: 'Copiado',
      message: (number: string, url: string) => `Para usar o assistente de WhatsApp:\n1. Põe o teu celular em Minha conta: ${url}\n2. Escreve ou manda um áudio para ${number} contando o que acontece com cada cliente. Ele registra no CRM.`,
    },
    reminders: {
      title: 'Lembretes de cada manhã', lede: 'Das 9:00 às 12:00, a quem os ativar em Minha conta: a quem escrever hoje e, se disser que sim, a mensagem proposta.',
      platform: (t: string) => `O modelo (${t}) é aprovado pela Cofundo na Meta: não tem de fazer nada.`,
      own: (t: string) => `Com o modelo ${t}, aprovado na Meta.`,
      missing: 'Para escrever primeiro, o WhatsApp pede um modelo aprovado pela Meta. Põe-se em Leads recebidos → WhatsApp aos leads.',
    },
    card: {
      title: 'Seu assistente de WhatsApp', lede: 'Conte-lhe o que acontece com cada cliente, em texto ou áudio, e ele registra no CRM.',
      writeTo: 'Escreva para', open: 'Abrir WhatsApp', from: (p: string) => `Escreva deste celular: ${p}. É assim que o reconhece.`,
      noPhone: 'Coloque seu telefone acima para que o reconheça.',
      same: 'Esse é o número do assistente. Escreva do seu celular, não desse número: um número não pode escrever a si próprio.',
      off: 'Sua empresa ainda não tem o assistente ativo.', tipsTitle: 'Experimente',
      tips: ['«Falei com o Club Sol, querem proposta para sexta»', 'Um áudio contando uma visita', '«O que tenho hoje?»'],
    },
  },
  ko: {
    eyebrow: '설정', title: 'WhatsApp 어시스턴트',
    lede: '팀이 WhatsApp으로 고객별 상황을 글이나 음성으로 알려 주면 어시스턴트가 CRM에 기록합니다. 매일 아침 누구에게 연락할지 알려 줍니다.',
    status: {
      hub: '팀은 모든 회사가 함께 쓰는 Cofundo 어시스턴트 번호로 씁니다.',
      tenant: '팀은 회사 WhatsApp 번호로 씁니다.',
      off: '아직 회사에서 켜져 있지 않습니다. 회사 WhatsApp 번호(유입 리드 → 리드에게 WhatsApp)나 Cofundo 공용 번호로 켭니다.',
      number: '어시스턴트 번호', unknown: 'Meta에서 번호를 읽지 못했습니다.', open: 'WhatsApp 열기',
    },
    how: {
      title: '이렇게 작동합니다',
      items: [
        '각자 내 계정에 휴대폰 번호를 넣습니다. 그렇게 사람을 알아봅니다.',
        '무슨 일이 있었는지 글이나 음성 메시지로 보냅니다.',
        '어시스턴트가 고객 기록에 남기고, 저장 전에 확인합니다.',
        '매일 아침 오늘 연락할 사람과 보낼 메시지를 제안합니다.',
      ],
    },
    chat: { me: 'Club Sol과 통화했어요. 금요일까지 제안서를 원해요', bot: 'Club Sol에 기록할게요: «금요일까지 제안서 요청». 다음 단계: 금요일에 제안서 보내기. 저장할까요?', yes: '네', saved: 'Club Sol에 저장했습니다.' },
    team: {
      title: '팀', lede: '내 계정에 전화번호가 없으면 어시스턴트가 그 사람을 알아보지 못합니다.',
      ready: '준비됨', missing: '전화번호 없음', count: (n: number, t: number) => `${t}명 중 ${n}명 전화번호 입력`, empty: '아직 팀원이 없습니다.',
      copyTitle: '팀에 보낼 메시지', copyHelp: '평소 쓰는 곳으로 보내세요.', copy: '복사', copied: '복사됨',
      message: (number: string, url: string) => `WhatsApp 어시스턴트 사용법:\n1. 내 계정에 휴대폰 번호를 넣으세요: ${url}\n2. ${number}로 고객별 상황을 글이나 음성으로 보내세요. CRM에 기록됩니다.`,
    },
    reminders: {
      title: '아침 알림', lede: '9:00부터 12:00 사이, 내 계정에서 켠 사람에게: 오늘 연락할 사람과, 원하면 제안 메시지.',
      platform: (t: string) => `템플릿(${t})은 Cofundo가 Meta에서 승인합니다. 할 일이 없습니다.`,
      own: (t: string) => `Meta에서 승인된 템플릿 ${t} 사용.`,
      missing: '먼저 메시지를 보내려면 Meta가 승인한 템플릿이 필요합니다. 유입 리드 → 리드에게 WhatsApp에서 넣습니다.',
    },
    card: {
      title: 'WhatsApp 어시스턴트', lede: '고객별 상황을 글이나 음성으로 알려 주면 CRM에 기록합니다.',
      writeTo: '보낼 번호', open: 'WhatsApp 열기', from: (p: string) => `이 휴대폰에서 보내세요: ${p}. 그렇게 알아봅니다.`,
      noPhone: '알아볼 수 있도록 위에 전화번호를 넣으세요.',
      same: '그 번호는 어시스턴트 번호입니다. 그 번호가 아닌 내 휴대폰에서 보내세요. 자기 자신에게는 메시지를 보낼 수 없습니다.',
      off: '회사에 아직 어시스턴트가 켜져 있지 않습니다.', tipsTitle: '이렇게 해 보세요',
      tips: ['«Club Sol과 통화했어요. 금요일까지 제안서를 원해요»', '방문 내용을 담은 음성 메시지', '«오늘 할 일은?»'],
    },
  },
});
