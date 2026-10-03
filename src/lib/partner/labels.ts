import type { PricePolicy } from '../admin/types';
import { defineMessages } from '../i18n/core';

/** Etiquetas de política de precio (cliente y servidor), en los cuatro idiomas de la consola. */
export const PRICE_POLICY_LABELS = defineMessages<Record<PricePolicy, string>>({
  es: { hidden: 'Sin precios (los gestiona la empresa)', list: 'Precio de tarifa', adjusted: 'Precio especial' },
  en: { hidden: 'No prices (the company handles them)', list: 'List price', adjusted: 'Special price' },
  pt: { hidden: 'Sem preços (a empresa cuida deles)', list: 'Preço de tabela', adjusted: 'Preço especial' },
  ko: { hidden: '가격 없음 (회사가 관리)', list: '정가', adjusted: '특별 가격' },
});

export const PRICE_POLICY_HELPS = defineMessages<Record<PricePolicy, string>>({
  es: {
    hidden: 'La propuesta se envía sin precios: el colaborador presenta y la empresa negocia.',
    list: 'Cada módulo muestra su precio de catálogo.',
    adjusted: 'Precio de catálogo con un ajuste (descuento o recargo) solo para esta cuenta. El colaborador no ve la tarifa.',
  },
  en: {
    hidden: 'The proposal is sent without prices: the partner presents and the company negotiates.',
    list: 'Each module shows its catalog price.',
    adjusted: 'Catalog price with an adjustment (discount or surcharge) for this account only. The partner does not see the price list.',
  },
  pt: {
    hidden: 'A proposta é enviada sem preços: o parceiro apresenta e a empresa negocia.',
    list: 'Cada módulo mostra seu preço de catálogo.',
    adjusted: 'Preço de catálogo com um ajuste (desconto ou acréscimo) só para esta conta. O parceiro não vê a tabela.',
  },
  ko: {
    hidden: '가격 없이 제안서를 보냅니다. 파트너가 소개하고 회사가 협상합니다.',
    list: '각 모듈에 카탈로그 가격이 표시됩니다.',
    adjusted: '이 계정에만 카탈로그 가격을 조정(할인 또는 할증)해 적용합니다. 파트너는 정가를 볼 수 없습니다.',
  },
});

/** Español (compatibilidad con quien aún importa las etiquetas sin idioma). */
export const PRICE_POLICY_LABEL: Record<PricePolicy, string> = PRICE_POLICY_LABELS.es;
export const PRICE_POLICY_HELP: Record<PricePolicy, string> = PRICE_POLICY_HELPS.es;
