/**
 * Puntos de partida del asistente de configuración. Son DATOS de ejemplo, no reglas: el CEO o líder
 * los aplica (solo se añade lo que falta) y luego los adapta a su negocio. La plataforma no depende de ellos.
 */
import type { PersonaRole } from '../playbook/market';
import type { IconName } from '../ui/icons';

export interface PresetFacet {
  key: string; label: string; question: string; icon: IconName; scope: 'account' | 'contact'; multi: boolean; weight: number;
  options: Array<{ label: string; icon?: IconName; hint?: string }>;
}
export interface PresetPersona { key: string; name: string; role: PersonaRole; canBlock?: string; canHelp?: string; goals?: string }
export interface PresetSegment { key: string; name: string; icon: IconName; description: string; personas: PresetPersona[] }
export interface Preset { key: string; name: string; icon: IconName; pitch: string; segments: PresetSegment[]; facets: PresetFacet[] }

/** Tipo de personalidad (estilos sociales): útil en casi cualquier venta consultiva. */
export const PERSONALITY: PresetFacet = {
  key: 'personalidad', label: 'Tipo de personalidad', question: '¿Cómo es la persona con la que hablas?', icon: 'smile', scope: 'contact', multi: false, weight: 2,
  options: [
    { label: 'Analítico', icon: 'chart-column', hint: 'Quiere datos, pruebas y detalle. Dale tiempo y números.' },
    { label: 'Directo', icon: 'zap', hint: 'Va al resultado. Sé breve y ve al grano.' },
    { label: 'Expresivo', icon: 'sparkles', hint: 'Se mueve por la idea y la emoción. Cuéntale la experiencia.' },
    { label: 'Afable', icon: 'heart-handshake', hint: 'Valora la relación y la confianza. No le presiones.' },
  ],
};

export const PRESETS: Preset[] = [
  {
    key: 'ocio', name: 'Ocio nocturno y eventos', icon: 'music',
    pitch: 'Locales, promotoras, conciertos y festivales (bodas, después). Actores típicos: dueño o gerente, responsable de sala, DJ, RRPP, marcas patrocinadoras.',
    segments: [
      { key: 'ocio-nocturno', name: 'Locales de ocio nocturno', icon: 'music', description: 'Discotecas, salas y bares de copas.', personas: [
        { key: 'propietario-local', name: 'Dueño o gerente del local', role: 'decisor', goals: 'Más caja por noche y fidelizar al público.' },
        { key: 'responsable-sala', name: 'Responsable de sala', role: 'influenciador', canBlock: 'Si le complica la operativa de la noche, lo frena.' },
        { key: 'dj-residente', name: 'DJ residente', role: 'guardian', canBlock: 'Puede tumbar las peticiones de canciones si siente que le quitan el control de la sesión.', canHelp: 'Si lo ve como suyo, lo anima en cabina.' },
        { key: 'camareros', name: 'Camareros', role: 'usuario', canBlock: 'Si les da trabajo extra, no lo empujan.' },
      ] },
      { key: 'festivales', name: 'Festivales', icon: 'party-popper', description: 'Promotoras y patrocinadores.', personas: [
        { key: 'director-festival', name: 'Director/a del festival', role: 'decisor' },
        { key: 'produccion-tecnica', name: 'Producción técnica', role: 'guardian', canBlock: 'Si no hay pantalla o conectividad garantizada, lo veta.' },
      ] },
      { key: 'bodas', name: 'Bodas', icon: 'heart', description: 'Fincas y novios.', personas: [
        { key: 'novios', name: 'Novios', role: 'decisor' },
        { key: 'coordinadora-finca', name: 'Coordinador/a de la finca', role: 'guardian', canBlock: 'Si no encaja con el timing del evento, lo desaconseja.' },
      ] },
    ],
    facets: [
      PERSONALITY,
      { key: 'rasgos-local', label: 'Cómo es el sitio', question: '¿Qué tiene la cuenta?', icon: 'store', scope: 'account', multi: true, weight: 1,
        options: [{ label: 'Tiene pantalla', icon: 'monitor' }, { label: 'DJ residente', icon: 'music' }, { label: 'Aforo de más de 500', icon: 'users' }] },
    ],
  },
  {
    key: 'buceo', name: 'Turismo activo y buceo', icon: 'waves',
    pitch: 'Centros de buceo, hoteles con centro propio y cadenas. Actores típicos: director del centro, instructores (también autónomos), buceadores, recepción.',
    segments: [
      { key: 'centros-buceo', name: 'Centros de buceo', icon: 'waves', description: 'Centros independientes.', personas: [
        { key: 'director-centro', name: 'Director/a o dueño del centro', role: 'decisor' },
        { key: 'instructor', name: 'Instructor/a', role: 'guardian', canBlock: 'Puede tumbar el servicio si le resulta laborioso en el día a día (p. ej. el QR en cada inmersión).', canHelp: 'Si le ahorra trabajo, lo recomienda a sus buceadores.' },
        { key: 'instructor-autonomo', name: 'Instructor/a autónomo (va de centro en centro)', role: 'influenciador', canHelp: 'Puede abrirte varios centros a la vez.' },
        { key: 'buceadores', name: 'Buceadores', role: 'usuario' },
      ] },
      { key: 'hoteles-buceo', name: 'Hoteles y posadas con centro de buceo', icon: 'hotel', description: 'Alojamiento con buceo incluido.', personas: [
        { key: 'director-hotel', name: 'Director/a del hotel', role: 'decisor' },
        { key: 'recepcion', name: 'Recepción', role: 'usuario', canBlock: 'Si no sabe explicarlo al huésped, no se usa.' },
      ] },
      { key: 'cadenas-buceo', name: 'Cadenas de centros', icon: 'anchor', description: 'Varios centros con una dirección común.', personas: [
        { key: 'responsable-cadena', name: 'Responsable de la cadena', role: 'pagador' },
      ] },
    ],
    facets: [
      PERSONALITY,
      { key: 'tipo-experiencia', label: 'Tipo de experiencia', question: '¿Qué experiencia ofrece el centro?', icon: 'compass', scope: 'account', multi: true, weight: 1,
        options: [{ label: 'Familiar' }, { label: 'Para instructores' }, { label: 'Técnico' }, { label: 'Turismo de paso' }] },
      { key: 'region', label: 'Región', question: '¿En qué región está la cuenta?', icon: 'map-pin', scope: 'account', multi: false, weight: 2,
        options: [{ label: 'Brasil' }, { label: 'Corea' }] },
    ],
  },
];

/** Iconos que se ofrecen para sectores (selector del asistente). */
export const SEGMENT_ICONS: IconName[] = ['store', 'music', 'heart', 'mic', 'party-popper', 'waves', 'hotel', 'anchor', 'briefcase', 'building2', 'utensils', 'ticket', 'mountain', 'ship', 'wine', 'gift'];

export const ROLE_ICON: Record<PersonaRole, IconName> = {
  decisor: 'crown', pagador: 'wallet', influenciador: 'megaphone', campeon: 'heart-handshake', usuario: 'user', guardian: 'shield-alert',
};

/** Los puntos de partida en inglés, portugués y coreano (español → [en, pt, ko]). Se guardan en el idioma de quien los aplica. */
const TEXT: Record<string, [string, string, string]> = {
  'Tipo de personalidad': ['Personality type', 'Tipo de personalidade', '성격 유형'],
  '¿Cómo es la persona con la que hablas?': ['What is the person you\'re talking to like?', 'Como é a pessoa com quem você fala?', '대화 상대는 어떤 사람인가요?'],
  'Analítico': ['Analytical', 'Analítico', '분석형'],
  'Quiere datos, pruebas y detalle. Dale tiempo y números.': ['Wants data, proof and detail. Give them time and numbers.', 'Quer dados, provas e detalhes. Dê tempo e números.', '데이터, 근거, 세부 정보를 원합니다. 시간과 숫자를 주세요.'],
  'Directo': ['Driver', 'Direto', '주도형'],
  'Va al resultado. Sé breve y ve al grano.': ['Goes for results. Be brief and get to the point.', 'Vai ao resultado. Seja breve e direto.', '결과를 중시합니다. 짧게 핵심만 말하세요.'],
  'Expresivo': ['Expressive', 'Expressivo', '표현형'],
  'Se mueve por la idea y la emoción. Cuéntale la experiencia.': ['Moved by the idea and the emotion. Tell them about the experience.', 'Move-se pela ideia e pela emoção. Conte a experiência.', '아이디어와 감정에 움직입니다. 경험을 이야기하세요.'],
  'Afable': ['Amiable', 'Afável', '친화형'],
  'Valora la relación y la confianza. No le presiones.': ['Values the relationship and trust. Don\'t push.', 'Valoriza a relação e a confiança. Não pressione.', '관계와 신뢰를 중시합니다. 압박하지 마세요.'],

  'Ocio nocturno y eventos': ['Nightlife and events', 'Vida noturna e eventos', '나이트라이프 및 이벤트'],
  'Locales, promotoras, conciertos y festivales (bodas, después). Actores típicos: dueño o gerente, responsable de sala, DJ, RRPP, marcas patrocinadoras.': [
    'Venues, promoters, concerts and festivals (weddings later). Typical stakeholders: owner or manager, floor manager, DJ, PR, sponsor brands.',
    'Casas noturnas, promotoras, shows e festivais (casamentos, depois). Atores típicos: dono ou gerente, responsável de salão, DJ, RP, marcas patrocinadoras.',
    '매장, 프로모터, 콘서트, 페스티벌 (웨딩은 이후). 주요 이해관계자: 대표 또는 매니저, 홀 책임자, DJ, 홍보 담당, 후원 브랜드.'],
  'Locales de ocio nocturno': ['Nightlife venues', 'Casas noturnas', '나이트라이프 매장'],
  'Discotecas, salas y bares de copas.': ['Clubs, music venues and cocktail bars.', 'Discotecas, casas de show e bares.', '클럽, 공연장, 칵테일 바.'],
  'Dueño o gerente del local': ['Venue owner or manager', 'Dono ou gerente da casa', '매장 대표 또는 매니저'],
  'Más caja por noche y fidelizar al público.': ['More revenue per night and a loyal crowd.', 'Mais faturamento por noite e público fiel.', '하룻밤 매출 증가와 단골 고객 확보.'],
  'Responsable de sala': ['Floor manager', 'Responsável de salão', '홀 책임자'],
  'Si le complica la operativa de la noche, lo frena.': ['If it complicates the night\'s operations, they\'ll stop it.', 'Se complicar a operação da noite, ele trava.', '밤 운영이 복잡해지면 막습니다.'],
  'DJ residente': ['Resident DJ', 'DJ residente', '상주 DJ'],
  'Puede tumbar las peticiones de canciones si siente que le quitan el control de la sesión.': ['Can kill song requests if they feel they lose control of the set.', 'Pode derrubar os pedidos de música se sentir que perde o controle da sessão.', '세트 통제권을 잃는다고 느끼면 신청곡 기능을 막을 수 있습니다.'],
  'Si lo ve como suyo, lo anima en cabina.': ['If they feel it\'s theirs, they hype it from the booth.', 'Se sentir que é dele, anima na cabine.', '자기 것으로 느끼면 부스에서 분위기를 띄웁니다.'],
  'Camareros': ['Bar staff', 'Garçons', '바 직원'],
  'Si les da trabajo extra, no lo empujan.': ['If it means extra work, they won\'t push it.', 'Se der trabalho extra, não incentivam.', '일이 늘어나면 적극적으로 권하지 않습니다.'],
  'Festivales': ['Festivals', 'Festivais', '페스티벌'],
  'Promotoras y patrocinadores.': ['Promoters and sponsors.', 'Promotoras e patrocinadores.', '프로모터와 후원사.'],
  'Director/a del festival': ['Festival director', 'Diretor(a) do festival', '페스티벌 감독'],
  'Producción técnica': ['Technical production', 'Produção técnica', '기술 제작팀'],
  'Si no hay pantalla o conectividad garantizada, lo veta.': ['Without a guaranteed screen or connectivity, they veto it.', 'Sem tela ou conectividade garantida, veta.', '스크린이나 연결이 보장되지 않으면 거부합니다.'],
  'Bodas': ['Weddings', 'Casamentos', '웨딩'],
  'Fincas y novios.': ['Venues and couples.', 'Espaços de eventos e noivos.', '웨딩 장소와 예비부부.'],
  'Novios': ['The couple', 'Noivos', '예비부부'],
  'Coordinador/a de la finca': ['Venue coordinator', 'Coordenador(a) do espaço', '웨딩 장소 코디네이터'],
  'Si no encaja con el timing del evento, lo desaconseja.': ['If it doesn\'t fit the event timing, they advise against it.', 'Se não encaixar no cronograma do evento, desaconselha.', '행사 일정에 맞지 않으면 반대합니다.'],
  'Cómo es el sitio': ['What the place is like', 'Como é o lugar', '장소의 특징'],
  '¿Qué tiene la cuenta?': ['What does the account have?', 'O que a conta tem?', '이 계정에는 무엇이 있나요?'],
  'Tiene pantalla': ['Has a screen', 'Tem tela', '스크린 있음'],
  'Aforo de más de 500': ['Capacity over 500', 'Capacidade acima de 500', '수용 인원 500명 이상'],

  'Turismo activo y buceo': ['Adventure tourism and diving', 'Turismo de aventura e mergulho', '액티비티 관광 및 다이빙'],
  'Centros de buceo, hoteles con centro propio y cadenas. Actores típicos: director del centro, instructores (también autónomos), buceadores, recepción.': [
    'Dive centres, hotels with their own centre, and chains. Typical stakeholders: centre director, instructors (including freelancers), divers, front desk.',
    'Centros de mergulho, hotéis com centro próprio e redes. Atores típicos: diretor do centro, instrutores (também autônomos), mergulhadores, recepção.',
    '다이빙 센터, 자체 센터가 있는 호텔, 체인. 주요 이해관계자: 센터장, 강사(프리랜서 포함), 다이버, 프런트.'],
  'Centros de buceo': ['Dive centres', 'Centros de mergulho', '다이빙 센터'],
  'Centros independientes.': ['Independent centres.', 'Centros independentes.', '독립 센터.'],
  'Director/a o dueño del centro': ['Centre director or owner', 'Diretor(a) ou dono do centro', '센터장 또는 대표'],
  'Instructor/a': ['Instructor', 'Instrutor(a)', '강사'],
  'Puede tumbar el servicio si le resulta laborioso en el día a día (p. ej. el QR en cada inmersión).': ['Can kill the service if it\'s a hassle day to day (e.g. the QR on every dive).', 'Pode derrubar o serviço se for trabalhoso no dia a dia (ex.: o QR em cada mergulho).', '일상 업무에 번거로우면 서비스를 막을 수 있습니다 (예: 다이빙마다 QR).'],
  'Si le ahorra trabajo, lo recomienda a sus buceadores.': ['If it saves them work, they recommend it to their divers.', 'Se economizar trabalho, recomenda aos seus mergulhadores.', '일이 줄어들면 다이버들에게 추천합니다.'],
  'Instructor/a autónomo (va de centro en centro)': ['Freelance instructor (moves between centres)', 'Instrutor(a) autônomo (vai de centro em centro)', '프리랜서 강사 (여러 센터를 오감)'],
  'Puede abrirte varios centros a la vez.': ['Can open several centres for you at once.', 'Pode abrir vários centros de uma vez.', '여러 센터를 한 번에 소개해 줄 수 있습니다.'],
  'Buceadores': ['Divers', 'Mergulhadores', '다이버'],
  'Hoteles y posadas con centro de buceo': ['Hotels and inns with a dive centre', 'Hotéis e pousadas com centro de mergulho', '다이빙 센터가 있는 호텔 및 숙소'],
  'Alojamiento con buceo incluido.': ['Accommodation with diving included.', 'Hospedagem com mergulho incluído.', '다이빙이 포함된 숙박.'],
  'Director/a del hotel': ['Hotel director', 'Diretor(a) do hotel', '호텔 총지배인'],
  'Recepción': ['Front desk', 'Recepção', '프런트'],
  'Si no sabe explicarlo al huésped, no se usa.': ['If they can\'t explain it to the guest, it won\'t get used.', 'Se não souber explicar ao hóspede, não é usado.', '투숙객에게 설명하지 못하면 쓰이지 않습니다.'],
  'Cadenas de centros': ['Dive centre chains', 'Redes de centros', '센터 체인'],
  'Varios centros con una dirección común.': ['Several centres under one management.', 'Vários centros com uma direção comum.', '공동 경영의 여러 센터.'],
  'Responsable de la cadena': ['Chain manager', 'Responsável pela rede', '체인 책임자'],
  'Tipo de experiencia': ['Type of experience', 'Tipo de experiência', '경험 유형'],
  '¿Qué experiencia ofrece el centro?': ['What experience does the centre offer?', 'Que experiência o centro oferece?', '센터는 어떤 경험을 제공하나요?'],
  'Familiar': ['Family', 'Familiar', '가족'],
  'Para instructores': ['For instructors', 'Para instrutores', '강사용'],
  'Técnico': ['Technical', 'Técnico', '테크니컬'],
  'Turismo de paso': ['Passing tourists', 'Turismo de passagem', '단기 관광객'],
  'Región': ['Region', 'Região', '지역'],
  '¿En qué región está la cuenta?': ['Which region is the account in?', 'Em que região está a conta?', '계정은 어느 지역에 있나요?'],
  'Brasil': ['Brazil', 'Brasil', '브라질'],
  'Corea': ['Korea', 'Coreia', '한국'],
};

const IDX = { en: 0, pt: 1, ko: 2 } as const;
const FIELDS = new Set(['name', 'pitch', 'description', 'canBlock', 'canHelp', 'goals', 'label', 'question', 'hint']);

/** El punto de partida en ese idioma. Las claves no cambian (las de las opciones salen del español al aplicarlo). */
export function localizePreset<T>(x: T, locale: 'es' | 'en' | 'pt' | 'ko'): T {
  if (locale === 'es') return x;
  const walk = (v: unknown, field?: string): unknown => {
    if (typeof v === 'string') return field && FIELDS.has(field) ? TEXT[v]?.[IDX[locale]] ?? v : v;
    if (Array.isArray(v)) return v.map((y) => walk(y, field));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, walk(y, k)]));
    return v;
  };
  return walk(x) as T;
}

/** Para los tests: los textos de los puntos de partida sin traducir. */
export function untranslatedPresetTexts(): string[] {
  const out: string[] = [];
  const walk = (v: unknown, field?: string) => {
    if (typeof v === 'string') { if (field && FIELDS.has(field) && !TEXT[v]) out.push(v); }
    else if (Array.isArray(v)) v.forEach((y) => walk(y, field));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, y]) => walk(y, k));
  };
  walk(PRESETS);
  return out;
}
