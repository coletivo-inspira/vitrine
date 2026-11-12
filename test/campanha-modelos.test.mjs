import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ciclo, formatarPreco, modelos, roteiro, totais } from '../carrossel-instagram/2026-11-profundidade-e-movimento/fonte/campanha.mjs';
import { criarLinhaDoTempo, passos } from '../carrossel-instagram/2026-11-profundidade-e-movimento/fonte/linha-do-tempo.mjs';
import { renderizarModelo } from '../carrossel-instagram/2026-11-profundidade-e-movimento/fonte/modelos.mjs';
import { paginasDeVideo } from '../carrossel-instagram/2026-11-profundidade-e-movimento/fonte/videos.mjs';
import { sintetizar } from '../carrossel-instagram/2026-11-profundidade-e-movimento/fonte/audio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = id => renderizarModelo(id, { imagem: nome => `apoio/${nome}.jpg` });

test('preços e totais exibidos correspondem aos itens escolhidos', () => {
  assert.equal(formatarPreco(4200), 'R$ 42,00');
  assert.equal(formatarPreco(123456), 'R$ 1.234,56');
  assert.equal(totais('cardapio').total, 4200);
  assert.deepEqual([totais('lanches').total, totais('lanches').totalDepois], [3200, 6400]);
  assert.equal(totais('servicos').item.preco, 38000);
  assert.match(site('cardapio').svg, /Total: R\$ 42,00/);
  assert.match(site('lanches').svg, /R\$ 32,00[\s\S]*R\$ 64,00/);
  assert.match(site('lanches').svg, /2× Combo Clássico/);
  assert.match(site('servicos').svg, /a partir de R\$ 380,00/);
});

test('cada modelo tem ciclo de 4 s, transições curtas e retorno sem salto', () => {
  const prefixos = new Set();
  for (const m of modelos) {
    const { trilhas, duracao } = site(m.id);
    assert.equal(duracao, 4);
    assert.ok(!prefixos.has(m.prefixo));
    prefixos.add(m.prefixo);
    assert.ok(trilhas.length > 10, `${m.id} precisa de ações visíveis`);
    for (const { classe, paradas } of trilhas) {
      assert.ok(classe.startsWith(`${m.prefixo}-`), classe);
      assert.equal(paradas.at(-1)[0], 4);
      assert.deepEqual(paradas.at(-1)[1], paradas[0][1], `${classe} precisa terminar no estado inicial`);
      for (let i = 1; i < paradas.length; i += 1) {
        if (JSON.stringify(paradas[i][1]) === JSON.stringify(paradas[i - 1][1])) continue;
        const passo = Math.round((paradas[i][0] - paradas[i - 1][0]) * 1000) / 1000;
        assert.ok(passo >= ciclo.transicaoMin && passo <= ciclo.transicaoMax, `${classe}: ${passo}s`);
      }
    }
  }
  assert.throws(() => criarLinhaDoTempo({ prefixo: 'x' }).trilha('rapida', [[0, { o: 0 }], [0.1, { o: 1 }]]), /fora de/);
  // Sem retorno explícito, o fechamento do loop viraria uma transição longa ou um salto.
  assert.throws(() => criarLinhaDoTempo({ prefixo: 'x' }).trilha('salto', passos({ o: 0 }, [[1, { o: 1 }]])), /fora de/);
});

test('SVGs dos modelos são autocontidos, sem scripts e com identificadores exclusivos', async () => {
  for (const m of modelos) {
    const { svg } = site(m.id);
    assert.doesNotMatch(svg, /<script|<foreignObject|javascript:|https?:\/\/(?!www\.w3\.org)/i);
    for (const [, id] of svg.matchAll(/\bid="([^"]+)"/g)) assert.ok(id.startsWith(`${m.prefixo}-`), id);
    for (const [, nome] of svg.matchAll(/@keyframes ([\w-]+)/g)) assert.ok(nome.startsWith(`${m.prefixo}-`), nome);
    for (const [, href] of svg.matchAll(/<image[^>]+href="([^"]+)"/g)) assert.match(href, /^apoio\/[a-z-]+\.jpg$/);
    assert.match(svg, /Demonstração ilustrativa/);
    assert.doesNotMatch(svg.replace(/<[^>]*>/g, ' '), /cardápio|catálogo/i);
    const publicado = await readFile(resolve(root, `web/assets/modelos/${m.id}.svg`), 'utf8');
    assert.equal(publicado, svg, `web/assets/modelos/${m.id}.svg está desatualizado; rode o exportador (etapa site)`);
    for (const ext of ['png', 'webp']) assert.ok((await stat(resolve(root, `web/assets/modelos/${m.id}.${ext}`))).size > 0);
  }
  const avulso = renderizarModelo('cardapio', { imagem: () => 'data:image/jpeg;base64,AA==', fontesCss: '@font-face{font-family:Syne;src:url(data:font/woff;base64,AA==)}' }).svg;
  assert.doesNotMatch(avulso, /href="(?!data:|#)/);
});

test('Possibilidades oferece PNG estático, SVG local e controle de pausa por modelo', async () => {
  const html = await readFile(resolve(root, 'web/possibilidades/index.html'), 'utf8');
  assert.match(html, /<script src="\.\.\/model-demos\.js" defer><\/script>/);
  for (const m of modelos) {
    const figura = html.match(new RegExp(`<figure class="model-demo" data-demo="${m.id}" data-svg="\\.\\./assets/modelos/${m.id}\\.svg">([\\s\\S]*?)</figure>`));
    assert.ok(figura, `figura de ${m.id}`);
    assert.match(figura[1], new RegExp(`<img src="\\.\\./assets/modelos/${m.id}\\.png" width="1200" height="900"`));
    assert.ok(figura[1].includes(`alt="${m.altTexto}"`), `alt de ${m.id} igual ao da campanha`);
    assert.match(figura[1], /<button class="model-demo-toggle" type="button" aria-pressed="false" hidden>/);
    assert.ok(figura[1].includes(`<span class="model-demo-name">${m.nomeSite}</span>`));
  }
  const script = await readFile(resolve(root, 'web/model-demos.js'), 'utf8');
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /origin !== location\.origin/);
});

test('roteiro dos vídeos: 20 s, cenas de 2 + 4×4 + 2 s e efeitos dentro da duração', () => {
  assert.deepEqual(roteiro.cenas.map(c => c.fim - c.inicio), [2, 4, 4, 4, 4, 2]);
  for (const video of paginasDeVideo()) {
    assert.ok(video.sinais.length >= 20);
    assert.ok(video.sinais.every(s => s.t >= 0 && s.t < roteiro.duracao));
    assert.ok(video.sinais.some(s => s.tipo === 'assinatura' && s.t > 18));
    assert.ok(video.sinais.some(s => s.tipo === 'toque' && s.t < 1), 'ação concreta logo na abertura');
    assert.doesNotMatch(video.html, /<script/);
    const audio = sintetizar(video.sinais, roteiro.duracao);
    assert.equal(audio.length, roteiro.duracao * 48000);
    assert.ok(audio.reduce((pico, amostra) => Math.max(pico, Math.abs(amostra)), 0) <= 0.71);
  }
});

test('build publica as demonstrações e suas imagens locais', async () => {
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });
  for (const arquivo of ['model-demos.js', 'assets/modelos/cardapio.svg', 'assets/modelos/portfolio.webp', 'assets/modelos/apoio/prato-moqueca.jpg']) {
    assert.ok((await stat(resolve(root, 'dist', arquivo))).isFile(), arquivo);
  }
  const publicado = await readFile(resolve(root, 'dist/possibilidades/index.html'), 'utf8');
  assert.doesNotMatch(publicado.replace(/<[^>]*>/g, ' '), /cardápio|catálogo/i);
});
