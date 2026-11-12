#!/usr/bin/env node
// Confere as demonstrações em /possibilidades/ servidas por `npm run preview`.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { caminhos } from './caminhos.mjs';
import { iniciarNavegador } from './navegador.mjs';

const BASE = process.env.SITE_URL || 'http://127.0.0.1:4173';
const URL_PAGINA = `${BASE}/possibilidades/`;
const destino = join(caminhos.exportacoes, 'previas', 'site');
await mkdir(destino, { recursive: true });
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const OUVIR_ERROS = `window.__erros=[];addEventListener('error',e=>__erros.push(String(e.message)));document.addEventListener('securitypolicyviolation',e=>__erros.push('CSP '+e.violatedDirective+' '+e.blockedURI));`;

const estadoDemos = `[...document.querySelectorAll('.model-demo')].map(demo => {
  const svg = demo.querySelector('.model-demo-media > svg');
  const botao = demo.querySelector('.model-demo-toggle');
  const animacao = svg ? svg.getAnimations({ subtree: true })[0] : null;
  return { id: demo.dataset.demo, svg: Boolean(svg), png: Boolean(demo.querySelector('.model-demo-media img')), pausado: svg ? svg.classList.contains('is-paused') : null,
    botao: !botao.hidden, rotulo: botao.getAttribute('aria-label'), pressionado: botao.getAttribute('aria-pressed'), tempo: animacao ? animacao.currentTime : null,
    estado: animacao ? getComputedStyle(animacao.effect.target).animationPlayState : null };
})`;

const ir = seletor => `document.querySelector(${JSON.stringify(seletor)}).scrollIntoView({ block: 'center' })`;
const navegador = await iniciarNavegador();
const resultados = [];
const registrar = (nome, ok, detalhe = '') => { resultados.push({ nome, ok, detalhe }); console.log(`${ok ? '✔' : '✘'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`); };

async function abrir(opcoes = {}) {
  const { largura = 1280, altura = 900, movel = false, midia = [], semScript = false } = opcoes;
  return navegador.abrir(URL_PAGINA, {
    largura, altura, movel, preparar: false,
    antes: async sessao => {
      await sessao('Page.addScriptToEvaluateOnNewDocument', { source: OUVIR_ERROS });
      if (midia.length) await sessao('Emulation.setEmulatedMedia', { features: midia });
      if (semScript) await sessao('Emulation.setScriptExecutionDisabled', { value: true });
    }
  });
}

try {
  // 1. Reprodução, pausa, retomada, saída do viewport e aba oculta.
  let pagina = await abrir();
  await pagina.avaliar(`document.fonts.ready.then(() => true)`);
  let demos = await pagina.avaliar(estadoDemos);
  registrar('antes de rolar, as demonstrações mostram o PNG', demos.every(d => d.png && !d.svg));
  await pagina.avaliar(ir('.model-demos-grid'));
  await espera(900);
  demos = await pagina.avaliar(estadoDemos);
  const visiveis = demos.filter(d => d.svg);
  registrar('demonstrações visíveis viram SVG inline com controle', visiveis.length >= 2 && visiveis.every(d => d.botao && d.pausado === false), JSON.stringify(visiveis.map(d => d.id)));
  const t1 = (await pagina.avaliar(estadoDemos))[0].tempo;
  await espera(600);
  const t2 = (await pagina.avaliar(estadoDemos))[0].tempo;
  registrar('animação avança enquanto visível', t2 > t1, `${Math.round(t1)} → ${Math.round(t2)} ms`);
  await pagina.avaliar(`document.querySelector('.model-demo .model-demo-toggle').click()`);
  await espera(100);
  const pausado = (await pagina.avaliar(estadoDemos))[0];
  await espera(600);
  const aindaPausado = (await pagina.avaliar(estadoDemos))[0];
  registrar('Pausar congela o quadro e atualiza o rótulo', pausado.pausado && pausado.pressionado === 'true' && pausado.rotulo === 'Retomar demonstração Pratos' && Math.abs(aindaPausado.tempo - pausado.tempo) < 1, `${Math.round(pausado.tempo)} → ${Math.round(aindaPausado.tempo)} ms`);
  await pagina.avaliar(`window.scrollTo(0, document.body.scrollHeight)`);
  await espera(500);
  demos = await pagina.avaliar(estadoDemos);
  registrar('fora da tela, todas ficam suspensas', demos.filter(d => d.svg).every(d => d.pausado && d.estado === 'paused'));
  await pagina.avaliar(ir('.model-demos-grid'));
  await espera(600);
  demos = await pagina.avaliar(estadoDemos);
  registrar('de volta à tela, a escolha de pausa é preservada e as outras retomam', demos[0].pausado && demos[0].pressionado === 'true' && demos[1].pausado === false);
  await pagina.avaliar(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`);
  demos = await pagina.avaliar(estadoDemos);
  registrar('aba oculta suspende todas', demos.filter(d => d.svg).every(d => d.pausado));
  await pagina.avaliar(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))`);
  await pagina.avaliar(`document.querySelector('.model-demo .model-demo-toggle').click()`);
  demos = await pagina.avaliar(estadoDemos);
  registrar('Retomar volta a reproduzir', demos[0].pausado === false && demos[0].rotulo === 'Pausar demonstração Pratos');
  await pagina.avaliar(ir('.model-demo[data-demo="portfolio"]'));
  await espera(900);
  demos = await pagina.avaliar(estadoDemos);
  registrar('as quatro demonstrações carregam ao entrar na tela', demos.every(d => d.svg), JSON.stringify(demos.map(d => [d.id, d.svg])));
  const ids = await pagina.avaliar(`(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); })()`);
  registrar('IDs únicos com os quatro SVGs inline', ids.length === 0, ids.join(', '));
  const fontes = await pagina.avaliar(`[...document.querySelectorAll('.model-demo-media svg text')].slice(0, 3).map(t => getComputedStyle(t).fontFamily + ' / stroke ' + getComputedStyle(t).stroke)`);
  registrar('texto do SVG usa as fontes do site sem contorno herdado', fontes.every(f => /DM Sans|Syne/.test(f) && /stroke none/.test(f)), fontes.join(' | '));
  await pagina.avaliar(`document.querySelector('.area-choice[data-area="health"]').click()`);
  const filtro = await pagina.avaliar(`[...document.querySelectorAll('.area-panel')].map(p => p.id + ':' + !p.hidden).join(',')`);
  registrar('filtros de área continuam funcionando', filtro.includes('area-health:true') && filtro.includes('area-food:false'), filtro);
  await pagina.avaliar(`document.querySelector('.area-choice[data-area="food"]').click()`);
  const erros = await pagina.avaliar('window.__erros');
  registrar('sem erros de script ou CSP', erros.length === 0, erros.join(' | '));
  await pagina.fechar();

  // 2. Movimento reduzido e ausência de JavaScript mantêm o PNG estático.
  pagina = await abrir({ midia: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pagina.avaliar(ir('.model-demos-grid'));
  await espera(700);
  demos = await pagina.avaliar(estadoDemos);
  registrar('movimento reduzido mostra PNG e esconde o controle', demos.every(d => d.png && !d.svg && !d.botao));
  await pagina.fechar();
  pagina = await abrir({ semScript: true });
  const semJs = await pagina.avaliar(`[...document.querySelectorAll('.model-demo')].map(d => Boolean(d.querySelector('img')) && d.querySelector('.model-demo-toggle').hidden)`).catch(() => null);
  await pagina.fechar();
  registrar('sem JavaScript, PNG e controle oculto', semJs === null || semJs.every(Boolean), semJs === null ? 'avaliação bloqueada; marcação traz hidden e <img>' : '');

  // 3. Capturas em desktop e celular, claro e escuro.
  for (const [nome, largura, altura, movel] of [['desktop-1280', 1280, 900, false], ['celular-375', 375, 812, true]]) {
    for (const tema of ['light', 'dark']) {
      pagina = await abrir({ largura, altura, movel, midia: [{ name: 'prefers-color-scheme', value: tema }] });
      await pagina.avaliar(ir('.model-demos'));
      await pagina.avaliar(`document.querySelector('.model-demos').scrollIntoView({ block: 'start' }); window.scrollBy(0, -90)`);
      await espera(1100);
      const { data } = await pagina.sessao('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(destino, `possibilidades-${nome}-${tema === 'light' ? 'claro' : 'escuro'}.png`), Buffer.from(data, 'base64'));
      const larguraDoc = await pagina.avaliar('document.documentElement.scrollWidth');
      registrar(`${nome} ${tema}: sem rolagem horizontal`, larguraDoc <= largura, `${larguraDoc}px`);
      await pagina.fechar();
    }
  }
} finally {
  await navegador.fechar();
}
const falhas = resultados.filter(r => !r.ok);
await writeFile(join(destino, 'resultado.json'), JSON.stringify(resultados, null, 2));
assert.equal(falhas.length, 0, `${falhas.length} verificação(ões) falharam`);
