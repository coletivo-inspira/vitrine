import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BRAZIL_STATES,
  CITY_NAME_MAX_LENGTH,
  PROFILE_CITY_MAX_LENGTH,
  findStateUf,
  parseProfileCity,
  formatProfileCity,
  matchMunicipio,
  loadMunicipios
} from '../web/portal/br-locations.js';
import { validateProfileInput } from '../src/portal-validation.mjs';

const dataDir = new URL('../web/portal/data/municipios/', import.meta.url);
const portalHtml = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');

test('lista as 27 unidades da federação sem repetição', () => {
  assert.equal(BRAZIL_STATES.length, 27);
  assert.equal(new Set(BRAZIL_STATES.map((s) => s.uf)).size, 27);
  assert.ok(BRAZIL_STATES.every((s) => /^[A-Z]{2}$/.test(s.uf) && s.name.length > 3));
});

test('cada UF tem um arquivo estático de municípios ordenado em pt-BR', async () => {
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  let total = 0;
  for (const { uf } of BRAZIL_STATES) {
    const names = JSON.parse(await readFile(new URL(`${uf}.json`, dataDir), 'utf8'));
    assert.ok(Array.isArray(names) && names.length > 0, uf);
    assert.ok(names.every((n) => typeof n === 'string' && n.trim() === n && n.length <= CITY_NAME_MAX_LENGTH), uf);
    assert.deepEqual([...names].sort(collator.compare), names, `${uf} ordenado`);
    total += names.length;
  }
  assert.ok(total > 5500, `total ${total}`);
  const rs = JSON.parse(await readFile(new URL('RS.json', dataDir), 'utf8'));
  assert.ok(rs.includes('Porto Alegre'));
  const sp = JSON.parse(await readFile(new URL('SP.json', dataDir), 'utf8'));
  assert.ok(sp.includes('São Paulo'));
});

test('reconhece sigla ou nome do estado sem diferenciar acentos', () => {
  assert.equal(findStateUf('rs'), 'RS');
  assert.equal(findStateUf('Sao Paulo'), 'SP');
  assert.equal(findStateUf('Paraíba'), 'PB');
  assert.equal(findStateUf('Atlântida'), '');
});

test('lê valores antigos de cidade em estado e cidade', () => {
  assert.deepEqual(parseProfileCity('Porto Alegre, RS'), { uf: 'RS', city: 'Porto Alegre' });
  assert.deepEqual(parseProfileCity('Porto Alegre - rs'), { uf: 'RS', city: 'Porto Alegre' });
  assert.deepEqual(parseProfileCity('Porto Alegre/RS'), { uf: 'RS', city: 'Porto Alegre' });
  assert.deepEqual(parseProfileCity('Porto Alegre RS'), { uf: 'RS', city: 'Porto Alegre' });
  assert.deepEqual(parseProfileCity('Campinas, São Paulo'), { uf: 'SP', city: 'Campinas' });
  assert.deepEqual(parseProfileCity('Xique-Xique - BA'), { uf: 'BA', city: 'Xique-Xique' });
  assert.deepEqual(parseProfileCity('Embu-Guaçu, SP'), { uf: 'SP', city: 'Embu-Guaçu' });
  assert.deepEqual(parseProfileCity('MG'), { uf: 'MG', city: '' });
  assert.deepEqual(parseProfileCity(''), { uf: '', city: '' });
});

test('texto antigo sem estado reconhecível é mantido inteiro', () => {
  assert.deepEqual(parseProfileCity('Zona Sul de POA'), { uf: '', city: 'Zona Sul de POA' });
  assert.deepEqual(parseProfileCity('Embu-Guaçu'), { uf: '', city: 'Embu-Guaçu' });
  // Nome de estado sozinho costuma ser a capital, não o estado.
  assert.deepEqual(parseProfileCity('São Paulo'), { uf: '', city: 'São Paulo' });
});

test('grava "Cidade, UF" dentro do limite e da validação do servidor', () => {
  assert.equal(formatProfileCity('Porto Alegre', 'RS'), 'Porto Alegre, RS');
  assert.equal(formatProfileCity('  Porto   Alegre ', 'rs'), 'Porto Alegre, RS');
  assert.equal(formatProfileCity('', 'SP'), 'SP');
  assert.equal(formatProfileCity('Texto livre', ''), 'Texto livre');
  assert.equal(formatProfileCity('', ''), '');
  const long = formatProfileCity('x'.repeat(200), 'MG');
  assert.equal(long.length, PROFILE_CITY_MAX_LENGTH);
  for (const city of ['Porto Alegre, RS', long, 'SP']) {
    assert.equal(validateProfileInput({ city }).city, city);
  }
});

test('formatar e ler de volta preserva estado e cidade', () => {
  for (const [city, uf] of [['Porto Alegre', 'RS'], ['Xique-Xique', 'BA'], ["Olho d'Água das Flores", 'AL'], ['Brasília', 'DF']]) {
    assert.deepEqual(parseProfileCity(formatProfileCity(city, uf)), { uf, city });
  }
});

test('casa o nome digitado com o município oficial ignorando acentos e caixa', () => {
  const names = ['Porto Alegre', 'São Leopoldo', 'Gramado'];
  assert.equal(matchMunicipio('sao leopoldo', names), 'São Leopoldo');
  assert.equal(matchMunicipio(' PORTO  ALEGRE ', names), 'Porto Alegre');
  assert.equal(matchMunicipio('Canela', names), null);
  assert.equal(matchMunicipio('', names), null);
});

test('carrega a lista do próprio site e guarda em cache', async () => {
  const requested = [];
  const fakeFetch = async (url) => {
    requested.push(String(url));
    const body = await readFile(url, 'utf8');
    return { ok: true, json: async () => JSON.parse(body) };
  };
  const first = await loadMunicipios('rr', fakeFetch);
  const second = await loadMunicipios('RR', fakeFetch);
  assert.equal(first, second);
  assert.equal(requested.length, 1);
  assert.match(requested[0], /\/web\/portal\/data\/municipios\/RR\.json$/);
  assert.deepEqual(await loadMunicipios('XX', fakeFetch), []);
});

test('falha de carregamento não fica presa no cache', async () => {
  let calls = 0;
  const failing = async () => {
    calls += 1;
    return { ok: false, status: 500 };
  };
  await assert.rejects(loadMunicipios('AP', failing));
  await assert.rejects(loadMunicipios('AP', failing));
  assert.equal(calls, 2);
});

test('o Perfil e o primeiro acesso separam Estado e Cidade e o WhatsApp usa máscara', () => {
  for (const prefix of ['profile', 'gate']) {
    assert.match(portalHtml, new RegExp(`<label for="${prefix}-state">Estado</label>`));
    assert.match(portalHtml, new RegExp(`<select id="${prefix}-state"[^>]*>`));
    assert.match(portalHtml, new RegExp(`<label for="${prefix}-city">Cidade</label>`));
    assert.match(portalHtml, new RegExp(`<input[^>]*id="${prefix}-city"[^>]*list="${prefix}-city-options"[^>]*disabled>`));
    assert.match(portalHtml, new RegExp(`<datalist id="${prefix}-city-options"></datalist>`));
    assert.match(portalHtml, new RegExp(`id="${prefix}-whatsapp"[^>]*placeholder="\\+55 \\(51\\) 99999-9999"`));
  }
  assert.match(portalHtml, /<label for="editor-whatsapp">WhatsApp para pedidos<\/label>/);
  assert.doesNotMatch(portalHtml, /Cidade \/ Estado|somente dígitos/);
});
