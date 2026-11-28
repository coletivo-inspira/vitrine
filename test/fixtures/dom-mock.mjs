// DOM mínimo para renderizar a vitrine no Node, no mesmo formato do mock de
// test/storefront-staged-flow.test.mjs (só o que o renderizador usa).
export function createDomMock(ids = ['storefront-status', 'storefront-name', 'storefront-page-title', 'storefront-header-name', 'storefront-subtitle', 'category-nav', 'storefront-catalog']) {
  const byId = new Map();

  function makeEl(tag = 'div') {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      hidden: false,
      value: '',
      href: '',
      disabled: false,
      selected: false,
      children: [],
      attributes: {},
      dataset: {},
      listeners: {},
      classList: {
        add(...tokens) {
          const existing = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          tokens.forEach((token) => existing.add(token));
          el.className = [...existing].join(' ');
        },
        remove(...tokens) {
          const existing = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          tokens.forEach((token) => existing.delete(token));
          el.className = [...existing].join(' ');
        },
        contains(token) {
          return String(el.className || '').split(/\s+/).includes(token);
        },
        toggle(token, force) {
          if (force ?? !el.classList.contains(token)) el.classList.add(token);
          else el.classList.remove(token);
        }
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      append(...nodes) {
        this.children.push(...nodes);
      },
      replaceChildren(...nodes) {
        this.children = nodes.flat();
      },
      setAttribute(key, val) {
        this.attributes[key] = String(val);
        if (key === 'id') {
          this.id = String(val);
          byId.set(this.id, this);
        }
      },
      removeAttribute(key) {
        delete this.attributes[key];
      },
      addEventListener(event, handler) {
        (this.listeners[event] ??= []).push(handler);
      },
      querySelector: () => null,
      querySelectorAll: () => []
    };
    return el;
  }

  for (const id of ids) {
    const el = makeEl(id === 'storefront-page-title' ? 'title' : 'div');
    el.id = id;
    byId.set(id, el);
  }

  const documentMock = {
    createElement: (tag) => makeEl(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    getElementById: (id) => byId.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return { documentMock, byId };
}

/** Roda `fn` com `globalThis.document` trocado pelo mock e devolve o resultado. */
export function withDomMock(fn) {
  const { documentMock, byId } = createDomMock();
  const previous = globalThis.document;
  globalThis.document = documentMock;
  try {
    return fn({ documentMock, byId });
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}
