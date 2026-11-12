import { pathToFileURL } from 'node:url';
import { carrossel, cores as C, endereco, formatos, modelo, modelos, roteiro } from './campanha.mjs';
import { caminhos } from './caminhos.mjs';
import { fontesLocais } from './fontes.mjs';
import { criarLinhaDoTempo, passos } from './linha-do-tempo.mjs';
import { renderizarModelo } from './modelos.mjs';

// Instante usado na captura das páginas estáticas; instâncias com pose ficam presas nela em qualquer instante.
export const BUSCA_ESTATICA = 10;

const arquivo = caminho => pathToFileURL(caminho).href;
const imagemLocal = nome => arquivo(caminhos.apoioOtimizado(nome));
const logo = inverso => arquivo(caminhos.marca(inverso ? 'vitrine-inverse.svg' : 'vitrine.svg'));
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function criarInstancias() {
  const usados = new Map();
  // Cada cópia de um modelo recebe prefixo próprio para IDs e animações não colidirem.
  return function instancia(id, { pose, t0, t1, fundo = false, largura, classe = '', estilo = '' }) {
    const m = modelo(id);
    const n = (usados.get(id) ?? 0) + 1;
    usados.set(id, n);
    const { svg } = renderizarModelo(id, { imagem: imagemLocal, prefixo: `${m.prefixo}${n}`, fundo });
    const tempo = pose !== undefined
      ? ` data-t0="-1000" data-t1="${pose}"`
      : ` data-t0="${t0}"${t1 !== undefined ? ` data-t1="${t1}"` : ''}`;
    return `<div class="modelo ${classe}"${tempo} style="width:${largura}px;${estilo}">${svg}</div>`;
  };
}

// Aproximação: recorte ampliado de uma região do modelo, numa janela própria.
function aproximacao(instancia, id, { pose, regiao, largura, classe = '', estilo = '' }) {
  const [x, y, w, h] = regiao;
  const k = largura / w;
  const altura = Math.round(h * k);
  const interno = instancia(id, { pose, fundo: true, largura: Math.round(1200 * k), estilo: `position:absolute;left:${-x * k}px;top:${-y * k}px` });
  return `<div class="janela aproximacao ${classe}" style="width:${largura}px;height:${altura}px;${estilo}">${interno}</div>`;
}

const CSS_BASE = ({ largura, altura }) => `
${fontesLocais()}
:root{--floresta:${C.floresta};--lima:${C.lima};--menta:${C.menta};--papel:${C.papel};--mostarda:${C.mostarda};--suave:${C.florestaSuave};--menta-clara:${C.mentaClara}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${largura}px;height:${altura}px;overflow:hidden;background:var(--papel)}
body{font-family:'DM Sans',sans-serif;color:var(--floresta);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.palco{position:relative;width:${largura}px;height:${altura}px;overflow:hidden;perspective:1900px;perspective-origin:50% 45%}
.camada{position:absolute;inset:0;transform-style:preserve-3d}
.papel{background:radial-gradient(90% 70% at 25% 20%,rgb(163 229 194/.42),transparent 70%),var(--papel)}
.floresta{background:radial-gradient(110% 80% at 85% 105%,#22583a 0%,var(--floresta) 52%,${C.florestaProfunda} 100%)}
.pontos::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle,rgb(19 56 36/.14) 1.7px,transparent 2.1px);background-size:30px 30px}
.floresta.pontos::before{background-image:radial-gradient(circle,rgb(186 255 41/.11) 1.7px,transparent 2.1px)}
.titulo{font-family:Syne,'DM Sans',sans-serif;font-weight:700;letter-spacing:-.035em;line-height:1.02}
.no-floresta{color:var(--papel)}
.apoio{font-size:40px;line-height:1.25;font-weight:500}
.rotulo{display:inline-flex;align-items:center;gap:14px;height:56px;padding:0 26px 0 20px;border-radius:28px;background:#fff;font-size:26px;font-weight:700;box-shadow:0 10px 24px -14px rgb(12 38 24/.45),inset 0 0 0 1.5px rgb(19 56 36/.08)}
.rotulo::before{content:'';width:16px;height:16px;border-radius:50%;background:var(--lima);box-shadow:0 0 0 3.5px var(--floresta)}
.janela{position:absolute;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 60px 90px -50px rgb(12 38 24/.55),0 22px 40px -22px rgb(12 38 24/.38)}
.janela::after{content:'';position:absolute;inset:0;border-radius:inherit;padding:3px;background:linear-gradient(150deg,var(--lima) 0%,rgb(163 229 194/.8) 22%,rgb(163 229 194/0) 55%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.floresta .janela{box-shadow:0 60px 90px -40px rgb(0 0 0/.6),0 22px 40px -20px rgb(0 0 0/.45)}
.modelo svg{display:block;width:100%;height:auto}
.solto{position:absolute}
.rodape{position:absolute;left:72px;right:72px;bottom:54px;display:flex;justify-content:space-between;align-items:center;font-size:25px;font-weight:600}
.pagina{font-size:22px;font-weight:600;color:var(--suave)}
.endereco{font-weight:700;letter-spacing:-.01em}
.no-floresta .pagina{color:var(--menta)}
.chip-passo{position:absolute;display:flex;align-items:center;gap:12px;height:54px;padding:0 24px 0 10px;border-radius:27px;background:var(--floresta);color:var(--papel);font-size:25px;font-weight:700;box-shadow:0 14px 26px -14px rgb(12 38 24/.6)}
.chip-passo b{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--lima);color:var(--floresta);font-size:20px}
.legenda-tile{position:absolute;left:20px;top:-24px;z-index:2;box-shadow:0 10px 20px -10px rgb(0 0 0/.5),inset 0 0 0 2px rgb(186 255 41/.5);display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 18px 0 14px;border-radius:22px;background:var(--floresta);color:var(--papel);font-size:21px;font-weight:700}
.legenda-tile::before{content:'';width:12px;height:12px;border-radius:50%;background:var(--lima)}
.seta{color:var(--menta);font-size:26px;font-weight:600}
`;

export function documento({ largura, altura, css = '', corpo }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vitrine Inspira — campanha</title><style>${CSS_BASE({ largura, altura })}${css}</style></head><body>${corpo}</body></html>`;
}

const linhas = texto => texto.split('\n').map(esc).join('<br>');

// Composição em relevo da capa: três janelas em perspectiva e o total aproximado à frente.
function composicaoCapa(instancia, { x, y, escala }) {
  const e = valor => Math.round(valor * escala);
  const lanches = modelo('lanches');
  const portfolio = modelo('portfolio');
  const cardapio = modelo('cardapio');
  return `<div class="camada" style="left:${x}px;top:${y}px;width:${e(1000)}px;height:${e(620)}px">`
    + `<div class="janela" style="left:0;top:${e(40)}px;width:${e(470)}px;transform:translateZ(-160px) rotateY(20deg) rotateZ(-2deg)">${instancia('lanches', { pose: lanches.poseLimpa, fundo: true, largura: e(470) })}</div>`
    + `<div class="janela" style="left:${e(520)}px;top:${e(20)}px;width:${e(470)}px;transform:translateZ(-160px) rotateY(-20deg) rotateZ(2deg)">${instancia('portfolio', { pose: portfolio.poses.diploma, fundo: true, largura: e(470) })}</div>`
    + `<div class="janela" style="left:${e(205)}px;top:${e(110)}px;width:${e(590)}px;transform:translateZ(0) rotateX(6deg)">${instancia('cardapio', { pose: cardapio.poseLimpa, fundo: true, largura: e(590) })}</div>`
    + aproximacao(instancia, 'cardapio', { pose: cardapio.poseLimpa, regiao: [116, 704, 550, 108], largura: e(450), estilo: `left:${e(540)}px;top:${e(400)}px;transform:translateZ(90px) rotateX(6deg)` })
    + '</div>';
}

function capa({ vertical = false, carrosselAtivo = false } = {}) {
  const instancia = criarInstancias();
  const { largura, altura } = vertical ? formatos.story : formatos.carrossel;
  const slide = carrossel[0];
  const topo = vertical ? 300 : 72;
  const corpo = `<main class="palco floresta pontos no-floresta">`
    + `<img class="solto" src="${logo(true)}" alt="" style="left:72px;top:${topo}px;width:${vertical ? 340 : 300}px">`
    + (carrosselAtivo ? `<span class="solto seta" style="right:72px;top:${topo + 30}px">Arraste para conhecer →</span>` : '')
    + `<h1 class="solto titulo" style="left:72px;top:${vertical ? 450 : 214}px;font-size:${vertical ? 132 : 116}px">${linhas('Mostre o que\nvocê faz.')}</h1>`
    + `<p class="solto apoio" style="left:76px;top:${vertical ? 740 : 470}px;color:var(--menta);font-size:${vertical ? 46 : 40}px">${esc(slide.apoio)}</p>`
    + composicaoCapa(instancia, vertical ? { x: 30, y: 830, escala: 1 } : { x: 66, y: 528, escala: 0.94 })
    + (vertical ? `<p class="solto endereco" style="left:0;right:0;top:1396px;text-align:center;font-size:34px;color:var(--lima)">${endereco}</p>` : '')
    + '</main>';
  return documento({ largura, altura, corpo });
}

function slideCaminho() {
  const instancia = criarInstancias();
  const m = modelo('cardapio');
  const slide = carrossel[1];
  const janelas = [
    { pose: 0.1, regiao: [96, 84, 590, 500], largura: 380, x: 64, y: 372, rot: 'translateZ(-110px) rotateY(16deg)' },
    { pose: 1.0, regiao: [96, 268, 590, 560], largura: 400, x: 344, y: 452, rot: 'translateZ(-40px) rotateY(6deg)' },
    { pose: 2.5, regiao: [664, 232, 472, 380], largura: 420, x: 600, y: 540, rot: 'translateZ(40px) rotateY(-8deg)' }
  ];
  const chips = [[64, 300], [344, 380], [600, 468]];
  let corpo = `<main class="palco papel pontos">`
    + `<h1 class="solto titulo" style="left:72px;top:92px;font-size:84px">${linhas('Deixe claro o que\nvocê oferece.')}</h1>`
    + `<div class="camada">${janelas.map(j => aproximacao(instancia, 'cardapio', { pose: j.pose, regiao: j.regiao, largura: j.largura, estilo: `left:${j.x}px;top:${j.y}px;transform:${j.rot}` })).join('')}</div>`
    + `<svg class="solto" style="left:0;top:0" width="1080" height="1080" viewBox="0 0 1080 1080" aria-hidden="true">`
    + `<path d="M${chips[0][0] + 250} ${chips[0][1] + 27}H${chips[1][0] + 120}V${chips[1][1]}M${chips[1][0] + 230} ${chips[1][1] + 27}H${chips[2][0] + 120}V${chips[2][1]}" fill="none" stroke="${C.floresta}" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>`
    + `</svg>`
    + slide.passos.map((passo, i) => `<span class="chip-passo" style="left:${chips[i][0]}px;top:${chips[i][1]}px"><b>${i + 1}</b>${esc(passo)}</span>`).join('')
    + rodape(2)
    + '</main>';
  return documento({ ...formatos.carrossel, corpo });
}

function rodape(n, noFloresta = false) {
  return `<footer class="rodape${noFloresta ? ' no-floresta' : ''}"><span class="endereco">${endereco}</span><span class="pagina">${n}/7</span></footer>`;
}

const TITULOS_CARROSSEL = {
  cardapio: 'Escolha o prato.\nVeja o total.',
  lanches: 'Monte o pedido.\nContinue no WhatsApp.',
  servicos: 'Apresente seu serviço.\nFacilite o orçamento.',
  portfolio: 'Projetos, currículo\ne conquistas em\numa apresentação.'
};

function slideModelo(slide) {
  const instancia = criarInstancias();
  const m = modelo(slide.id);
  const tresLinhas = TITULOS_CARROSSEL[m.id].split('\n').length === 3;
  const topoModelo = tresLinhas ? 352 : 300;
  let composicao;
  if (m.id === 'portfolio') {
    const painel = [96, 272, 688, 552];
    composicao = `<div class="camada">`
      + aproximacao(instancia, 'portfolio', { pose: m.poses.projeto, regiao: [80, 84, 720, 760], largura: 560, estilo: `left:62px;top:${topoModelo + 14}px;transform:rotateY(10deg)` })
      + aproximacao(instancia, 'portfolio', { pose: m.poses.curriculo, regiao: painel, largura: 420, estilo: `left:578px;top:${topoModelo + 20}px;transform:translateZ(40px) rotateY(-10deg)` })
      + aproximacao(instancia, 'portfolio', { pose: m.poses.diploma, regiao: painel, largura: 420, estilo: `left:610px;top:${topoModelo + 268}px;transform:translateZ(100px) rotateY(-10deg)` })
      + '</div>';
  } else {
    composicao = `<div class="camada">`
      + instancia(m.id, { pose: m.poseLimpa, largura: 940, estilo: `position:absolute;left:30px;top:${topoModelo}px;transform:rotateX(5deg) rotateY(-5deg)` })
      + aproximacao(instancia, m.id, { pose: m.poseLimpa, regiao: m.detalhe, largura: m.id === 'cardapio' ? 420 : 520, estilo: `right:56px;bottom:142px;transform:translateZ(110px) rotateY(-6deg)` })
      + '</div>';
  }
  const corpo = `<main class="palco papel pontos">`
    + `<span class="solto rotulo" style="left:72px;top:64px">${esc(slide.rotulo)}</span>`
    + `<h1 class="solto titulo" style="left:72px;top:146px;font-size:66px">${linhas(TITULOS_CARROSSEL[m.id])}</h1>`
    + composicao
    + rodape(slide.n)
    + '</main>';
  return documento({ ...formatos.carrossel, corpo });
}

function gradeEncerramento(instancia, { x, y, largura, gap }) {
  const altura = Math.round(largura * 0.75);
  return `<div class="camada">` + modelos.map((m, i) => {
    const col = i % 2;
    const lin = Math.floor(i / 2);
    const rot = col === 0 ? 'rotateY(7deg)' : 'rotateY(-7deg)';
    const left = x + col * (largura + gap);
    const top = y + lin * (altura + gap + 30);
    return `<div class="solto" style="left:${left}px;top:${top}px;width:${largura}px;height:${altura}px;transform:${rot};transform-style:preserve-3d">`
      + `<div class="janela" style="left:0;top:0;width:${largura}px">${instancia(m.id, { pose: m.poseLimpa, fundo: true, largura })}</div>`
      + `<span class="legenda-tile">${esc(m.nomeCampanha)}</span></div>`;
  }).join('') + '</div>';
}

function slideEncerramento({ vertical = false } = {}) {
  const instancia = criarInstancias();
  const { largura, altura } = vertical ? formatos.story : formatos.carrossel;
  const slide = carrossel[6];
  const corpo = `<main class="palco floresta pontos no-floresta">`
    + `<h1 class="solto titulo" style="left:72px;top:${vertical ? 300 : 84}px;font-size:${vertical ? 104 : 82}px">${linhas('Qual combina com\na sua ideia?')}</h1>`
    + gradeEncerramento(instancia, vertical ? { x: 72, y: 640, largura: 452, gap: 32 } : { x: 160, y: 318, largura: 364, gap: 32 })
    + `<img class="solto" src="${logo(true)}" alt="" style="left:72px;${vertical ? 'top:1330px;width:300px' : 'bottom:44px;width:250px'}">`
    + `<div class="solto" style="right:72px;${vertical ? 'top:1338px' : 'bottom:50px'};text-align:right">`
    + `<p style="font-size:${vertical ? 30 : 25}px;font-weight:600;color:var(--menta)">${esc(slide.chamada)}</p>`
    + `<p class="endereco" style="font-size:${vertical ? 42 : 36}px;color:var(--lima)">${endereco}</p></div>`
    + (vertical ? '' : `<span class="solto pagina" style="right:72px;top:96px">7/7</span>`)
    + '</main>';
  return documento({ largura, altura, corpo });
}

/** Páginas estáticas: sete lâminas do carrossel e capas dos vídeos. */
export function paginasEstaticas() {
  return [
    { nome: 'carrossel-01-capa', formato: formatos.carrossel, html: capa({ carrosselAtivo: true }) },
    { nome: 'carrossel-02-caminho', formato: formatos.carrossel, html: slideCaminho() },
    ...carrossel.slice(2, 6).map(slide => ({ nome: `carrossel-0${slide.n}-${slide.id}`, formato: formatos.carrossel, html: slideModelo(slide) })),
    { nome: 'carrossel-07-encerramento', formato: formatos.carrossel, html: slideEncerramento() },
    { nome: 'capa-video-feed', formato: formatos.feed, html: capa() },
    { nome: 'capa-video-story', formato: formatos.story, html: capa({ vertical: true }) }
  ];
}

/** Página com um único modelo, usada para PNG, GIF e conferência do loop. */
export function paginaModelo(id) {
  const { svg } = renderizarModelo(id, { imagem: imagemLocal });
  return documento({ ...formatos.modelo, corpo: svg });
}

export { criarInstancias, aproximacao, composicaoCapa, gradeEncerramento, linhas, esc, logo, rodape, TITULOS_CARROSSEL, criarLinhaDoTempo, passos, roteiro };
