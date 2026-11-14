// Campos de SEO local da vitrine (tipo de negócio e área atendida).
// Módulo puro, sem dependências: roda no Worker, no Node (testes) e no painel.
// Endereço e horário vêm de business-hours.mjs; aqui ficam só os campos que faltam.

/** Lista fechada de tipos do schema.org (subtipos de LocalBusiness), com rótulo do painel. */
export const LOCAL_BUSINESS_TYPES = Object.freeze([
  { value: 'LocalBusiness', label: 'Negócio local (geral)' },
  { value: 'Restaurant', label: 'Restaurante ou pizzaria' },
  { value: 'FoodEstablishment', label: 'Comida e bebida (lanches, marmitas, delivery)' },
  { value: 'Bakery', label: 'Padaria ou confeitaria' },
  { value: 'CafeOrCoffeeShop', label: 'Café ou cafeteria' },
  { value: 'BarOrPub', label: 'Bar' },
  { value: 'IceCreamShop', label: 'Sorveteria' },
  { value: 'Store', label: 'Loja' },
  { value: 'ClothingStore', label: 'Loja de roupas e acessórios' },
  { value: 'Florist', label: 'Floricultura' },
  { value: 'PetStore', label: 'Pet shop' },
  { value: 'BeautySalon', label: 'Salão de beleza, estética ou barbearia' },
  { value: 'HealthAndBeautyBusiness', label: 'Bem-estar e cuidados pessoais' },
  { value: 'MedicalBusiness', label: 'Saúde (consultório, clínica, terapia)' },
  { value: 'ProfessionalService', label: 'Serviço profissional (fotografia, design, consultoria)' },
  { value: 'HomeAndConstructionBusiness', label: 'Casa, reformas e manutenção' },
  { value: 'AutomotiveBusiness', label: 'Automotivo' },
  { value: 'SportsActivityLocation', label: 'Esporte e academia' },
  { value: 'ArtGallery', label: 'Arte e galeria' }
]);

export const DEFAULT_LOCAL_BUSINESS_TYPE = 'LocalBusiness';
export const AREA_SERVED_MAX = 120;

const TYPE_VALUES = new Set(LOCAL_BUSINESS_TYPES.map((entry) => entry.value));
const CONTROL_OR_MARKUP = /[<>\u0000-\u001f\u007f]/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Valida `content.localSeo` do rascunho. Devolve `{ value, errors }`: `value` é o
 * objeto normalizado (ou `undefined` quando vazio) e cada erro traz `field` no
 * formato `localSeo.areaServed`.
 */
export function validateLocalSeo(raw) {
  const errors = [];
  const push = (field, message) => errors.push({ field: `localSeo${field ? `.${field}` : ''}`, code: 'INVALID_LOCAL_SEO', message });

  if (raw === undefined || raw === null) return { value: undefined, errors };
  if (!isPlainObject(raw)) {
    push('', 'Os dados para o Google devem ser um objeto.');
    return { value: undefined, errors };
  }
  for (const key of Object.keys(raw)) {
    if (key !== 'businessType' && key !== 'areaServed') push(key, `Campo desconhecido nos dados para o Google: ${key}.`);
  }
  const businessType = cleanText(raw.businessType);
  const areaServed = cleanText(raw.areaServed);
  if (businessType && !TYPE_VALUES.has(businessType)) push('businessType', 'Escolha um tipo de negócio da lista.');
  if (areaServed.length > AREA_SERVED_MAX) push('areaServed', `A área atendida deve ter no máximo ${AREA_SERVED_MAX} caracteres.`);
  else if (areaServed && CONTROL_OR_MARKUP.test(areaServed)) push('areaServed', 'A área atendida não pode ter os caracteres < ou >.');

  if (errors.length) return { value: undefined, errors };
  if (!businessType && !areaServed) return { value: undefined, errors };
  return {
    value: {
      ...(businessType ? { businessType } : {}),
      ...(areaServed ? { areaServed } : {})
    },
    errors
  };
}

/**
 * Bloco público `localBusiness` do snapshot. Só existe quando a vitrine tem o
 * recurso `local_seo`; sem tipo escolhido, vale o genérico `LocalBusiness`.
 */
export function projectPublicLocalBusiness(content = {}, { enabled = false } = {}) {
  if (!enabled) return {};
  const { value } = validateLocalSeo(content?.localSeo);
  return {
    localBusiness: {
      type: value?.businessType ?? DEFAULT_LOCAL_BUSINESS_TYPE,
      ...(value?.areaServed ? { areaServed: value.areaServed } : {})
    }
  };
}
