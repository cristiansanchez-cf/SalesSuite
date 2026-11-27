/**
 * «Tu CRM en marcha» (/admin/arranca) y su paso en la bienvenida (criterio de Cristian, 27-nov-2026: un admin nuevo
 * se tiró 20 minutos metiendo 2 o 3 leads uno a uno sin saber que podía subir un CSV, dictar, usar su IA o WhatsApp).
 */
import { defineMessages } from '../core';

const es = {
  title: 'Tu CRM en marcha',
  lede: 'No metas empresas una a una. Elige cómo lo tienes ahora y en unos minutos está dentro.',
  have: (n: number) => (n ? `Ya tienes ${n} ${n === 1 ? 'empresa' : 'empresas'} en el CRM.` : 'Tu CRM está vacío: empieza por aquí.'),
  bulkTitle: 'Lo que ya tienes, de golpe',
  dailyTitle: 'Cada día, sin teclear',
  aloneTitle: 'Que entren solos',
  ways: {
    csv: { t: 'Tengo un Excel o un CSV', d: 'Súbelo tal cual: lo exportado de tu CRM, de Excel o de Google Sheets. Reconocemos las columnas, lo revisas antes de meterlo y, si algo sale mal, lo deshaces con un clic.', go: 'Subir el archivo' },
    notion: { t: 'Lo tengo en Notion', d: 'Conecta tu base de datos y pasa empresas, personas y su historial con fecha.', go: 'Importar de Notion' },
    ai: { t: 'Lo tengo en Claude, ChatGPT o en una captura', d: 'Conecta tu IA y dile «mete esta lista en el CRM». La sube por tandas y tú la revisas antes de aplicarla.', go: 'Conectar mi IA' },
    notes: { t: 'Lo tengo en notas o en la cabeza', d: 'Pega tus notas o díctalas de un tirón, aunque hables de diez sitios: la IA separa cada empresa con su nota y su próximo paso.', go: 'Apuntar con IA' },
    whatsapp: { t: 'Mándale un audio por WhatsApp', d: 'Al salir de una visita, cuéntaselo al asistente en un audio o reenvíale los mensajes del cliente. Lo apunta en su empresa y te recuerda el próximo paso.', go: 'Abrir WhatsApp', setup: 'Pon tu móvil' },
    fab: { t: 'El botón «Apuntar»', d: 'Está en todas las pantallas, abajo a la derecha: escribe o dicta lo que ha pasado y la IA lo pone en su sitio.', go: 'Probarlo' },
    web: { t: 'Los leads de tu web', d: 'Conecta tu formulario: cada solicitud entra sola, se contesta al momento y la validas con un clic.', go: 'Conectar mi web' },
    waLeads: { t: 'WhatsApp con tus leads', d: 'Conecta tu WhatsApp Business: les escribes desde tu número y la conversación, audios incluidos, queda en su ficha.', go: 'Conectar WhatsApp' },
    team: { t: 'Tu equipo', d: 'Invítalos: cada uno apunta lo suyo por WhatsApp o con «Apuntar».', go: 'Invitar' },
  },
  always: 'Lo tienes siempre en Inicio y en el CRM.',
  // Paso de la bienvenida.
  step: { title: 'Mete lo que ya tienes, de golpe', lede: 'Nada de dar de alta una a una. Estas son las formas rápidas:', all: 'Ver todas las formas' },
  // Aviso en el CRM vacío y en Inicio.
  nudge: { title: '¿Ya tienes clientes en otro sitio?', body: 'Súbelos de golpe con un Excel, díctalos o pásaselos a tu IA: no hace falta meterlos uno a uno.', go: 'Ver cómo' },
};

export const getStartedMessages = defineMessages({
  es,
  en: {
    title: 'Your CRM up and running',
    lede: 'Do not add companies one by one. Pick how you have them now and they are in within minutes.',
    have: (n) => (n ? `You already have ${n} ${n === 1 ? 'company' : 'companies'} in the CRM.` : 'Your CRM is empty: start here.'),
    bulkTitle: 'What you already have, all at once',
    dailyTitle: 'Every day, without typing',
    aloneTitle: 'Let them come in on their own',
    ways: {
      csv: { t: 'I have an Excel or CSV file', d: 'Upload it as it is: exported from your CRM, Excel or Google Sheets. We recognise the columns, you review it before it goes in and, if something goes wrong, you undo it in one click.', go: 'Upload the file' },
      notion: { t: 'I have it in Notion', d: 'Connect your database and bring over companies, people and their dated history.', go: 'Import from Notion' },
      ai: { t: 'I have it in Claude, ChatGPT or a screenshot', d: 'Connect your AI and tell it «put this list in the CRM». It uploads it in batches and you review it before applying.', go: 'Connect my AI' },
      notes: { t: 'I have it in notes or in my head', d: 'Paste your notes or dictate them in one go, even about ten places: the AI splits each company with its note and next step.', go: 'Log with AI' },
      whatsapp: { t: 'Send a voice note on WhatsApp', d: 'After a visit, tell the assistant in a voice note or forward the client’s messages. It logs it on the company and reminds you of the next step.', go: 'Open WhatsApp', setup: 'Add your mobile' },
      fab: { t: 'The «Log» button', d: 'It is on every screen, bottom right: type or dictate what happened and the AI puts it in place.', go: 'Try it' },
      web: { t: 'Leads from your website', d: 'Connect your form: every request comes in on its own, gets an instant reply and you validate it in one click.', go: 'Connect my website' },
      waLeads: { t: 'WhatsApp with your leads', d: 'Connect your WhatsApp Business: you write from your number and the conversation, voice notes included, stays on their page.', go: 'Connect WhatsApp' },
      team: { t: 'Your team', d: 'Invite them: each person logs their own by WhatsApp or with «Log».', go: 'Invite' },
    },
    always: 'It is always in Home and in the CRM.',
    step: { title: 'Bring in what you already have, all at once', lede: 'No adding them one by one. These are the fast ways:', all: 'See all the ways' },
    nudge: { title: 'Already have clients somewhere else?', body: 'Upload them at once with an Excel file, dictate them or hand them to your AI: no need to add them one by one.', go: 'See how' },
  },
  pt: {
    title: 'O seu CRM a funcionar',
    lede: 'Não meta empresas uma a uma. Escolha como as tem agora e em poucos minutos estão dentro.',
    have: (n) => (n ? `Já tem ${n} ${n === 1 ? 'empresa' : 'empresas'} no CRM.` : 'O seu CRM está vazio: comece por aqui.'),
    bulkTitle: 'O que já tem, de uma vez',
    dailyTitle: 'Todos os dias, sem escrever',
    aloneTitle: 'Que entrem sozinhos',
    ways: {
      csv: { t: 'Tenho um Excel ou CSV', d: 'Carregue-o tal como está: exportado do seu CRM, do Excel ou do Google Sheets. Reconhecemos as colunas, revê antes de entrar e, se algo correr mal, desfaz com um clique.', go: 'Carregar o ficheiro' },
      notion: { t: 'Tenho no Notion', d: 'Ligue a sua base de dados e passe empresas, pessoas e o histórico com data.', go: 'Importar do Notion' },
      ai: { t: 'Tenho no Claude, ChatGPT ou numa captura', d: 'Ligue a sua IA e diga «mete esta lista no CRM». Carrega por partes e revê antes de aplicar.', go: 'Ligar a minha IA' },
      notes: { t: 'Tenho em notas ou na cabeça', d: 'Cole as notas ou dite-as de seguida, mesmo sobre dez sítios: a IA separa cada empresa com a nota e o próximo passo.', go: 'Registar com IA' },
      whatsapp: { t: 'Mande um áudio por WhatsApp', d: 'Ao sair de uma visita, conte ao assistente num áudio ou reencaminhe as mensagens do cliente. Regista na empresa e lembra o próximo passo.', go: 'Abrir WhatsApp', setup: 'Indique o seu telemóvel' },
      fab: { t: 'O botão «Registar»', d: 'Está em todos os ecrãs, em baixo à direita: escreva ou dite o que aconteceu e a IA põe no sítio.', go: 'Experimentar' },
      web: { t: 'Os leads do seu site', d: 'Ligue o formulário: cada pedido entra sozinho, recebe resposta logo e valida com um clique.', go: 'Ligar o meu site' },
      waLeads: { t: 'WhatsApp com os seus leads', d: 'Ligue o seu WhatsApp Business: escreve do seu número e a conversa, áudios incluídos, fica na ficha.', go: 'Ligar WhatsApp' },
      team: { t: 'A sua equipa', d: 'Convide-os: cada um regista o seu por WhatsApp ou com «Registar».', go: 'Convidar' },
    },
    always: 'Está sempre no Início e no CRM.',
    step: { title: 'Meta o que já tem, de uma vez', lede: 'Nada de criar uma a uma. Estas são as formas rápidas:', all: 'Ver todas as formas' },
    nudge: { title: 'Já tem clientes noutro sítio?', body: 'Carregue-os de uma vez com um Excel, dite-os ou passe-os à sua IA: não é preciso metê-los um a um.', go: 'Ver como' },
  },
  ko: {
    title: 'CRM 시작하기',
    lede: '회사를 하나씩 입력하지 마세요. 지금 가진 방식을 고르면 몇 분 안에 들어갑니다.',
    have: (n) => (n ? `CRM에 이미 ${n}개 회사가 있습니다.` : 'CRM이 비어 있습니다: 여기서 시작하세요.'),
    bulkTitle: '이미 가진 것을 한 번에',
    dailyTitle: '매일, 타이핑 없이',
    aloneTitle: '저절로 들어오게',
    ways: {
      csv: { t: 'Excel이나 CSV가 있어요', d: 'CRM, Excel, Google Sheets에서 내보낸 그대로 올리세요. 열을 인식하고, 넣기 전에 확인하며, 잘못되면 한 번에 되돌립니다.', go: '파일 올리기' },
      notion: { t: 'Notion에 있어요', d: '데이터베이스를 연결해 회사, 사람, 날짜별 기록을 옮기세요.', go: 'Notion에서 가져오기' },
      ai: { t: 'Claude, ChatGPT나 캡처에 있어요', d: 'AI를 연결하고 «이 목록을 CRM에 넣어 줘»라고 하세요. 나눠서 올리고 적용 전에 확인합니다.', go: '내 AI 연결' },
      notes: { t: '메모나 머릿속에 있어요', d: '메모를 붙여 넣거나 한 번에 말하세요. 열 곳 이야기라도 AI가 회사별 메모와 다음 단계로 나눕니다.', go: 'AI로 기록' },
      whatsapp: { t: 'WhatsApp으로 음성 메시지 보내기', d: '방문 후 도우미에게 음성으로 말하거나 고객 메시지를 전달하세요. 회사에 기록하고 다음 단계를 알려 줍니다.', go: 'WhatsApp 열기', setup: '휴대폰 번호 입력' },
      fab: { t: '«기록» 버튼', d: '모든 화면 오른쪽 아래에 있습니다. 있었던 일을 쓰거나 말하면 AI가 정리합니다.', go: '써 보기' },
      web: { t: '웹사이트 리드', d: '양식을 연결하세요. 요청이 저절로 들어오고 바로 답장하며, 한 번에 확인합니다.', go: '웹사이트 연결' },
      waLeads: { t: '리드와 WhatsApp', d: 'WhatsApp Business를 연결하면 내 번호로 대화하고, 음성 메시지까지 대화가 페이지에 남습니다.', go: 'WhatsApp 연결' },
      team: { t: '팀', d: '초대하세요. 각자 WhatsApp이나 «기록»으로 자기 것을 기록합니다.', go: '초대' },
    },
    always: '홈과 CRM에서 언제든 볼 수 있습니다.',
    step: { title: '이미 가진 것을 한 번에 넣으세요', lede: '하나씩 만들 필요 없습니다. 빠른 방법들:', all: '모든 방법 보기' },
    nudge: { title: '다른 곳에 고객이 이미 있나요?', body: 'Excel로 한 번에 올리거나, 말하거나, AI에 넘기세요. 하나씩 넣을 필요 없습니다.', go: '방법 보기' },
  },
});
