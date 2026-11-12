import {
  AUCTION_RULES,
  buildWhatsappHref,
  formatAuctionCents,
  formatAuctionDeadline,
  formatRemaining
} from '../assets/auction-rules.mjs';
import { formatWhatsappBR } from './phone-mask.mjs';

const TEAM_ROLES = new Set(['owner', 'admin']);

const state = {
  getSites: () => [],
  isOnline: () => false,
  fetchImpl: (...args) => globalThis.fetch(...args),
  selectedSiteId: null,
  auctions: [],
  voidDialog: null
};

function el(tag, className, text) {
  const node = globalThis.document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function eligibleAuctionSites(sites) {
  return (Array.isArray(sites) ? sites : []).filter((site) => TEAM_ROLES.has(site?.role));
}

export function buildWinnerWhatsappHref(auction, siteName) {
  if (!auction?.winner) return '';
  const amount = formatAuctionCents(auction.winner.amountCents);
  const text =
    auction.status === 'closed'
      ? `Olá, ${auction.winner.name}! Seu lance de ${amount} venceu o leilão de "${auction.itemName}" na vitrine ${siteName}. Vamos combinar o pagamento e a entrega?`
      : `Olá, ${auction.winner.name}! Recebemos seu lance de ${amount} em "${auction.itemName}" na vitrine ${siteName}.`;
  return buildWhatsappHref(auction.winner.whatsapp, text);
}

function formatPlacedAt(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : formatAuctionDeadline(date);
}

export function renderAuctionCards(container, auctions, { siteName = 'Vitrine', nowMs = Date.now(), onVoid } = {}) {
  container.replaceChildren();
  for (const auction of auctions) {
    const card = el('article', 'portal-card auction-card');
    card.setAttribute('data-lot-id', auction.lotId);

    const header = el('div', 'auction-card-header');
    header.appendChild(el('h2', '', auction.itemName));
    const remaining = Date.parse(auction.endsAt) - nowMs;
    const isOpen = auction.status === 'open' && remaining > 0;
    header.appendChild(
      el('span', isOpen ? 'sf-auction-status is-open' : 'sf-auction-status', isOpen ? 'Aberto' : 'Encerrado')
    );
    card.appendChild(header);

    card.appendChild(
      el(
        'p',
        'sf-auction-meta',
        isOpen
          ? `Encerra ${formatAuctionDeadline(auction.endsAt)} · faltam ${formatRemaining(remaining)}`
          : `Encerrado ${formatAuctionDeadline(auction.endsAt)}`
      )
    );

    const stats = el('dl', 'auction-stats');
    const stat = (label, value) => {
      const wrap = el('div');
      wrap.appendChild(el('dt', '', label));
      wrap.appendChild(el('dd', '', value));
      stats.appendChild(wrap);
    };
    stat(isOpen ? 'Lance atual' : 'Lance final', auction.currentCents ? formatAuctionCents(auction.currentCents) : 'Sem lances');
    stat('Lances válidos', String(auction.bidCount));
    stat('Lance inicial', formatAuctionCents(auction.startCents));
    stat('Incremento', formatAuctionCents(auction.incrementCents));
    card.appendChild(stats);

    if (auction.personalDataPurged) {
      card.appendChild(
        el('p', 'auction-empty', `Contatos apagados ${AUCTION_RULES.retentionDays} dias após o encerramento. Ficaram só os totais.`)
      );
    } else if (auction.winner) {
      const winner = el('div', 'auction-winner');
      const info = el('div');
      info.appendChild(el('p', 'auction-winner-label', isOpen ? 'Na frente agora' : 'Vencedor'));
      info.appendChild(el('p', 'auction-winner-name', auction.winner.name));
      info.appendChild(
        el('p', '', `${formatWhatsappBR(auction.winner.whatsapp)} · ${formatAuctionCents(auction.winner.amountCents)}`)
      );
      winner.appendChild(info);
      const href = buildWinnerWhatsappHref(auction, siteName);
      if (href) {
        const link = el('a', 'button button-small button-pill', 'Chamar no WhatsApp');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        winner.appendChild(link);
      }
      card.appendChild(winner);
    } else {
      card.appendChild(el('p', 'auction-empty', 'Nenhum lance válido até agora.'));
    }

    if (auction.bids.length > 0) {
      const details = el('details', 'auction-bids');
      details.appendChild(el('summary', '', `Ver todos os lances (${auction.bids.length})`));
      const list = el('ul', 'auction-bid-list');
      for (const bid of auction.bids) {
        const row = el('li', bid.status === 'void' ? 'auction-bid-row is-void' : 'auction-bid-row');
        const info = el('div', 'auction-bid-info');
        info.appendChild(el('strong', 'auction-bid-amount', formatAuctionCents(bid.amountCents)));
        info.appendChild(el('span', '', `${bid.name} · ${formatWhatsappBR(bid.whatsapp)} · ${formatPlacedAt(bid.placedAt)}`));
        if (bid.status === 'void') {
          info.appendChild(el('span', '', `Desconsiderado: ${bid.voidReason}`));
        }
        row.appendChild(info);
        if (bid.status === 'valid' && typeof onVoid === 'function') {
          const button = el('button', 'button button-small button-secondary button-pill', 'Desconsiderar');
          button.type = 'button';
          button.setAttribute('aria-label', `Desconsiderar lance de ${formatAuctionCents(bid.amountCents)} de ${bid.name}`);
          button.addEventListener('click', () => onVoid(auction, bid));
          row.appendChild(button);
        }
        list.appendChild(row);
      }
      details.appendChild(list);
      card.appendChild(details);
    }

    container.appendChild(card);
  }
}

function ensureVoidDialog() {
  if (state.voidDialog) return state.voidDialog;
  const dialog = el('dialog', 'portal-dialog');
  dialog.setAttribute('aria-labelledby', 'auction-void-title');
  const form = el('form', 'auction-void-form');
  form.noValidate = true;
  const title = el('h2', 'portal-dialog-title', 'Desconsiderar lance');
  title.id = 'auction-void-title';
  const desc = el('p', 'portal-dialog-desc');
  const group = el('div', 'form-group');
  const label = el('label', '', 'Motivo (fica na trilha de auditoria)');
  label.setAttribute('for', 'auction-void-reason');
  const reason = el('textarea', 'item-input');
  reason.id = 'auction-void-reason';
  reason.maxLength = AUCTION_RULES.voidReasonMaxLength;
  reason.placeholder = 'Ex.: não respondeu em 48 horas';
  group.appendChild(label);
  group.appendChild(reason);
  const check = el('label', 'auction-void-check');
  const block = el('input');
  block.type = 'checkbox';
  block.id = 'auction-void-block';
  check.appendChild(block);
  check.appendChild(el('span', '', 'Bloquear este contato para novos lances nesta vitrine'));
  const error = el('p', 'form-error-msg');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = el('div', 'portal-dialog-actions');
  const cancel = el('button', 'button button-small button-secondary button-pill', 'Cancelar');
  cancel.type = 'button';
  const submit = el('button', 'button button-small button-pill', 'Desconsiderar');
  submit.type = 'submit';
  actions.appendChild(cancel);
  actions.appendChild(submit);
  for (const child of [title, desc, group, check, error, actions]) form.appendChild(child);
  dialog.appendChild(form);
  cancel.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitVoid();
  });
  globalThis.document.body.appendChild(dialog);
  state.voidDialog = dialog;
  state.voidParts = { desc, reason, block, error, submit };
  return dialog;
}

function openVoidDialog(auction, bid) {
  const dialog = ensureVoidDialog();
  const parts = state.voidParts;
  state.pendingVoid = { auction, bid };
  parts.desc.textContent = `Lance de ${formatAuctionCents(bid.amountCents)} de ${bid.name} em "${auction.itemName}". O próximo maior lance válido passa a valer.`;
  parts.reason.value = '';
  parts.block.checked = false;
  parts.error.hidden = true;
  parts.submit.disabled = false;
  dialog.showModal?.();
  parts.reason.focus?.();
}

async function submitVoid() {
  const parts = state.voidParts;
  const pending = state.pendingVoid;
  if (!pending) return;
  const reason = parts.reason.value.replace(/\s+/g, ' ').trim();
  if (reason.length < AUCTION_RULES.voidReasonMinLength) {
    parts.error.textContent = 'Explique o motivo em poucas palavras (mínimo de 3 caracteres).';
    parts.error.hidden = false;
    return;
  }
  parts.submit.disabled = true;
  try {
    const response = await state.fetchImpl(
      `/api/sites/${encodeURIComponent(state.selectedSiteId)}/auctions/bids/${encodeURIComponent(pending.bid.id)}/void`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, block: parts.block.checked })
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      parts.error.textContent = body?.error?.message || 'Não foi possível desconsiderar o lance.';
      parts.error.hidden = false;
      parts.submit.disabled = false;
      return;
    }
    state.voidDialog.close();
    state.pendingVoid = null;
    await loadAuctionsPanel();
  } catch {
    parts.error.textContent = 'Falha de rede. Tente novamente.';
    parts.error.hidden = false;
    parts.submit.disabled = false;
  }
}

function syncSiteSelect() {
  const select = globalThis.document?.getElementById('auctions-site-select');
  const sites = eligibleAuctionSites(state.getSites());
  if (!state.selectedSiteId || !sites.some((site) => site.id === state.selectedSiteId)) {
    state.selectedSiteId = sites[0]?.id ?? null;
  }
  if (!select) return sites;
  select.replaceChildren();
  for (const site of sites) {
    const option = el('option', '', site.name);
    option.value = site.id;
    option.selected = site.id === state.selectedSiteId;
    select.appendChild(option);
  }
  select.disabled = sites.length === 0;
  return sites;
}

function setStatus(text) {
  const status = globalThis.document?.getElementById('auctions-status');
  if (status) {
    status.textContent = text;
    status.hidden = !text;
  }
}

export async function loadAuctionsPanel() {
  const list = globalThis.document?.getElementById('auctions-list');
  if (!list) return [];
  const sites = syncSiteSelect();
  list.replaceChildren();
  if (!state.isOnline()) {
    setStatus('Os leilões aparecem quando a vitrine está publicada e você entra com sua conta.');
    return [];
  }
  if (sites.length === 0) {
    setStatus('Só proprietários e administradores de uma vitrine acompanham os leilões.');
    return [];
  }
  setStatus('Carregando leilões...');
  try {
    const response = await state.fetchImpl(`/api/sites/${encodeURIComponent(state.selectedSiteId)}/auctions`);
    if (!response.ok) {
      setStatus('Não foi possível carregar os leilões desta vitrine.');
      return [];
    }
    const { auctions = [] } = await response.json();
    state.auctions = auctions;
    if (auctions.length === 0) {
      setStatus(
        'Nenhum lance ainda. Para criar um leilão, marque o item como "Item de lance" no editor, defina o encerramento e publique.'
      );
      return auctions;
    }
    setStatus('');
    const siteName = sites.find((site) => site.id === state.selectedSiteId)?.name ?? 'Vitrine';
    renderAuctionCards(list, auctions, { siteName, onVoid: openVoidDialog });
    return auctions;
  } catch {
    setStatus('Falha de rede ao carregar os leilões.');
    return [];
  }
}

export function selectAuctionSite(siteId) {
  state.selectedSiteId = siteId;
}

export function initAuctionsPanel({ getSites, isOnline, fetchImpl } = {}) {
  if (typeof getSites === 'function') state.getSites = getSites;
  if (typeof isOnline === 'function') state.isOnline = isOnline;
  if (typeof fetchImpl === 'function') state.fetchImpl = fetchImpl;
  globalThis.document?.getElementById('auctions-site-select')?.addEventListener('change', (event) => {
    state.selectedSiteId = event.target.value;
    void loadAuctionsPanel();
  });
  globalThis.document?.getElementById('auctions-refresh')?.addEventListener('click', () => {
    void loadAuctionsPanel();
  });
}
