// Faixa de aviso da assinatura no Início (issue #114). O Worker decide o aviso em
// GET /api/billing/notice; aqui só há texto e exibição.

const TIME_ZONE = 'America/Sao_Paulo';

function formatDay(iso, offsetMs = 0) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: TIME_ZONE })
    .format(new Date(time + offsetMs));
}

function days(count) {
  return count === 1 ? '1 dia' : `${count} dias`;
}

// O fim da tolerância é meia-noite; o último dia com os recursos é o anterior.
export function billingNoticeCopy(notice) {
  if (!notice || typeof notice !== 'object') return null;
  const plan = notice.planName ? `plano ${notice.planName}` : 'plano';
  const due = formatDay(notice.dueDate);
  const lastDay = formatDay(notice.graceUntil, -1);
  const payHint = 'Pague pelo link que o Asaas enviou ao seu e-mail de cobrança.';
  switch (notice.kind) {
    case 'due_soon':
      return {
        tone: 'due',
        title: `Sua assinatura vence em ${days(notice.daysLeft)}`,
        text: `O ${plan} vence em ${due}. ${payHint} Os recursos pagos continuam sem interrupção.`
      };
    case 'grace':
      return {
        tone: 'grace',
        title: `Pagamento pendente: ${days(notice.daysLeft)} de tolerância`,
        text: `O ${plan} venceu em ${due}. Os recursos pagos continuam até ${lastDay}; depois, sua vitrine segue no ar com os limites do plano Gratuito. ${payHint}`
      };
    case 'suspended':
      return {
        tone: 'suspended',
        title: 'Recursos pagos suspensos',
        text: `O pagamento do ${plan} não foi confirmado até ${lastDay}. Sua vitrine continua no ar em vitrine.inspira.dev.br, sem o domínio próprio e com os limites do plano Gratuito. Nada foi apagado: quando o Asaas confirmar o pagamento, tudo volta sozinho.`
      };
    default:
      return null;
  }
}

export function renderBillingNotice(container, notice) {
  if (!container) return;
  const copy = billingNoticeCopy(notice);
  if (!copy) {
    container.hidden = true;
    container.replaceChildren();
    delete container.dataset.tone;
    return;
  }
  const doc = container.ownerDocument;
  const title = doc.createElement('p');
  title.className = 'billing-notice-title';
  title.textContent = copy.title;
  const text = doc.createElement('p');
  text.className = 'billing-notice-text';
  text.textContent = copy.text;
  container.replaceChildren(title, text);
  container.dataset.tone = copy.tone;
  container.hidden = false;
}

export async function loadBillingNotice(container, fetchImpl = globalThis.fetch) {
  if (!container) return null;
  try {
    const res = await fetchImpl('/api/billing/notice');
    const data = res.ok ? await res.json() : null;
    renderBillingNotice(container, data?.notice ?? null);
    return data?.notice ?? null;
  } catch {
    renderBillingNotice(container, null);
    return null;
  }
}
