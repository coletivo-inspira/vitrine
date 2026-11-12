import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATOS = [
  process.env.CHROME_PATH,
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
].filter(Boolean);

function localizarChrome() {
  const caminho = CANDIDATOS.find(candidato => existsSync(candidato));
  if (!caminho) throw new Error('Chrome não encontrado. Defina CHROME_PATH com o executável do Chrome ou Chromium.');
  return caminho;
}

// Prepara a página para captura: espera fontes e imagens e expõe a busca por tempo.
const PREPARAR = `(async () => {
  await document.fonts.ready;
  for (const face of ['700 40px Syne', '400 20px "DM Sans"', '700 20px "DM Sans"']) await document.fonts.load(face);
  const faltando = ['Syne', 'DM Sans'].filter(familia => ![...document.fonts].some(f => f.family.replace(/["']/g, '') === familia && f.status === 'loaded'));
  if (faltando.length) throw new Error('Fontes não carregadas: ' + faltando.join(', '));
  await Promise.all([...document.images].map(img => img.decode().catch(() => { throw new Error('Imagem não carregou: ' + img.src); })));
  const enderecos = new Set([...document.querySelectorAll('image')].map(el => new URL(el.getAttribute('href'), document.baseURI).href));
  await Promise.all([...enderecos].map(src => new Promise((ok, falha) => {
    const img = new Image();
    img.onload = ok;
    img.onerror = () => falha(new Error('Imagem SVG não carregou: ' + src.slice(0, 80)));
    img.src = src;
  })));
  const quadro = () => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
  // data-t0 desloca o relógio de um modelo embutido; data-t1 congela o resultado até a cena acabar.
  window.__buscar = async segundos => {
    for (const animacao of document.getAnimations()) {
      const alvo = animacao.effect && animacao.effect.target;
      const hospedeiro = alvo && alvo.closest ? alvo.closest('[data-t0]') : null;
      const t0 = hospedeiro ? Number(hospedeiro.dataset.t0) : 0;
      const t1 = hospedeiro && hospedeiro.dataset.t1 ? Number(hospedeiro.dataset.t1) : Infinity;
      animacao.pause();
      animacao.currentTime = Math.min(Math.max(0, segundos - t0), t1) * 1000;
    }
    await quadro();
  };
  await window.__buscar(0);
  const { scrollWidth, scrollHeight } = document.documentElement;
  return { animacoes: document.getAnimations().length, scrollWidth, scrollHeight };
})()`;

class Conexao {
  constructor(socket) {
    this.socket = socket;
    this.proximo = 0;
    this.pendentes = new Map();
    this.ouvintes = new Set();
    socket.addEventListener('message', ({ data }) => {
      const mensagem = JSON.parse(data);
      if (mensagem.id !== undefined) {
        const pendente = this.pendentes.get(mensagem.id);
        if (!pendente) return;
        this.pendentes.delete(mensagem.id);
        if (mensagem.error) pendente.falha(new Error(`${pendente.metodo}: ${mensagem.error.message}`));
        else pendente.ok(mensagem.result);
      } else {
        for (const ouvinte of this.ouvintes) ouvinte(mensagem);
      }
    });
  }

  enviar(metodo, params = {}, sessionId) {
    const id = ++this.proximo;
    return new Promise((ok, falha) => {
      this.pendentes.set(id, { ok, falha, metodo });
      this.socket.send(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  esperarEvento(metodo, sessionId, limite = 30000) {
    return new Promise((ok, falha) => {
      const timer = setTimeout(() => { this.ouvintes.delete(ouvinte); falha(new Error(`Tempo esgotado: ${metodo}`)); }, limite);
      const ouvinte = mensagem => {
        if (mensagem.method === metodo && mensagem.sessionId === sessionId) {
          clearTimeout(timer);
          this.ouvintes.delete(ouvinte);
          ok(mensagem.params);
        }
      };
      this.ouvintes.add(ouvinte);
    });
  }
}

/** Abre um Chrome headless; `abrir(url, { largura, altura })` devolve uma página pronta para capturar. */
export async function iniciarNavegador() {
  const perfil = await mkdtemp(join(tmpdir(), 'vitrine-campanha-'));
  const processo = spawn(localizarChrome(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--force-color-profile=srgb', '--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endereco = await new Promise((ok, falha) => {
    let saida = '';
    const timer = setTimeout(() => falha(new Error(`Chrome não respondeu:\n${saida}`)), 20000);
    processo.stderr.on('data', pedaco => {
      saida += pedaco;
      const achado = saida.match(/DevTools listening on (ws:\/\/\S+)/);
      if (achado) { clearTimeout(timer); ok(achado[1]); }
    });
    processo.on('exit', codigo => { clearTimeout(timer); falha(new Error(`Chrome encerrou (${codigo}):\n${saida}`)); });
  });
  const socket = new WebSocket(endereco);
  await new Promise((ok, falha) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', falha, { once: true }); });
  const conexao = new Conexao(socket);

  /** `preparar: false` abre páginas comuns (por exemplo, o site) sem a preparação de captura. */
  async function abrir(url, { largura, altura, escala = 1, movel = false, antes, preparar = true }) {
    const { targetId } = await conexao.enviar('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await conexao.enviar('Target.attachToTarget', { targetId, flatten: true });
    const sessao = (metodo, params) => conexao.enviar(metodo, params, sessionId);
    await sessao('Page.enable');
    await sessao('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: escala, mobile: movel });
    if (antes) await antes(sessao);
    const carregou = conexao.esperarEvento('Page.loadEventFired', sessionId);
    await sessao('Page.navigate', { url });
    await carregou;
    const avaliar = async expressao => {
      const { result, exceptionDetails } = await sessao('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    const estado = preparar ? await avaliar(PREPARAR) : null;
    if (estado && (estado.scrollWidth > largura || estado.scrollHeight > altura)) {
      throw new Error(`${url}: conteúdo ${estado.scrollWidth}×${estado.scrollHeight} maior que ${largura}×${altura}`);
    }
    return {
      estado,
      sessao,
      avaliar,
      buscar: segundos => avaliar(`window.__buscar(${segundos})`),
      async capturar(formato = 'png') {
        const { data } = await sessao('Page.captureScreenshot', { format: formato, fromSurface: true, captureBeyondViewport: false });
        return Buffer.from(data, 'base64');
      },
      fechar: () => conexao.enviar('Target.closeTarget', { targetId })
    };
  }

  async function fechar() {
    socket.close();
    processo.kill();
    await new Promise(ok => (processo.exitCode !== null ? ok() : processo.once('exit', ok)));
    await rm(perfil, { recursive: true, force: true }).catch(() => {});
  }

  return { abrir, fechar };
}
