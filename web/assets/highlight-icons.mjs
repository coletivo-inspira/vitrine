// Lista fechada de ícones do módulo "Destaques": traços em 24×24, sem arquivos externos.
export const HIGHLIGHT_ICON_LABELS = Object.freeze({
  relogio: 'Relógio',
  pessoas: 'Pessoas',
  local: 'Local',
  online: 'Online',
  entrega: 'Entrega',
  garantia: 'Garantia',
  estrela: 'Estrela',
  calendario: 'Calendário',
  coracao: 'Coração',
  mensagem: 'Mensagem'
});

export const HIGHLIGHT_ICON_PATHS = Object.freeze({
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  pessoas: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 5.3a3 3 0 0 1 0 5.4M17.5 14.6A6 6 0 0 1 21 20',
  local: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  online: 'M3 5h18v11H3ZM8 20h8M12 16v4',
  entrega: 'M2 6h11v10H2ZM13 10h4l3 3v3h-7M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  garantia: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3ZM9 12l2 2 4-4',
  estrela: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  calendario: 'M4 6h16v14H4ZM4 10h16M8 3v4M16 3v4',
  coracao: 'M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z',
  mensagem: 'M4 5h16v11H9l-5 4V5Z'
});

export function highlightIconSvg(code) {
  const path = HIGHLIGHT_ICON_PATHS[code];
  if (!path) return '';
  return `<svg class="storefront-highlight-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
