// "Tenho um cupom" em Plano e cobrança (spec 022). Só a proprietária resgata; o banco
// confere de novo, limita a 10 tentativas por hora e cria a licença.
const doc = () => globalThis.document;
const byId = id => doc()?.getElementById(id) ?? null;

const state = {
  getSites: () => [],
  isOnline: () => true,
  onRedeemed: () => {},
  fetch: (...args) => globalThis.fetch(...args)
};

const PLAN_NAMES = { essencial: 'Essencial', profissional: 'Profissional', equipe: 'Equipe/Multi-Vitrine' };

export function ownedSites(sites) {
  return (Array.isArray(sites) ? sites : []).filter(site => site?.role === 'owner' && !site?.archivedAt);
}

export function redeemSuccessMessage(redemption) {
  const plan = redemption?.planName ?? PLAN_NAMES[redemption?.planCode] ?? 'Plano';
  const date = new Date(redemption?.endsAt);
  const until = Number.isNaN(date.getTime())
    ? ''
    : ` até ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}`;
  return `${plan} liberado${until}. Os recursos já valem na vitrine.`;
}

export function refreshCouponRedeem() {
  const card = byId('billing-coupon');
  const select = byId('billing-coupon-site');
  if (!card || !select) return;
  const sites = ownedSites(state.getSites());
  card.hidden = !state.isOnline() || !sites.length;
  if (card.hidden) return;
  const previous = select.value;
  select.replaceChildren(...sites.map(site => {
    const option = doc().createElement('option');
    option.value = site.id;
    option.textContent = site.name || site.slug;
    return option;
  }));
  if (sites.some(site => site.id === previous)) select.value = previous;
  const group = byId('billing-coupon-site-group');
  if (group) group.hidden = sites.length === 1;
}

export async function submitCoupon() {
  const select = byId('billing-coupon-site');
  const input = byId('billing-coupon-code');
  const status = byId('billing-coupon-status');
  const siteId = select?.value || ownedSites(state.getSites())[0]?.id;
  const code = String(input?.value ?? '').trim().toUpperCase();
  if (!code) {
    status.textContent = 'Digite o código do cupom.';
    input?.focus();
    return null;
  }
  if (!siteId) return null;
  const submit = byId('billing-coupon-form')?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  status.textContent = 'Conferindo o cupom…';
  try {
    const response = await state.fetch(`/api/sites/${encodeURIComponent(siteId)}/coupon`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      status.textContent = data?.error?.message ?? 'Não foi possível usar o cupom.';
      return null;
    }
    status.textContent = redeemSuccessMessage(data.redemption);
    input.value = '';
    state.onRedeemed(data.redemption);
    return data.redemption;
  } catch {
    status.textContent = 'Não foi possível usar o cupom. Confira a conexão e tente de novo.';
    return null;
  } finally {
    if (submit) submit.disabled = false;
  }
}

export function initCouponRedeem({ getSites, isOnline, onRedeemed, fetch: fetchImpl } = {}) {
  if (getSites) state.getSites = getSites;
  if (isOnline) state.isOnline = isOnline;
  if (onRedeemed) state.onRedeemed = onRedeemed;
  if (fetchImpl) state.fetch = fetchImpl;
  const redeemForm = doc()?.getElementById('billing-coupon-form');
  redeemForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitCoupon();
  });
}
