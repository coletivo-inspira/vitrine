import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCSV,
  parsePriceToCents,
  parseActiveFlag,
  parseImportCatalogCSV,
  applyCSVToCatalog,
  exportCatalogToCSV
} from '../web/portal/csv-catalog.js';

test('parseCSV - handles empty string and BOM', () => {
  const empty = parseCSV('');
  assert.deepEqual(empty, []);

  const bomAndSimple = parseCSV('\uFEFFa;b;c\r\n1;2;3');
  assert.deepEqual(bomAndSimple, [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parseCSV - parses quoted fields with semicolons and escaped quotes', () => {
  const csv = 'col1;col2;col3\r\n"val;1";"val ""2""";val3';
  const parsed = parseCSV(csv);
  assert.deepEqual(parsed, [
    ['col1', 'col2', 'col3'],
    ['val;1', 'val "2"', 'val3']
  ]);
});

test('parsePriceToCents - formats Portuguese decimal strings and handles currency prefixes', () => {
  assert.equal(parsePriceToCents('25,00'), 2500);
  assert.equal(parsePriceToCents('49,90'), 4990);
  assert.equal(parsePriceToCents(' R$  12,34 '), 1234);
  assert.equal(parsePriceToCents('5'), 500);
  assert.equal(parsePriceToCents('0,00'), 0);
  assert.equal(parsePriceToCents(''), 0);
  assert.equal(parsePriceToCents('invalid'), null);
});

test('parseActiveFlag - parses common Brazilian truthy/falsy values', () => {
  assert.equal(parseActiveFlag('sim'), true);
  assert.equal(parseActiveFlag('s'), true);
  assert.equal(parseActiveFlag('true'), true);
  assert.equal(parseActiveFlag('ativo'), true);
  
  assert.equal(parseActiveFlag('nao'), false);
  assert.equal(parseActiveFlag('não'), false);
  assert.equal(parseActiveFlag('n'), false);
  assert.equal(parseActiveFlag('oculto'), false);
  
  assert.equal(parseActiveFlag('maybe'), null);
});

test('parseImportCatalogCSV - products spreadsheet processing with preview errors', () => {
  const csv = `categoria;nome;descricao;preco;quantidade_minima;ativo
Pizzas;Margherita;Molho e queijo;25,00;1;sim
Bebidas;Refrigerante;Lata;invalid_price;2;nao
Outra;Invalido;Desc;10,00;invalid_qty;maybe`;

  const { validRows, errors, summary } = parseImportCatalogCSV(csv, 'products');

  assert.equal(validRows.length, 1);
  assert.equal(validRows[0].nome, 'Margherita');
  assert.equal(validRows[0].priceCents, 2500);
  assert.equal(validRows[0].active, true);

  assert.equal(errors.length, 2);
  assert.match(errors[0], /preço: use o formato brasileiro/);
  assert.match(errors[1], /quantidade_minima: informe um número inteiro/);
  assert.match(errors[1], /ativo: use 'sim' ou 'nao'/);

  assert.equal(summary.validCount, 1);
  assert.equal(summary.errorCount, 2);
});

test('applyCSVToCatalog - can merge or replace, performing upsert without duplicating', () => {
  const initialContent = {
    template: 'products-v1',
    catalogType: 'products',
    categories: [
      {
        id: 'cat-1',
        name: 'Pizzas',
        items: [
          { id: 'item-1', name: 'Margherita', description: 'Antiga', priceCents: 1500, active: true }
        ]
      }
    ]
  };

  const validRows = [
    { categoria: 'Pizzas', nome: 'Margherita', descricao: 'Nova', priceCents: 2500, minQuantity: 1, active: true },
    { categoria: 'Bebidas', nome: 'Soda', descricao: 'Gelada', priceCents: 1000, minQuantity: 2, active: true }
  ];

  // Merge mode
  const merged = applyCSVToCatalog(initialContent, validRows, 'merge');
  assert.equal(merged.categories.length, 2);
  const pizzaCat = merged.categories.find(c => c.name === 'Pizzas');
  assert.equal(pizzaCat.items.length, 1);
  assert.equal(pizzaCat.items[0].id, 'item-1'); // preserves ID!
  assert.equal(pizzaCat.items[0].description, 'Nova');
  assert.equal(pizzaCat.items[0].priceCents, 2500);

  // Replace mode
  const replaced = applyCSVToCatalog(initialContent, validRows, 'replace');
  assert.equal(replaced.categories.length, 2);
  const pizzaCatRep = replaced.categories.find(c => c.name === 'Pizzas');
  assert.equal(pizzaCatRep.items.length, 1);
  assert.notEqual(pizzaCatRep.items[0].id, 'item-1'); // generated new ID
});

test('exportCatalogToCSV - generates CSV correctly matching format', () => {
  const content = {
    catalogType: 'products',
    categories: [
      {
        name: 'Pizzas',
        items: [
          { name: 'Margherita', description: 'Molho; queijo', priceCents: 2550, minQuantity: 1, active: true }
        ]
      }
    ]
  };

  const csv = exportCatalogToCSV(content);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('categoria;nome;descricao;preco;quantidade_minima;ativo'));
  assert.ok(csv.includes('Pizzas;Margherita;"Molho; queijo";25,50;1;sim'));
});
