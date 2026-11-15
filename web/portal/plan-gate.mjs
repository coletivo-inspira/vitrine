// Selos de plano nos recursos pagos do painel (issue #115): o plano que libera aparece
// antes do clique. O Worker continua recusando com 403 PLAN_FEATURE_REQUIRED; aqui só
// há exibição, a partir de GET /api/sites/:id/entitlements.

export const PLAN_SECTION_HASH = '#plano';

const cache = new Map();

export async function loadSitePlan(siteId, fetchImpl = globalThis.fetch) {
  if (!siteId) return null;
  if (cache.has(siteId)) return cache.get(siteId);
  const request = (async () => {
    try {
      const response = await fetchImpl(`/api/sites/${encodeURIComponent(siteId)}/entitlements`);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  })();
  cache.set(siteId, request);
  const result = await request;
  if (!result) cache.delete(siteId);
  return result;
}

export function forgetSitePlans() {
  cache.clear();
}

export function requiredPlanFor(summary, feature) {
  const plan = summary?.locked?.[feature];
  return plan && typeof plan.name === 'string' ? plan : null;
}

export function createPlanBadge(plan, ownerDocument = globalThis.document) {
  const badge = ownerDocument.createElement('span');
  badge.className = 'plan-badge';
  badge.dataset.plan = plan.code;
  badge.textContent = plan.name;
  return badge;
}

let hintCounter = 0;

function goToPlan(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (globalThis.window) globalThis.window.location.hash = PLAN_SECTION_HASH;
}

// Botão travado: selo com o nome do plano, texto do que muda ligado por
// aria-describedby e clique que leva à tela "Plano e cobrança" em vez da ação.
export function lockAction(button, plan, hintText) {
  if (!button || !plan) return null;
  unlockAction(button);
  const ownerDocument = button.ownerDocument;
  const hint = ownerDocument.createElement('p');
  hintCounter += 1;
  hint.id = `plan-gate-hint-${hintCounter}`;
  hint.className = 'plan-gate-hint';
  hint.textContent = hintText;
  button.after(hint);
  const spacer = ownerDocument.createTextNode(' ');
  const badge = createPlanBadge(plan, ownerDocument);
  button.append(spacer, badge);
  button.dataset.planLocked = plan.code;
  const describedBy = (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  button.setAttribute('aria-describedby', [...describedBy, hint.id].join(' '));
  button.addEventListener('click', goToPlan, true);
  button._planGate = { hint, spacer, badge, describedBy };
  return hint;
}

export function unlockAction(button) {
  const gate = button?._planGate;
  if (!gate) return;
  gate.hint.remove();
  gate.spacer.remove();
  gate.badge.remove();
  delete button.dataset.planLocked;
  if (gate.describedBy.length) button.setAttribute('aria-describedby', gate.describedBy.join(' '));
  else button.removeAttribute('aria-describedby');
  button.removeEventListener('click', goToPlan, true);
  delete button._planGate;
}

// Selo informativo (sem trava) ao lado de um título, para campos que continuam
// editáveis mas só entram na vitrine publicada com o plano.
export function markPlanRequirement(container, plan) {
  if (!container) return;
  container.querySelector(':scope > .plan-badge')?.remove();
  if (plan) container.append(createPlanBadge(plan, container.ownerDocument));
}
