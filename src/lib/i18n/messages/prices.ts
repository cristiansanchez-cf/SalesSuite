/** Tarifas y enlaces de pago (/admin/prices): lo que el comercial puede elegir como precio. */
import { defineMessages } from '../core';

const es = {
  title: 'Tarifas y pagos', eyebrow: 'Configurar',
  lede: 'El precio lo pones tú: el equipo elige una de estas tarifas en cada propuesta, y el descuento, con un cupón.',
  empty: 'Todavía no hay tarifas. Crea la primera: el equipo podrá elegirla en sus propuestas.',
  newTitle: 'Nueva tarifa', label: 'Nombre', labelPlaceholder: 'Local mediano', amount: 'Importe (sin IVA)', currency: 'Moneda',
  period: 'Cómo se cobra', periods: { once: 'Pago único', event: 'Por evento', month: 'Al mes', year: 'Al año' } as Record<string, string>,
  link: 'Enlace de pago de Stripe', linkHelp: 'El Payment Link de Stripe. Le añadimos la propuesta (para saber quién lo vendió) y el cupón.',
  segment: 'Sector', anySegment: 'Todos los sectores', create: 'Crear tarifa',
  active: 'Activa', inactive: 'Desactivada', activate: 'Activar', deactivate: 'Desactivar', noLink: 'Sin enlace de pago',
  couponsHint: 'Los descuentos son cupones: créalos en Comisiones → Cupones con el mismo código que en Stripe.', coupons: 'Ir a cupones',
  stripe: {
    title: 'Pagos y comisiones automáticas', on: (d: string) => `Conectado desde el ${d}. Cada pago desde una propuesta cuenta solo para la comisión de quien la vendió.`,
    off: 'Sin conectar: los pagos no llegan a comisiones. Tres pasos en tu Stripe:',
    step1: 'Desarrolladores → Webhooks → «Añadir destino». URL:', step2: 'Eventos:', step3: 'Copia el «Secreto de firma» (whsec_…) y pégalo aquí.',
    secret: 'Secreto de firma', save: 'Conectar', change: 'Cambiar secreto', disconnect: 'Desconectar', copy: 'Copiar',
  },
  ok: { stripe: 'Stripe conectado.', nostripe: 'Stripe desconectado.', created: 'Tarifa creada.', on: 'Tarifa activada.', off: 'Tarifa desactivada.' } as Record<string, string>,
};

export const pricesMessages = defineMessages({
  es,
  en: {
    title: 'Pricing and payments', eyebrow: 'Configure',
    lede: 'You set the price: the team picks one of these options in each proposal, and discounts come as coupons.',
    empty: 'No price options yet. Create the first one so the team can pick it in proposals.',
    newTitle: 'New price option', label: 'Name', labelPlaceholder: 'Medium venue', amount: 'Amount (excl. VAT)', currency: 'Currency',
    period: 'How it is charged', periods: { once: 'One-off', event: 'Per event', month: 'Monthly', year: 'Yearly' },
    link: 'Stripe payment link', linkHelp: 'The Stripe Payment Link. We add the proposal (to know who sold it) and the coupon.',
    segment: 'Sector', anySegment: 'All sectors', create: 'Create price option',
    active: 'Active', inactive: 'Off', activate: 'Turn on', deactivate: 'Turn off', noLink: 'No payment link',
    couponsHint: 'Discounts are coupons: create them in Commissions → Coupons with the same code as in Stripe.', coupons: 'Go to coupons',
    stripe: {
      title: 'Payments and automatic commissions', on: (d) => `Connected since ${d}. Every payment from a proposal counts toward the commission of whoever sold it.`,
      off: 'Not connected: payments do not reach commissions. Three steps in your Stripe:',
      step1: 'Developers → Webhooks → “Add destination”. URL:', step2: 'Events:', step3: 'Copy the “Signing secret” (whsec_…) and paste it here.',
      secret: 'Signing secret', save: 'Connect', change: 'Change secret', disconnect: 'Disconnect', copy: 'Copy',
    },
    ok: { stripe: 'Stripe connected.', nostripe: 'Stripe disconnected.', created: 'Price option created.', on: 'Price option on.', off: 'Price option off.' },
  },
  pt: {
    title: 'Tarifas e pagamentos', eyebrow: 'Configurar',
    lede: 'O preço é você quem define: a equipe escolhe uma destas tarifas em cada proposta, e o desconto, com um cupom.',
    empty: 'Ainda não há tarifas. Crie a primeira para a equipe escolher nas propostas.',
    newTitle: 'Nova tarifa', label: 'Nome', labelPlaceholder: 'Casa média', amount: 'Valor (sem IVA)', currency: 'Moeda',
    period: 'Como se cobra', periods: { once: 'Pagamento único', event: 'Por evento', month: 'Mensal', year: 'Anual' },
    link: 'Link de pagamento da Stripe', linkHelp: 'O Payment Link da Stripe. Adicionamos a proposta (para saber quem vendeu) e o cupom.',
    segment: 'Setor', anySegment: 'Todos os setores', create: 'Criar tarifa',
    active: 'Ativa', inactive: 'Desativada', activate: 'Ativar', deactivate: 'Desativar', noLink: 'Sem link de pagamento',
    couponsHint: 'Os descontos são cupons: crie-os em Comissões → Cupons com o mesmo código da Stripe.', coupons: 'Ir para cupons',
    stripe: {
      title: 'Pagamentos e comissões automáticas', on: (d) => `Conectado desde ${d}. Cada pagamento de uma proposta conta para a comissão de quem a vendeu.`,
      off: 'Não conectado: os pagamentos não chegam às comissões. Três passos na sua Stripe:',
      step1: 'Desenvolvedores → Webhooks → «Adicionar destino». URL:', step2: 'Eventos:', step3: 'Copie o «Segredo de assinatura» (whsec_…) e cole aqui.',
      secret: 'Segredo de assinatura', save: 'Conectar', change: 'Trocar segredo', disconnect: 'Desconectar', copy: 'Copiar',
    },
    ok: { stripe: 'Stripe conectada.', nostripe: 'Stripe desconectada.', created: 'Tarifa criada.', on: 'Tarifa ativada.', off: 'Tarifa desativada.' },
  },
  ko: {
    title: '요금과 결제', eyebrow: '설정',
    lede: '가격은 직접 정하세요. 팀은 제안서마다 이 요금 중 하나를 고르고, 할인은 쿠폰으로 적용합니다.',
    empty: '아직 요금이 없어요. 첫 요금을 만들면 팀이 제안서에서 고를 수 있어요.',
    newTitle: '새 요금', label: '이름', labelPlaceholder: '중형 매장', amount: '금액(부가세 제외)', currency: '통화',
    period: '청구 방식', periods: { once: '일시불', event: '이벤트당', month: '월간', year: '연간' },
    link: 'Stripe 결제 링크', linkHelp: 'Stripe Payment Link입니다. 판매자를 알 수 있도록 제안서와 쿠폰을 붙입니다.',
    segment: '업종', anySegment: '모든 업종', create: '요금 만들기',
    active: '사용 중', inactive: '꺼짐', activate: '켜기', deactivate: '끄기', noLink: '결제 링크 없음',
    couponsHint: '할인은 쿠폰입니다. 커미션 → 쿠폰에서 Stripe와 같은 코드로 만드세요.', coupons: '쿠폰으로 가기',
    stripe: {
      title: '결제와 자동 커미션', on: (d) => `${d}부터 연결됨. 제안서에서 들어온 결제는 판매한 사람의 커미션으로 계산됩니다.`,
      off: '연결 안 됨: 결제가 커미션에 반영되지 않아요. Stripe에서 세 단계:',
      step1: '개발자 → Webhooks → “대상 추가”. URL:', step2: '이벤트:', step3: '“서명 비밀”(whsec_…)을 복사해 여기에 붙여 넣으세요.',
      secret: '서명 비밀', save: '연결', change: '비밀 바꾸기', disconnect: '연결 해제', copy: '복사',
    },
    ok: { stripe: 'Stripe를 연결했어요.', nostripe: 'Stripe 연결을 해제했어요.', created: '요금을 만들었어요.', on: '요금을 켰어요.', off: '요금을 껐어요.' },
  },
});
