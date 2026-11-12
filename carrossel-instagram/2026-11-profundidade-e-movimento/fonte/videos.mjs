import { carrossel, endereco, formatos, modelo, modelos, roteiro } from './campanha.mjs';
import { criarLinhaDoTempo, passos } from './linha-do-tempo.mjs';
import { renderizarModelo } from './modelos.mjs';
import { aproximacao, criarInstancias, documento, esc, linhas, logo, TITULOS_CARROSSEL } from './pecas.mjs';

// Último instante de cada demonstração antes do retorno: o resultado fica na tela até a troca de cena.
const CONGELA = 3.4;

const LAYOUTS = {
  feed: {
    formato: formatos.feed,
    abertura: { logo: [72, 72, 300], titulo: [72, 214, 116], apoio: [76, 470, 40], composicao: { x: 66, y: 528, escala: 0.94 } },
    demo: { rotulo: [72, 60], titulo: [72, 136, 56], modelo: { x: 70, y: 292, largura: 940 }, progresso: [1008, 86], beneficio: null },
    fim: { titulo: [72, 84, 82], grade: { x: 160, y: 318, largura: 364, gap: 32 }, logo: { x: 72, base: 44, largura: 250 }, chamada: { direita: 72, base: 50, tam: [25, 36] } }
  },
  story: {
    formato: formatos.story,
    abertura: { logo: [72, 300, 340], titulo: [72, 450, 132], apoio: [76, 740, 46], composicao: { x: 30, y: 830, escala: 1 } },
    demo: { rotulo: [72, 286], titulo: [72, 370, 74], modelo: { x: 20, y: 640, largura: 1040 }, progresso: [1008, 314], beneficio: [72, 1404, 34] },
    fim: { titulo: [72, 300, 100], grade: { x: 72, y: 600, largura: 452, gap: 32 }, logo: { x: 72, topo: 1336, largura: 290 }, chamada: { direita: 72, topo: 1338, tam: [30, 42] } }
  }
};

const CSS_VIDEO = `
.painel{position:absolute;inset:0;overflow:hidden}
.toque-anel{position:absolute;width:88px;height:88px;margin:-44px 0 0 -44px;border-radius:50%;background:rgb(186 255 41/.35);border:4px solid var(--floresta);box-shadow:0 0 0 3px rgb(247 247 244/.6)}
.ponto{position:absolute;width:14px;height:14px;border-radius:7px;background:rgb(19 56 36/.18)}
.ponto-ativo{position:absolute;width:44px;height:14px;border-radius:7px;background:var(--floresta);box-shadow:inset 0 0 0 3px var(--lima)}
.beneficio{font-size:34px;font-weight:600;color:var(--suave)}
`;

function montarVideo(nome, layout) {
  const { formato, abertura: A, demo: D, fim: F } = layout;
  const { largura, altura } = formato;
  const tl = criarLinhaDoTempo({ prefixo: `v${nome[0]}`, duracao: roteiro.duracao });
  const trilha = (id, paradas) => tl.trilha(id, paradas, { laco: false });
  const instancia = criarInstancias();
  const sinais = [];
  const cenas = Object.fromEntries(roteiro.cenas.map(cena => [cena.id, cena]));
  const fimAbertura = cenas.abertura.fim;
  const inicioFim = cenas.encerramento.inicio;

  // Abertura: marca, título e um toque concreto que traz o total para a frente.
  const painelAbertura = trilha('abertura', passos({ y: 0 }, [[fimAbertura - 0.28, { y: -altura }, 0.28]]));
  const entraTitulo = trilha('abertura-titulo', passos({ o: 0, y: 40 }, [[0, { o: 1, y: 0 }, 0.26]]));
  const entraApoio = trilha('abertura-apoio', passos({ o: 0, y: 24 }, [[0.16, { o: 1, y: 0 }, 0.24]]));
  const c = A.composicao;
  const e = valor => Math.round(valor * c.escala);
  const cardapio = modelo('cardapio');
  const janelasAbertura = [
    { id: 'lanches', pose: modelo('lanches').poseLimpa, x: 0, y: 40, w: 470, giro: 'translateZ(-160px) rotateY(20deg) rotateZ(-2deg)', t: 0.06 },
    { id: 'portfolio', pose: modelo('portfolio').poses.diploma, x: 520, y: 20, w: 470, giro: 'translateZ(-160px) rotateY(-20deg) rotateZ(2deg)', t: 0.12 },
    { id: 'cardapio', pose: cardapio.poseLimpa, x: 205, y: 110, w: 590, giro: 'translateZ(0) rotateX(6deg)', t: 0.18 }
  ].map(j => {
    const entra = trilha(`abertura-janela-${j.id}`, passos({ o: 0, y: 120, s: 0.94 }, [[j.t, { o: 1, y: 0, s: 1 }, 0.3]]));
    return `<div class="solto ${entra}" style="left:${e(j.x)}px;top:${e(j.y)}px;width:${e(j.w)}px;transform-style:preserve-3d"><div class="janela" style="position:relative;transform:${j.giro}">${instancia(j.id, { pose: j.pose, fundo: true, largura: e(j.w) })}</div></div>`;
  }).join('');
  const tToque = 0.72;
  const anel = trilha('abertura-toque', passos({ o: 0, s: 0.5 }, [[tToque, { o: 1, s: 0.9 }, 0.18], [tToque + 0.18, { o: 0, s: 1.5 }, 0.22]]));
  const avancaTotal = trilha('abertura-total', passos({ o: 0, s: 0.86, y: 30 }, [[tToque + 0.12, { o: 1, s: 1, y: 0 }, 0.26]]));
  sinais.push({ t: tToque, tipo: 'toque' }, { t: tToque + 0.12, tipo: 'avanca' }, { t: fimAbertura - 0.28, tipo: 'passagem' });
  const toqueX = c.x + e(205) + e(590) * 0.44;
  const toqueY = c.y + e(110) + e(590) * 0.75 * 0.84;
  const abertura = `<section class="painel floresta pontos no-floresta ${painelAbertura}">`
    + `<img class="solto" src="${logo(true)}" alt="" style="left:${A.logo[0]}px;top:${A.logo[1]}px;width:${A.logo[2]}px">`
    + `<h1 class="solto titulo ${entraTitulo}" style="left:${A.titulo[0]}px;top:${A.titulo[1]}px;font-size:${A.titulo[2]}px">${linhas('Mostre o que\nvocê faz.')}</h1>`
    + `<p class="solto apoio ${entraApoio}" style="left:${A.apoio[0]}px;top:${A.apoio[1]}px;font-size:${A.apoio[2]}px;color:var(--menta)">${esc(carrossel[0].apoio)}</p>`
    + `<div class="camada" style="left:${c.x}px;top:${c.y}px;width:${e(1000)}px;height:${e(620)}px">${janelasAbertura}`
    + `<div class="solto ${avancaTotal}" style="left:${e(540)}px;top:${e(400)}px;transform-style:preserve-3d">${aproximacao(instancia, 'cardapio', { pose: cardapio.poseLimpa, regiao: [116, 704, 550, 108], largura: e(450), estilo: 'position:relative;transform:translateZ(90px) rotateX(6deg)' })}</div>`
    + '</div>'
    + `<span class="toque-anel ${anel}" style="left:${toqueX}px;top:${toqueY}px"></span>`
    + '</section>';

  // Demonstrações: uma ação e um benefício por cena, com troca curta entre janelas.
  const demos = modelos.map((m, k) => {
    const { inicio, fim } = cenas[m.id];
    const primeira = k === 0;
    const ultima = k === modelos.length - 1;
    const sai = ultima ? inicioFim - 0.22 : fim - 0.22;
    const rotulo = trilha(`${m.id}-rotulo`, passos({ o: 0, y: 20 }, [[inicio - (primeira ? 0.22 : 0.1), { o: 1, y: 0 }, 0.26], [sai, { o: 0, y: -20 }, 0.24]]));
    const titulo = trilha(`${m.id}-titulo`, passos({ o: 0, y: 34 }, [[inicio - (primeira ? 0.18 : 0.06), { o: 1, y: 0 }, 0.26], [sai + 0.02, { o: 0, y: -34 }, 0.24]]));
    const janela = trilha(`${m.id}-janela`, passos({ o: 0, x: 220, z: -280, ry: -16 }, [[inicio - (primeira ? 0.26 : 0.12), { o: 1, x: 0, z: 0, ry: 0 }, 0.3], [sai, { o: 0, x: -220, z: -300, ry: 14 }, 0.3]]));
    const ativo = trilha(`${m.id}-progresso`, passos({ o: 0 }, [[inicio - 0.1, { o: 1 }, 0.2], [sai, { o: 0 }, 0.2]]));
    const beneficio = D.beneficio ? trilha(`${m.id}-beneficio`, passos({ o: 0, y: 20 }, [[inicio + 0.9, { o: 1, y: 0 }, 0.26], [sai, { o: 0, y: -10 }, 0.22]])) : '';
    const { sinais: doModelo } = renderizarModelo(m.id, { imagem: () => '' });
    for (const sinal of doModelo) if (sinal.t <= CONGELA) sinais.push({ t: inicio + sinal.t, tipo: sinal.tipo });
    if (!ultima) sinais.push({ t: sai, tipo: 'passagem' });
    const [px, py] = D.progresso;
    return `<span class="solto rotulo ${rotulo}" style="left:${D.rotulo[0]}px;top:${D.rotulo[1]}px">${esc(m.nomeCampanha)}</span>`
      + `<h2 class="solto titulo ${titulo}" style="left:${D.titulo[0]}px;top:${D.titulo[1]}px;font-size:${D.titulo[2]}px">${linhas(TITULOS_CARROSSEL[m.id])}</h2>`
      + `<div class="solto ${janela}" style="left:${D.modelo.x}px;top:${D.modelo.y + (TITULOS_CARROSSEL[m.id].includes('\n') && TITULOS_CARROSSEL[m.id].split('\n').length === 3 ? Math.round(D.titulo[2] * 0.9) : 0)}px;transform-style:preserve-3d">`
      + instancia(m.id, { t0: inicio, t1: CONGELA, largura: D.modelo.largura })
      + '</div>'
      + `<span class="ponto-ativo ${ativo}" style="left:${px - (modelos.length - 1 - k) * 26 - 44}px;top:${py}px"></span>`
      + (beneficio ? `<p class="solto beneficio ${beneficio}" style="left:${D.beneficio[0]}px;right:72px;top:${D.beneficio[1]}px;font-size:${D.beneficio[2]}px">${esc(m.beneficio)}</p>` : '');
  }).join('');
  const [px, py] = D.progresso;
  const progresso = modelos.map((_, k) => `<span class="ponto" style="left:${px - (modelos.length - 1 - k) * 26 - 14}px;top:${py}px"></span>`).join('');
  const mostraProgresso = trilha('progresso', passos({ o: 0 }, [[fimAbertura - 0.2, { o: 1 }, 0.2], [inicioFim - 0.22, { o: 0 }, 0.2]]));

  // Encerramento: pergunta, quatro modelos e uma chamada única com o endereço.
  const painelFim = trilha('fim', passos({ y: altura }, [[inicioFim - 0.22, { y: 0 }, 0.3]]));
  const tituloFim = trilha('fim-titulo', passos({ o: 0, y: 30 }, [[inicioFim, { o: 1, y: 0 }, 0.26]]));
  const marcaFim = trilha('fim-marca', passos({ o: 0, y: 20 }, [[inicioFim + 0.4, { o: 1, y: 0 }, 0.26]]));
  const chamadaFim = trilha('fim-chamada', passos({ o: 0, y: 20 }, [[inicioFim + 0.5, { o: 1, y: 0 }, 0.26]]));
  sinais.push({ t: inicioFim - 0.22, tipo: 'passagem' }, { t: inicioFim + 0.45, tipo: 'assinatura' });
  const G = F.grade;
  const alturaTile = Math.round(G.largura * 0.75);
  const tiles = modelos.map((m, i) => {
    const col = i % 2;
    const lin = Math.floor(i / 2);
    const entra = trilha(`fim-tile-${m.id}`, passos({ o: 0, s: 0.86, y: 40 }, [[inicioFim + 0.08 + i * 0.06, { o: 1, s: 1, y: 0 }, 0.26]]));
    return `<div class="solto ${entra}" style="left:${G.x + col * (G.largura + G.gap)}px;top:${G.y + lin * (alturaTile + G.gap + 30)}px;width:${G.largura}px;height:${alturaTile}px;transform-style:preserve-3d">`
      + `<div class="solto" style="inset:0;transform:${col === 0 ? 'rotateY(7deg)' : 'rotateY(-7deg)'};transform-style:preserve-3d">`
      + `<div class="janela" style="left:0;top:0;width:${G.largura}px">${instancia(m.id, { pose: m.poseLimpa, fundo: true, largura: G.largura })}</div>`
      + `<span class="legenda-tile">${esc(m.nomeCampanha)}</span></div></div>`;
  }).join('');
  const vertical = bloco => (bloco.base !== undefined ? `bottom:${bloco.base}px` : `top:${bloco.topo}px`);
  const encerramento = `<section class="painel floresta pontos no-floresta ${painelFim}">`
    + `<h2 class="solto titulo ${tituloFim}" style="left:${F.titulo[0]}px;top:${F.titulo[1]}px;font-size:${F.titulo[2]}px">${linhas('Qual combina com\na sua ideia?')}</h2>`
    + `<div class="camada">${tiles}</div>`
    + `<img class="solto ${marcaFim}" src="${logo(true)}" alt="" style="left:${F.logo.x}px;${vertical(F.logo)};width:${F.logo.largura}px">`
    + `<div class="solto ${chamadaFim}" style="right:${F.chamada.direita}px;${vertical(F.chamada)};text-align:right">`
    + `<p style="font-size:${F.chamada.tam[0]}px;font-weight:600;color:var(--menta)">${esc(carrossel[6].chamada)}</p>`
    + `<p class="endereco" style="font-size:${F.chamada.tam[1]}px;color:var(--lima)">${endereco}</p></div>`
    + '</section>';

  const corpo = `<main class="palco papel pontos">`
    + `<div class="camada">${demos}</div>`
    + `<div class="${mostraProgresso}">${progresso}</div>`
    + abertura
    + encerramento
    + '</main>';
  const css = CSS_VIDEO + tl.css();
  return { html: documento({ largura, altura, css, corpo }), sinais: sinais.sort((a, b) => a.t - b.t), trilhas: tl.trilhas() };
}

/** Páginas dos dois vídeos, com os sinais sonoros derivados dos mesmos tempos das animações. */
export function paginasDeVideo() {
  return [
    { nome: 'feed', grupo: 'video-feed', formato: formatos.feed, ...montarVideo('feed', LAYOUTS.feed) },
    { nome: 'story', grupo: 'story', formato: formatos.story, ...montarVideo('story', LAYOUTS.story) }
  ];
}
