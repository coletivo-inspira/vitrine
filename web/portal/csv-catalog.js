/**
 * Client-side CSV parser, preview validator, upsert applier, and exporter for Vitrine Inspira.
 * UTF-8 BOM, ';' separator (also accepts ',' when header uses commas), comma decimals (25,00).
 * Zero external dependencies.
 */

const DANGEROUS_CSV_TEXT_PATTERN =
  /\b(?:javascript|vbscript)\s*:|(?:^|[\s"'=(])data\s*:|<\s*\/?\s*(?:script|iframe|object|embed|svg|img|style|link|meta)\b|\bon[a-z]+\s*=/i;

const utf8Encoder = new TextEncoder();

export function normalizeKey(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseCSV(text) {
  if (!text) return [];

  let cleanText = text.trim();
  if (cleanText.charCodeAt(0) === 0xfeff || cleanText.startsWith('\uFEFF')) {
    cleanText = cleanText.substring(1);
  }

  const firstLine = cleanText.split(/\r?\n/)[0] || '';
  const separator = firstLine.includes(';') ? ';' : firstLine.includes(',') ? ',' : ';';

  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentValue = '';

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === separator) {
      row.push(currentValue);
      currentValue = '';
    } else if (char === '\r' || char === '\n') {
      row.push(currentValue);
      currentValue = '';
      if (row.some((val) => val !== '')) {
        lines.push(row);
      }
      row = [];
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentValue += char;
    }
  }

  if (currentValue !== '' || row.length > 0) {
    row.push(currentValue);
    if (row.some((val) => val !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

export function parsePriceToCents(valStr) {
  if (!valStr || !valStr.trim()) return 0;

  const clean = valStr
    .trim()
    .replace('R$', '')
    .replace(/\s/g, '')
    .trim();

  if (clean === '' || clean === '0' || clean === '0,00') return 0;

  const brFormat = /^\d+(?:,\d{1,2})?$/;
  if (!brFormat.test(clean)) {
    return null;
  }

  const parts = clean.split(',');
  const reais = parseInt(parts[0], 10) || 0;
  let centavos = 0;
  if (parts[1]) {
    centavos = parseInt(parts[1].padEnd(2, '0').slice(0, 2), 10) || 0;
  }

  return reais * 100 + centavos;
}

export function formatPriceCentsToCSV(priceCents) {
  if (typeof priceCents !== 'number' || Number.isNaN(priceCents) || priceCents < 0) {
    return '0,00';
  }
  const reais = Math.floor(priceCents / 100);
  const centavos = String(priceCents % 100).padStart(2, '0');
  return `${reais},${centavos}`;
}

export function parseActiveFlag(valStr) {
  if (!valStr || !valStr.trim()) return true;
  const clean = valStr.trim().toLowerCase();

  const truthy = ['sim', 's', 'true', '1', 'ativo', 'yes', 'y'];
  const falsy = ['nao', 'não', 'n', 'false', '0', 'oculto', 'no'];

  if (truthy.includes(clean)) return true;
  if (falsy.includes(clean)) return false;

  return null;
}

export function parseImportCatalogCSV(text, catalogType = 'products', existingContent = null) {
  const rows = parseCSV(text);
  if (rows.length === 0) {
    return {
      validRows: [],
      errors: ['Planilha vazia ou sem linhas válidas.'],
      summary: {
        validCount: 0,
        errorCount: 1,
        newCategoriesCount: 0,
        updatedItemsCount: 0,
        addedItemsCount: 0
      }
    };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const expectedCols =
    catalogType === 'booking'
      ? ['categoria', 'nome', 'descricao', 'preco', 'duracao_min', 'ativo']
      : ['categoria', 'nome', 'descricao', 'preco', 'quantidade_minima', 'ativo'];

  const missingCols = expectedCols.filter((col) => !header.includes(col));
  if (missingCols.length > 0) {
    return {
      validRows: [],
      errors: [`Colunas obrigatórias ausentes na planilha: ${missingCols.join(', ')}`],
      summary: {
        validCount: 0,
        errorCount: 1,
        newCategoriesCount: 0,
        updatedItemsCount: 0,
        addedItemsCount: 0
      }
    };
  }

  const colIndices = {};
  expectedCols.forEach((col) => {
    colIndices[col] = header.indexOf(col);
  });

  const validRows = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every((cell) => !cell || !cell.trim())) {
      continue;
    }

    const lineNum = i + 1;
    const itemErrors = [];

    const categoriaRaw = row[colIndices.categoria] || '';
    const nomeRaw = row[colIndices.nome] || '';
    const descricaoRaw = row[colIndices.descricao] || '';
    const precoRaw = row[colIndices.preco] || '';
    const extraRaw =
      catalogType === 'booking'
        ? row[colIndices.duracao_min] || ''
        : row[colIndices.quantidade_minima] || '';
    const ativoRaw = row[colIndices.ativo] || '';

    const categoria = categoriaRaw.trim();
    if (!categoria || categoria.length > 160 || DANGEROUS_CSV_TEXT_PATTERN.test(categoria)) {
      itemErrors.push('categoria: informe o nome da categoria (1 a 160 caracteres válidos).');
    }

    const nome = nomeRaw.trim();
    if (!nome || nome.length > 160 || DANGEROUS_CSV_TEXT_PATTERN.test(nome)) {
      itemErrors.push('nome: informe o nome do item (1 a 160 caracteres válidos).');
    }

    const descricao = descricaoRaw.trim();
    if (descricao.length > 280 || DANGEROUS_CSV_TEXT_PATTERN.test(descricao)) {
      itemErrors.push('descricao: a descrição deve ter no máximo 280 caracteres válidos.');
    }

    let priceCents = 0;
    if (catalogType === 'quote' && (!precoRaw || precoRaw.trim() === '')) {
      priceCents = 0;
    } else {
      const parsedPrice = parsePriceToCents(precoRaw);
      if (parsedPrice === null) {
        itemErrors.push('preço: use o formato brasileiro, ex: 25,00');
      } else {
        priceCents = parsedPrice;
      }
      if (catalogType !== 'quote' && priceCents <= 0 && parsedPrice !== null) {
        itemErrors.push('preço: deve ser maior que R$ 0,00');
      }
    }

    let minQuantity = 1;
    let durationMinutes = 30;

    if (catalogType === 'booking') {
      const val = extraRaw.trim();
      if (val !== '') {
        if (!/^\d+$/.test(val)) {
          itemErrors.push('duracao_min: informe a duração em minutos (entre 5 e 480).');
        } else {
          const parsedDur = parseInt(val, 10);
          if (parsedDur < 5 || parsedDur > 480) {
            itemErrors.push('duracao_min: informe a duração em minutos (entre 5 e 480).');
          } else {
            durationMinutes = parsedDur;
          }
        }
      }
    } else {
      const val = extraRaw.trim();
      if (val !== '') {
        if (!/^\d+$/.test(val)) {
          itemErrors.push('quantidade_minima: informe um número inteiro entre 1 e 99.');
        } else {
          const parsedMin = parseInt(val, 10);
          if (parsedMin < 1 || parsedMin > 99) {
            itemErrors.push('quantidade_minima: informe um número inteiro entre 1 e 99.');
          } else {
            minQuantity = parsedMin;
          }
        }
      }
    }

    const active = parseActiveFlag(ativoRaw);
    if (active === null) {
      itemErrors.push("ativo: use 'sim' ou 'nao'.");
    }

    if (itemErrors.length > 0) {
      errors.push(`Linha ${lineNum}: ${itemErrors.join(' | ')}`);
    } else {
      validRows.push({
        lineNum,
        categoria,
        nome,
        descricao,
        priceCents,
        minQuantity: catalogType === 'booking' ? undefined : minQuantity,
        durationMinutes: catalogType === 'booking' ? durationMinutes : undefined,
        active: active !== false
      });
    }
  }

  const existingCategories = new Set();
  const existingItemKeys = new Set();
  if (existingContent && Array.isArray(existingContent.categories)) {
    for (const cat of existingContent.categories) {
      const cNorm = normalizeKey(cat?.name);
      if (cNorm) existingCategories.add(cNorm);
      for (const item of cat?.items || []) {
        const iNorm = normalizeKey(item?.name);
        if (cNorm && iNorm) existingItemKeys.add(`${cNorm}::${iNorm}`);
      }
    }
  }

  const seenNewCats = new Set();
  const seenItemKeys = new Set();
  let updatedItemsCount = 0;
  let addedItemsCount = 0;

  for (const row of validRows) {
    const cNorm = normalizeKey(row.categoria);
    const key = `${cNorm}::${normalizeKey(row.nome)}`;
    if (!existingCategories.has(cNorm)) {
      seenNewCats.add(cNorm);
    }
    if (!seenItemKeys.has(key)) {
      seenItemKeys.add(key);
      if (existingItemKeys.has(key)) {
        updatedItemsCount += 1;
      } else {
        addedItemsCount += 1;
      }
    }
  }

  return {
    validRows,
    errors,
    summary: {
      validCount: validRows.length,
      errorCount: errors.length,
      newCategoriesCount: seenNewCats.size,
      updatedItemsCount,
      addedItemsCount
    }
  };
}

export function validateCatalogLimits(content) {
  let totalCount = 0;
  let activeCount = 0;
  for (const cat of content?.categories || []) {
    for (const item of cat?.items || []) {
      totalCount += 1;
      if (item.active !== false) {
        activeCount += 1;
      }
    }
  }
  const byteLength = utf8Encoder.encode(JSON.stringify(content)).length;

  if (activeCount > 20) {
    return {
      ok: false,
      code: 'MAX_ACTIVE_ITEMS_EXCEEDED',
      message: `O resultado teria ${activeCount} itens ativos, acima do limite de 20 itens ativos no plano gratuito.`,
      activeCount,
      totalCount,
      byteLength
    };
  }
  if (totalCount > 100) {
    return {
      ok: false,
      code: 'MAX_TOTAL_ITEMS_EXCEEDED',
      message: `O resultado teria ${totalCount} itens no total, acima do limite máximo de 100 itens.`,
      activeCount,
      totalCount,
      byteLength
    };
  }
  if (byteLength > 262144) {
    return {
      ok: false,
      code: 'DRAFT_TOO_LARGE',
      message: 'O rascunho resultante ultrapassa o limite técnico de 256 KiB.',
      activeCount,
      totalCount,
      byteLength
    };
  }
  return { ok: true, activeCount, totalCount, byteLength };
}

export function applyCSVToCatalog(content, validRows, mode = 'merge') {
  const cloned = structuredClone(content);
  if (!Array.isArray(cloned.categories)) cloned.categories = [];

  // Preserve previous imageUrl map even in replace mode (per catalog-csv-contract.md)
  const previousImagesByKey = new Map();
  for (const cat of cloned.categories) {
    const catNorm = normalizeKey(cat?.name);
    for (const item of cat?.items || []) {
      const itemNorm = normalizeKey(item?.name);
      if (catNorm && itemNorm && typeof item?.imageUrl === 'string' && item.imageUrl.trim()) {
        previousImagesByKey.set(`${catNorm}::${itemNorm}`, item.imageUrl.trim());
      }
    }
  }

  if (mode === 'replace') {
    cloned.categories = [];
  }

  const itemIndex = new Map();
  cloned.categories.forEach((cat, catIdx) => {
    const catNorm = normalizeKey(cat.name);
    if (!Array.isArray(cat.items)) cat.items = [];
    cat.items.forEach((item, itemIdx) => {
      const itemNorm = normalizeKey(item.name);
      itemIndex.set(`${catNorm}::${itemNorm}`, {
        category: cat,
        item,
        categoryIdx: catIdx,
        itemIdx
      });
    });
  });

  let seq = 0;
  validRows.forEach((row) => {
    seq += 1;
    const catNorm = normalizeKey(row.categoria);
    const itemNorm = normalizeKey(row.nome);
    const key = `${catNorm}::${itemNorm}`;

    if (itemIndex.has(key)) {
      const { item } = itemIndex.get(key);
      item.description = row.descricao;
      item.priceCents = row.priceCents;
      if (row.minQuantity !== undefined) item.minQuantity = row.minQuantity;
      if (row.durationMinutes !== undefined) item.durationMinutes = row.durationMinutes;
      item.active = row.active;
    } else {
      let category = cloned.categories.find((c) => normalizeKey(c.name) === catNorm);
      if (!category) {
        category = {
          id: `cat-${Date.now()}-${seq}`,
          name: row.categoria,
          items: []
        };
        cloned.categories.push(category);
      }

      const newItem = {
        id: `item-${Date.now()}-${seq}`,
        name: row.nome,
        description: row.descricao,
        priceCents: row.priceCents,
        active: row.active
      };
      if (previousImagesByKey.has(key)) {
        newItem.imageUrl = previousImagesByKey.get(key);
      }
      if (row.minQuantity !== undefined) newItem.minQuantity = row.minQuantity;
      if (row.durationMinutes !== undefined) newItem.durationMinutes = row.durationMinutes;

      category.items.push(newItem);
      itemIndex.set(key, {
        category,
        item: newItem,
        categoryIdx: cloned.categories.length - 1,
        itemIdx: category.items.length - 1
      });
    }
  });

  return cloned;
}

export function exportCatalogToCSV(content) {
  const catalogType = content?.catalogType || 'products';
  let csvContent = '\uFEFF';

  if (catalogType === 'booking') {
    csvContent += 'categoria;nome;descricao;preco;duracao_min;ativo\r\n';
  } else {
    csvContent += 'categoria;nome;descricao;preco;quantidade_minima;ativo\r\n';
  }

  const quote = (val) => {
    const str = String(val ?? '');
    if (
      str.includes(';') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r') ||
      str.includes(',')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const categories = content?.categories || [];
  categories.forEach((cat) => {
    const catName = cat.name || '';
    const items = cat.items || [];
    items.forEach((item) => {
      const name = item.name || '';
      const desc = item.description || '';
      const price = formatPriceCentsToCSV(item.priceCents);
      const active = item.active !== false ? 'sim' : 'nao';

      if (catalogType === 'booking') {
        const duration = item.durationMinutes || 30;
        csvContent += `${quote(catName)};${quote(name)};${quote(desc)};${price};${duration};${active}\r\n`;
      } else {
        const minQty = item.minQuantity || 1;
        csvContent += `${quote(catName)};${quote(name)};${quote(desc)};${price};${minQty};${active}\r\n`;
      }
    });
  });

  return csvContent;
}
