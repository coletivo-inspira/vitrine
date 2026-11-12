function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(`Invalid ${field}`);
  return value.trim();
}

export function publishedPortfolio(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.entries)) throw new TypeError('Invalid portfolio');
  const ids = new Set();
  return catalog.entries.filter(entry => entry?.published === true).map(entry => {
    const id = text(entry.id, 'id', 64);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new TypeError('Invalid or duplicate id');
    ids.add(id);
    const url = new URL(text(entry.url, 'url', 2048));
    if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Use a public HTTPS URL without credentials');
    if (!Number.isSafeInteger(entry.order) || entry.order < 0) throw new TypeError('Invalid order');
    if (!Array.isArray(entry.tags) || entry.tags.length > 8) throw new TypeError('Invalid tags');
    return { id, title: text(entry.title, 'title', 120), url: url.href,
      summary: text(entry.summary, 'summary', 600), category: text(entry.category, 'category', 80),
      tags: entry.tags.map(tag => text(tag, 'tag', 40)), order: entry.order,
      featured: entry.featured === true };
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function quoteContactLink(teamPhone, publishedCase = null) {
  // A missing phone means the interface must not display an active contact button.
  if (!teamPhone) return null;
  if (typeof teamPhone !== 'string' || !/^[1-9]\d{7,14}$/.test(teamPhone)) throw new TypeError('Invalid team phone');
  const reference = publishedCase
    ? ` Tenho como referência ${text(publishedCase.title, 'title', 120)} (${text(publishedCase.id, 'id', 64)}).`
    : '';
  return `https://wa.me/${teamPhone}?text=${encodeURIComponent(`Olá, Mila! Eu estava vendo a Vitrine Inspira e fiquei interessado em fazer um orçamento.${reference}`)}`;
}
