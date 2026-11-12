/**
 * Utility functions for parsing and exporting menu catalog CSVs in the browser.
 * UTF-8 BOM, ';' separator, comma decimal.
 */

// Helper to normalize category/item names for matching/upsert keys
export function normalizeKey(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Simple but robust CSV parser supporting quoted strings with double quotes
export function parseCSV(text) {
  if (!text) return [];
  
  // Remove leading/trailing newlines and spaces
  let cleanText = text.trim();
  if (cleanText.charCodeAt(0) === 0xFEFF || cleanText.startsWith('\uFEFF')) {
    cleanText = cleanText.substring(1);
  }

  // Detect separator from the first line
  const firstLine = cleanText.split(/\r?\n/)[0] || '';
  const separator = firstLine.includes(';') ? ';' : (firstLine.includes(',') ? ',' : ';');

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
          // Escaped quote "" -> "
          currentValue += '"';
          i++; // skip next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === separator) {
        row.push(currentValue);
        currentValue = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentValue);
        currentValue = '';
        if (row.some(val => val !== '')) {
          lines.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
      } else {
        currentValue += char;
      }
    }
  }

  // Handle final unfinished line
  if (currentValue !== '' || row.length > 0) {
    row.push(currentValue);
    if (row.some(val => val !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

// Convert a BRL price string (e.g. "25,00", "49,90", "15", "R$ 15,00") into cents integer
export function parsePriceToCents(valStr) {
  if (!valStr || !valStr.trim()) return 0;
  
  let clean = valStr.trim()
    .replace('R$', '')
    .replace(/\s/g, '')
    .trim();
    
  if (clean === '' || clean === '0' || clean === '0,00') return 0;

  // Regex validation for standard Brazilian format: optional decimals after comma
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
  
  return (reais * 100) + centavos;
}

// Convert cents integer to BRL comma decimal string
export function formatPriceCentsToCSV(priceCents) {
  if (typeof priceCents !== 'number' || isNaN(priceCents) || priceCents < 0) {
    return '0,00';
  }
  const reais = Math.floor(priceCents / 100);
  const centavos = String(priceCents % 100).padStart(2, '0');
  return `${reais},${centavos}`;
}

// Parse boolean field from standard Portuguese and boolean options
export function parseActiveFlag(valStr) {
  if (!valStr) return true; // Default is active if empty
  const clean = valStr.trim().toLowerCase();
  
  const truthy = ['sim', 's', 'true', '1', 'ativo', 'yes', 'y'];
  const falsy = ['nao', 'não', 'n', 'false', '0', 'oculto', 'no'];
  
  if (truthy.includes(clean)) return true;
  if (falsy.includes(clean)) return false;
  
  return null; // invalid option
}

// Process imported CSV text and return preview structure
export function parseImportCatalogCSV(text, catalogType = 'products') {
  const rows = parseCSV(text);
  if (rows.length === 0) {
    return {
      validRows: [],
      errors: ['Planilha vazia ou sem linhas válidas.'],
      summary: { validCount: 0, errorCount: 1, newCategoriesCount: 0, updatedItemsCount: 0, addedItemsCount: 0 }
    };
  }

  const header = rows[0].map(h => h.trim().toLowerCase());
  const expectedCols = catalogType === 'booking' 
    ? ['categoria', 'nome', 'descricao', 'preco', 'duracao_min', 'ativo']
    : ['categoria', 'nome', 'descricao', 'preco', 'quantidade_minima', 'ativo'];

  // Basic column check
  const missingCols = [];
  expectedCols.forEach(col => {
    if (!header.includes(col)) {
      missingCols.push(col);
    }
  });

  if (missingCols.length > 0) {
    return {
      validRows: [],
      errors: [`Colunas obrigatórias ausentes na planilha: ${missingCols.join(', ')}`],
      summary: { validCount: 0, errorCount: 1, newCategoriesCount: 0, updatedItemsCount: 0, addedItemsCount: 0 }
    };
  }

  const colIndices = {};
  expectedCols.forEach(col => {
    colIndices[col] = header.indexOf(col);
  });

  const validRows = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) {
      continue; // Skip empty rows
    }

    const lineNum = i + 1;
    const itemErrors = [];

    const categoriaRaw = row[colIndices['categoria']] || '';
    const nomeRaw = row[colIndices['nome']] || '';
    const descricaoRaw = row[colIndices['descricao']] || '';
    const precoRaw = row[colIndices['preco']] || '';
    const extraRaw = catalogType === 'booking' 
      ? (row[colIndices['duracao_min']] || '')
      : (row[colIndices['quantidade_minima']] || '');
    const ativoRaw = row[colIndices['ativo']] || '';

    // 1. Categoria validation
    const categoria = categoriaRaw.trim();
    if (!categoria || categoria.length > 160) {
      itemErrors.push(`categoria: informe o nome da categoria (1 a 160 caracteres).`);
    }

    // 2. Nome validation
    const nome = nomeRaw.trim();
    if (!nome || nome.length > 160) {
      itemErrors.push(`nome: informe o nome do item (1 a 160 caracteres).`);
    }

    // 3. Descrição validation
    const descricao = descricaoRaw.trim();
    if (descricao.length > 280) {
      itemErrors.push(`descricao: a descrição deve ter no máximo 280 caracteres.`);
    }

    // 4. Preço validation
    let priceCents = 0;
    if (catalogType === 'quote' && (!precoRaw || precoRaw.trim() === '')) {
      priceCents = 0;
    } else {
      const parsedPrice = parsePriceToCents(precoRaw);
      if (parsedPrice === null) {
        itemErrors.push(`preço: use o formato brasileiro, ex: 25,00`);
      } else {
        priceCents = parsedPrice;
      }
      if (catalogType !== 'quote' && priceCents <= 0 && parsedPrice !== null) {
        itemErrors.push(`preço: deve ser maior que R$ 0,00`);
      }
    }

    // 5. Extra Validation (MinQty / Duration)
    let minQuantity = 1;
    let durationMinutes = 30;

    if (catalogType === 'booking') {
      const val = extraRaw.trim();
      if (val !== '') {
        const parsedDur = parseInt(val, 10);
        if (isNaN(parsedDur) || parsedDur < 5 || parsedDur > 480) {
          itemErrors.push(`duracao_min: informe a duração em minutos (entre 5 e 480).`);
        } else {
          durationMinutes = parsedDur;
        }
      }
    } else {
      const val = extraRaw.trim();
      if (val !== '') {
        const parsedMin = parseInt(val, 10);
        if (isNaN(parsedMin) || parsedMin < 1 || parsedMin > 99) {
          itemErrors.push(`quantidade_minima: informe um número inteiro entre 1 e 99.`);
        } else {
          minQuantity = parsedMin;
        }
      }
    }

    // 6. Ativo validation
    const active = parseActiveFlag(ativoRaw);
    if (active === null) {
      itemErrors.push(`ativo: use 'sim' ou 'nao'.`);
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

  const summary = {
    validCount: validRows.length,
    errorCount: errors.length,
    newCategoriesCount: 0,
    updatedItemsCount: 0,
    addedItemsCount: 0
  };

  return {
    validRows,
    errors,
    summary
  };
}

// Apply validRows onto an existing catalog content structure (cloned content object)
export function applyCSVToCatalog(content, validRows, mode = 'merge') {
  const cloned = structuredClone(content);
  if (!cloned.categories) cloned.categories = [];

  if (mode === 'replace') {
    cloned.categories = [];
  }

  // Pre-build index of existing items by normalized (category::name) to perform upsert
  const itemIndex = new Map(); // key -> { category, item, categoryIdx, itemIdx }
  cloned.categories.forEach((cat, catIdx) => {
    const catNorm = normalizeKey(cat.name);
    if (!cat.items) cat.items = [];
    cat.items.forEach((item, itemIdx) => {
      const itemNorm = normalizeKey(item.name);
      itemIndex.set(`${catNorm}::${itemNorm}`, { category: cat, item, categoryIdx: catIdx, itemIdx });
    });
  });

  validRows.forEach(row => {
    const catNorm = normalizeKey(row.categoria);
    const itemNorm = normalizeKey(row.nome);
    const key = `${catNorm}::${itemNorm}`;

    if (itemIndex.has(key)) {
      // Update existing item, preserve imageUrl and id
      const { item } = itemIndex.get(key);
      item.description = row.descricao;
      item.priceCents = row.priceCents;
      if (row.minQuantity !== undefined) item.minQuantity = row.minQuantity;
      if (row.durationMinutes !== undefined) item.durationMinutes = row.durationMinutes;
      item.active = row.active;
    } else {
      // Find or create category
      let category = cloned.categories.find(c => normalizeKey(c.name) === catNorm);
      if (!category) {
        category = {
          id: `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: row.categoria,
          items: []
        };
        cloned.categories.push(category);
      }
      
      // Create new item
      const newItem = {
        id: `item-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        name: row.nome,
        description: row.descricao,
        priceCents: row.priceCents,
        active: row.active
      };
      if (row.minQuantity !== undefined) newItem.minQuantity = row.minQuantity;
      if (row.durationMinutes !== undefined) newItem.durationMinutes = row.durationMinutes;
      
      category.items.push(newItem);
      
      // Index it in case we have duplicates in the same CSV
      itemIndex.set(key, { category, item: newItem, categoryIdx: cloned.categories.length - 1, itemIdx: category.items.length - 1 });
    }
  });

  return cloned;
}

// Convert active catalog content into a CSV string
export function exportCatalogToCSV(content) {
  const catalogType = content.catalogType || 'products';
  let csvContent = '\uFEFF'; // Add UTF-8 BOM

  if (catalogType === 'booking') {
    csvContent += 'categoria;nome;descricao;preco;duracao_min;ativo\r\n';
  } else {
    csvContent += 'categoria;nome;descricao;preco;quantidade_minima;ativo\r\n';
  }

  const categories = content.categories || [];
  categories.forEach(cat => {
    const catName = cat.name || '';
    const items = cat.items || [];
    items.forEach(item => {
      const name = item.name || '';
      const desc = item.description || '';
      const price = formatPriceCentsToCSV(item.priceCents);
      const active = item.active !== false ? 'sim' : 'nao';
      
      // Helper to quote values containing semicolon, quote or newline
      const quote = (val) => {
        const str = String(val);
        if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(',')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

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
