// Página de preços (/planos/, issue #115). O build lê content/plans.json e troca o
// trecho entre os marcadores de web/planos/index.html; mudar o JSON muda a página.
import { PLAN_FEATURES, validatePlanTable } from './plans.mjs';

export const PRICING_START = '<!-- planos:inicio -->';
export const PRICING_END = '<!-- planos:fim -->';
// Referência de quem cobra por venda em vez de mensalidade (estudo de mercado 2026).
export const SALES_FEE_PERCENT = 9;

// Recursos da tabela que ainda não chegaram à vitrine publicada (Princípio V).
const IN_PREPARATION = new Set(['public_json', 'quote_webhook', 'conversion_reports', 'support_badge_optional']);

const FEATURE_LABELS = Object.freeze({
  custom_domain: 'Domínio próprio (o seu .com.br)',
  inspira_subdomain: 'Subdomínio inspira.dev.br',
  local_seo: 'Dados de negócio local para o Google',
  support_badge_optional: 'Selo do Apoio Coletivo opcional',
  public_json: 'Arquivo vitrine.json para integrações',
  quote_webhook: 'Pré-orçamento enviado ao seu sistema',
  conversion_reports: 'Insights por origem das visitas',
  multi_vitrine: 'Até 5 vitrines com os mesmos recursos'
});

const BASE_INCLUDED = Object.freeze([
  'Endereço vitrine.inspira.dev.br/seu-negocio',
  'Pedido direto no seu WhatsApp, sem taxa por venda',
  'Link para o Instagram',
  '"Aberto agora", "Traçar rota" e QR Code',
  'Insights básicos de visitas e pedidos'
]);

const PLAN_LEADS = Object.freeze({
  free: 'Para começar com uma vitrine no endereço da Vitrine Inspira.',
  essencial: 'Para ter o seu próprio endereço e aparecer melhor nas buscas da sua região.',
  profissional: 'Para organizar a vitrine em blocos e preparar integrações com o seu negócio.',
  equipe: 'Para quem cuida de mais de uma vitrine no mesmo negócio.'
});

const SERVICE_DETAILS = Object.freeze({
  implantacao: {
    lead: 'A equipe deixa tudo pronto para você.',
    items: ['Configuração do DNS do seu domínio', 'Tratamento das imagens', 'Perfil no Google Meu Negócio', 'QR Codes impressos']
  },
  projeto: {
    lead: 'Uma apresentação, integração ou funcionalidade nova para a sua ideia.',
    items: ['Conversa sobre o objetivo', 'Escopo e proposta próprios', 'Implementação combinada']
  }
});

const DOMAIN_PREREQUISITE = 'Domínio próprio depende de vaga na plataforma (até 95 domínios ativos) e da configuração do DNS. O registro e a renovação do domínio são pagos à parte, ao registrador.';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatReais(cents) {
  const reais = cents / 100;
  return `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function featureLabel(feature) {
  const label = FEATURE_LABELS[feature];
  return IN_PREPARATION.has(feature) ? `${label} (em preparação)` : label;
}

// Venda mensal a partir da qual a taxa por venda passa a mensalidade do plano.
export function salesFeeBreakEvenCents(plan, percent = SALES_FEE_PERCENT) {
  return Math.floor((plan.monthlyPriceCents * 100) / percent);
}

export function salesFeeComparison(table) {
  const essencial = table.plans.find((plan) => plan.code === 'essencial');
  const breakEven = Math.floor(salesFeeBreakEvenCents(essencial) / 100) * 100;
  return `Vendendo mais de ${formatReais(breakEven)} por mês, a taxa de ${SALES_FEE_PERCENT}% já passa do ${essencial.name}.`;
}

function list(items, className) {
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderPlan(plan, table) {
  const higher = PLAN_FEATURES.filter((feature) =>
    !plan.features.includes(feature) && table.plans.some((entry) => entry.features.includes(feature)));
  const included = [
    ...(plan.code === 'free' ? BASE_INCLUDED : [`Tudo do ${table.plans[table.plans.indexOf(plan) - 1].name}`]),
    ...plan.features
      .filter((feature) => {
        const previous = table.plans[table.plans.indexOf(plan) - 1];
        return !previous || !previous.features.includes(feature);
      })
      .map(featureLabel)
  ];
  const limits = [
    plural(plan.limits.vitrines, 'vitrine', 'vitrines'),
    `Até ${plan.limits.activeItemsPerVitrine} itens ativos por vitrine`,
    `${plural(plan.limits.itemBlocks, 'bloco', 'blocos')} de itens por vitrine`
  ];
  const price = plan.monthlyPriceCents === 0
    ? '<span class="pricing-amount">R$ 0</span><span class="pricing-period">sem mensalidade</span>'
    : `<span class="pricing-amount">${escapeHtml(formatReais(plan.monthlyPriceCents))}</span><span class="pricing-period">por mês</span>`;
  const notIncluded = higher.length
    ? `<h4 class="pricing-list-title">Não inclui</h4>${list(higher.map(featureLabel), 'pricing-list pricing-list-out')}`
    : '';
  const prerequisite = plan.features.includes('custom_domain')
    ? `<p class="pricing-note">${escapeHtml(DOMAIN_PREREQUISITE)}</p>`
    : '';
  const action = plan.code === 'free'
    ? '<a class="button button-small" href="https://painel.inspira.dev.br/">Criar minha vitrine</a>'
    : '<a class="text-link" href="https://painel.inspira.dev.br/#plano">Contratar no painel <span aria-hidden="true">↗</span></a>';
  return `<article class="pricing-plan" data-plan="${escapeHtml(plan.code)}" aria-labelledby="plano-${escapeHtml(plan.code)}">
            <h3 id="plano-${escapeHtml(plan.code)}" class="pricing-name">${escapeHtml(plan.name)}</h3>
            <p class="pricing-price">${price}</p>
            <p class="pricing-lead">${escapeHtml(PLAN_LEADS[plan.code])}</p>
            ${list(limits, 'pricing-limits')}
            <h4 class="pricing-list-title">Inclui</h4>
            ${list(included, 'pricing-list')}
            ${notIncluded}
            ${prerequisite}
            <div class="pricing-action">${action}</div>
          </article>`;
}

function renderService(service) {
  const details = SERVICE_DETAILS[service.code] ?? { lead: '', items: [] };
  const price = service.maxPriceCents === null
    ? `A partir de ${formatReais(service.minPriceCents)}`
    : `${formatReais(service.minPriceCents)} a ${formatReais(service.maxPriceCents)}`;
  return `<article class="offer pricing-service" data-service="${escapeHtml(service.code)}">
            <h3>${escapeHtml(service.name)}</h3>
            <p class="offer-emphasis">${escapeHtml(price)}</p>
            <p>${escapeHtml(details.lead)} Pagamento único, depois do orçamento aceito.</p>
            ${list(details.items, '')}
          </article>`;
}

export function renderPricingSection(source) {
  const table = validatePlanTable(source);
  return `${PRICING_START}
    <section class="pricing section-space" id="planos" aria-labelledby="offers-title">
      <div class="wrap">
        <div class="section-heading">
          <h2 id="offers-title">Comece grátis.<br>Cresça quando fizer sentido.</h2>
          <p>Mensalidade fixa e nenhuma taxa sobre o que você vende: o pedido vai direto para o seu WhatsApp. Troque de plano ou cancele quando quiser, sem perder o que já montou.</p>
        </div>
        <div class="pricing-grid">
          ${table.plans.map((plan) => renderPlan(plan, table)).join('\n          ')}
        </div>
        <aside class="pricing-compare" aria-labelledby="pricing-compare-title">
          <h3 id="pricing-compare-title">Taxa por venda ou mensalidade fixa?</h3>
          <p>Há plataformas que cobram ${SALES_FEE_PERCENT}% sobre cada venda em vez de mensalidade. É um bom modelo para quem vende pouco. ${escapeHtml(salesFeeComparison(table))} Na Vitrine, o valor do mês é o mesmo em qualquer volume de pedidos.</p>
        </aside>
        <p class="section-note">Planos pagos são contratados no painel, em Plano e cobrança, e pagos pelo Asaas com Pix, boleto ou cartão. Sem pagamento confirmado, a vitrine segue no ar com os limites do Gratuito/Social e nada é apagado.</p>
      </div>
    </section>

    <section class="offers section-space" id="servicos" aria-labelledby="services-title">
      <div class="wrap">
        <div class="section-heading">
          <h2 id="services-title">Quer ajuda para montar?</h2>
          <p>Serviços avulsos, fora da mensalidade, com orçamento antes de começar.</p>
        </div>
        <div class="offer-grid pricing-services">
          ${table.services.map(renderService).join('\n          ')}
          <article class="offer">
            <h3>Como pedir</h3>
            <p class="offer-emphasis">Orçamento com a Mila</p>
            <p>Conte o que precisa e receba a proposta pelo WhatsApp.</p>
            <a class="text-link" href="/orcamento/">Pedir orçamento <span aria-hidden="true">↗</span></a>
          </article>
        </div>
      </div>
    </section>
    ${PRICING_END}`;
}

export function applyPricingPage(html, source) {
  const start = html.indexOf(PRICING_START);
  const end = html.indexOf(PRICING_END);
  if (start < 0 || end < start) throw new Error('web/planos/index.html sem os marcadores da tabela de planos');
  return html.slice(0, start) + renderPricingSection(source) + html.slice(end + PRICING_END.length);
}
