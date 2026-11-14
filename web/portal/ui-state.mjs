// Utilitários da auditoria de UX (docs/auditoria-ux/relatorio-consolidado.md, 6.1):
// PB-01 região de mensagens, PB-02 estado (carregando, vazio, erro com "Tentar de
// novo") e PB-03 trava de envio. Falha nunca aparece como vazio.

const doc = () => globalThis.document;

// PB-02. `state` em loading, empty ou error; o erro sempre oferece nova tentativa.
export function createStateView({ state, message, onRetry, retryLabel = 'Tentar de novo' }, ownerDocument = doc()) {
  const view = ownerDocument.createElement('div');
  view.className = 'ui-state';
  view.dataset.state = state;
  const text = ownerDocument.createElement('p');
  text.className = 'ui-state-text';
  text.textContent = message;
  view.append(text);
  if (state === 'error') {
    view.setAttribute('role', 'alert');
    if (typeof onRetry === 'function') {
      const retry = ownerDocument.createElement('button');
      retry.type = 'button';
      retry.className = 'button button-small button-secondary button-pill ui-state-retry';
      retry.textContent = retryLabel;
      retry.addEventListener('click', () => onRetry());
      view.append(retry);
    }
  } else {
    view.setAttribute('role', 'status');
  }
  return view;
}

export function showState(container, options) {
  if (!container) return null;
  const view = createStateView(options, container.ownerDocument);
  container.replaceChildren(view);
  if (options.state === 'loading') container.setAttribute('aria-busy', 'true');
  else container.removeAttribute('aria-busy');
  return view;
}

const inFlight = new WeakMap();

// PB-03. Enquanto a tarefa corre, o botão fica desabilitado com aria-busy e um novo
// clique devolve a mesma promessa: um único envio por botão.
export function withSubmitLock(button, task, { busyLabel } = {}) {
  if (!button) return Promise.resolve().then(task);
  const running = inFlight.get(button);
  if (running) return running;
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (busyLabel) button.textContent = busyLabel;
  const promise = Promise.resolve()
    .then(task)
    .finally(() => {
      inFlight.delete(button);
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (busyLabel) button.textContent = label;
    });
  inFlight.set(button, promise);
  return promise;
}

// PB-01. Mensagem visível na própria tela; erro usa role="alert" e não some sozinho.
export function announce(region, message, tone = 'success') {
  if (!region) return;
  region.replaceChildren();
  if (!message) {
    region.hidden = true;
    return;
  }
  region.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  region.dataset.tone = tone;
  region.textContent = message;
  region.hidden = false;
}
