// Componente único de perguntas frequentes: vitrine (módulo "faq") e página do item.
export const FAQ_DEFAULT_TITLE = 'Perguntas frequentes';

// Só sugestões de pergunta para quem vende serviços; o dono escreve as respostas.
export const FAQ_SERVICE_SUGGESTIONS = Object.freeze([
  'Quais são as formas de pagamento?',
  'É online ou presencial?',
  'E se eu precisar remarcar?',
  'Tem garantia?'
]);

const FAQ_ICON = '<svg class="storefront-faq-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Acordeão nativo (`details`/`summary`): abre e fecha por Enter e Espaço sem
 * JavaScript. Devolve '' sem perguntas respondidas.
 */
export function renderFaqBlock(config = {}, { id = 'perguntas', headingLevel = 2, className = 'storefront-module' } = {}) {
  const items = (config.items ?? []).filter((item) => item?.q?.trim() && item?.a?.trim());
  if (!items.length) return '';
  const level = headingLevel === 3 ? 3 : 2;
  const headingId = `${id}-titulo`;
  const title = config.title?.trim() || FAQ_DEFAULT_TITLE;
  return `<section id="${escapeHtml(id)}" class="${escapeHtml(className)} storefront-faq" aria-labelledby="${escapeHtml(headingId)}">
      <h${level} id="${escapeHtml(headingId)}">${escapeHtml(title)}</h${level}>
      <div class="storefront-faq-list">${items.map((item) => `
        <details class="storefront-faq-item">
          <summary><span class="storefront-faq-question">${escapeHtml(item.q.trim())}</span>${FAQ_ICON}</summary>
          <div class="storefront-faq-answer"><p>${escapeHtml(item.a.trim())}</p></div>
        </details>`).join('')}
      </div>
    </section>`;
}
